import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db, initDatabase } from "@/lib/db";
import { todayStr } from "@/lib/countdown";
import { TOPIC_BY_ID } from "@/lib/topics";
import { SESSION_KINDS, computeStreaks, type SessionKind } from "@/lib/studySessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SESSION_SEC = 12 * 60 * 60; // sanity cap: nobody focuses 12h in one block
const RECENT_LIMIT = 15;

// GET /api/study-sessions
//   -> everything the /timer page needs in ONE request:
//      heatmap days (focus seconds per date), streaks, today's numbers, per-subject totals, recent sessions.
export async function GET() {
  try {
    await initDatabase();
    const today = todayStr();

    const dayRes = await db.execute(
      "SELECT date, SUM(duration_sec) AS sec FROM study_sessions WHERE kind = 'focus' GROUP BY date",
    );
    const days: Record<string, number> = {};
    for (const r of dayRes.rows as any[]) days[String(r.date)] = Number(r.sec) || 0;

    const todayRes = await db.execute({
      sql: "SELECT COALESCE(SUM(duration_sec), 0) AS sec, COUNT(*) AS n FROM study_sessions WHERE kind = 'focus' AND date = ?",
      args: [today],
    });
    const t: any = todayRes.rows[0];

    const totalRes = await db.execute(
      "SELECT COALESCE(SUM(duration_sec), 0) AS sec, COUNT(*) AS n FROM study_sessions WHERE kind = 'focus'",
    );
    const tot: any = totalRes.rows[0];

    const subjRes = await db.execute(
      `SELECT COALESCE(NULLIF(subject, ''), 'Unassigned') AS subject, SUM(duration_sec) AS sec, COUNT(*) AS n
         FROM study_sessions WHERE kind = 'focus'
         GROUP BY COALESCE(NULLIF(subject, ''), 'Unassigned')
         ORDER BY sec DESC`,
    );

    const recentRes = await db.execute({
      sql: `SELECT id, date, subject, topic_id, duration_sec, kind, created_at
              FROM study_sessions ORDER BY COALESCE(created_at, date) DESC, rowid DESC LIMIT ?`,
      args: [RECENT_LIMIT],
    });

    return NextResponse.json({
      today,
      days,
      streak: computeStreaks(days, today),
      todayStats: { focus_sec: Number(t?.sec) || 0, sessions: Number(t?.n) || 0 },
      totals: {
        focus_sec: Number(tot?.sec) || 0,
        sessions: Number(tot?.n) || 0,
        active_days: Object.keys(days).length,
      },
      bySubject: (subjRes.rows as any[]).map((r) => ({
        subject: String(r.subject),
        focus_sec: Number(r.sec) || 0,
        sessions: Number(r.n) || 0,
      })),
      recent: (recentRes.rows as any[]).map((r) => ({
        id: String(r.id),
        date: String(r.date),
        subject: String(r.subject ?? ""),
        topic_id: r.topic_id ? String(r.topic_id) : null,
        duration_sec: Number(r.duration_sec) || 0,
        kind: String(r.kind),
        created_at: r.created_at ? String(r.created_at) : null,
      })),
    });
  } catch (error: any) {
    console.error("study-sessions GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/study-sessions   { id?, date?, subject?, topic_id?, duration_sec, kind? }
// The client sends its own `id`; INSERT OR IGNORE makes retries / two open tabs harmless
// (the same finished session can never be counted twice).
export async function POST(request: Request) {
  try {
    await initDatabase();
    const body = await request.json();

    const duration = Math.round(Number(body?.duration_sec));
    if (!Number.isFinite(duration) || duration < 1 || duration > MAX_SESSION_SEC) {
      return NextResponse.json({ error: "duration_sec must be between 1 and 43200" }, { status: 400 });
    }

    const kind: SessionKind = body?.kind ?? "focus";
    if (!SESSION_KINDS.includes(kind)) {
      return NextResponse.json({ error: "invalid kind" }, { status: 400 });
    }

    const date = typeof body?.date === "string" && DATE_RE.test(body.date) ? body.date : todayStr();

    // topic_id must be a real topic; its subject fills in `subject` when the client sent none
    const rawTopic = typeof body?.topic_id === "string" ? body.topic_id : "";
    const topic = rawTopic ? TOPIC_BY_ID.get(rawTopic) : undefined;
    const topicId = topic ? topic.id : null;
    let subject = typeof body?.subject === "string" ? body.subject.trim().slice(0, 120) : "";
    if (!subject && topic) subject = topic.subject;

    const id =
      typeof body?.id === "string" && body.id.length > 0 && body.id.length <= 64 ? body.id : randomUUID();

    const res = await db.execute({
      sql: `INSERT OR IGNORE INTO study_sessions (id, date, subject, topic_id, duration_sec, kind, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, date, subject, topicId, duration, kind, new Date().toISOString()],
    });

    return NextResponse.json({ success: true, id, inserted: res.rowsAffected > 0 });
  } catch (error: any) {
    console.error("study-sessions POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/study-sessions?id=...   (remove a wrongly logged session)
export async function DELETE(request: Request) {
  try {
    await initDatabase();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await db.execute({ sql: "DELETE FROM study_sessions WHERE id = ?", args: [id] });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("study-sessions DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
