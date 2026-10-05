import { NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";
import { todayStr } from "@/lib/countdown";
import { TOPIC_BY_ID, topicById } from "@/lib/topics";
import { LEECH_LAPSES, computeWeakTopics, type WeakTopic } from "@/lib/weakTopics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCES = new Set(["weak_topic", "manual"]);
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function dateOrToday(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return todayStr();
  const s = String(v);
  return DATE_RE.test(s) ? s : null;
}

// GET /api/weak-topics?limit=10&date=YYYY-MM-DD
//  -> { date, topics: ranked weak topics (with inPlan), plan: the topics queued for that day }
export async function GET(request: Request) {
  try {
    await initDatabase();
    const { searchParams } = new URL(request.url);
    const date = dateOrToday(searchParams.get("date"));
    if (!date) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(searchParams.get("limit"))) || DEFAULT_LIMIT));
    const today = todayStr();

    // `images` is not selected on purpose: it can be large and is not needed here.
    const [errRes, cardRes, lossRes, planRes] = await Promise.all([
      db.execute("SELECT topic_id, topic, subject, mastered, next_review FROM error_logs"),
      db.execute({
        sql: "SELECT topic_id, topic, subject, lapses FROM cards WHERE lapses >= ?",
        args: [LEECH_LAPSES],
      }),
      db.execute(
        `SELECT l.topic_id AS topic_id, l.marks_lost AS marks_lost, l.reason AS reason, t.test_date AS test_date
           FROM mock_test_topic_loss l JOIN mock_tests t ON t.id = l.test_id`,
      ),
      db.execute({
        sql: "SELECT topic_id, source, done FROM daily_plan_items WHERE date = ? ORDER BY rowid ASC",
        args: [date],
      }),
    ]);

    const all = computeWeakTopics({
      errors: errRes.rows as any[],
      cards: cardRes.rows as any[],
      losses: (lossRes.rows as any[]).map((r) => ({
        topic_id: String(r.topic_id),
        marks_lost: Number(r.marks_lost) || 0,
        reason: r.reason ? String(r.reason) : "",
        test_date: String(r.test_date),
      })),
      today,
    });
    const byId = new Map<string, WeakTopic>(all.map((w) => [w.topic_id, w]));

    const planRows = (planRes.rows as any[]).map((r) => ({
      topic_id: String(r.topic_id),
      source: String(r.source || "weak_topic"),
      done: Number(r.done) === 1,
    }));
    const inPlan = new Set(planRows.map((p) => p.topic_id));

    const plan = planRows.map((p) => {
      const w = byId.get(p.topic_id);
      const t = topicById(p.topic_id);
      return {
        topic_id: p.topic_id,
        name: w?.name ?? t?.name ?? p.topic_id,
        subject: w?.subject ?? t?.subject ?? "",
        source: p.source,
        done: p.done,
        // a topic can stop being "weak" after you revised it; it stays in the plan with zeros
        score: w?.score ?? 0,
        pendingErrors: w?.pendingErrors ?? 0,
        markLost: w?.markLost ?? 0,
        leechCards: w?.leechCards ?? 0,
        reasons: w?.reasons ?? [],
      };
    });

    return NextResponse.json({
      date,
      total: all.length,
      topics: all.slice(0, limit).map((w) => ({ ...w, inPlan: inPlan.has(w.topic_id) })),
      plan,
    });
  } catch (error: any) {
    console.error("Weak topics API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST { topic_id, source?, date? } -> put the topic into that day's plan (default: today). Safe to repeat.
export async function POST(request: Request) {
  try {
    await initDatabase();
    const body = await request.json().catch(() => null);
    const topic_id = String(body?.topic_id ?? "").trim();
    if (!TOPIC_BY_ID.has(topic_id)) return NextResponse.json({ error: "Unknown topic" }, { status: 400 });
    const date = dateOrToday(body?.date);
    if (!date) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    const source = body?.source === undefined ? "weak_topic" : String(body.source);
    if (!SOURCES.has(source)) return NextResponse.json({ error: "Invalid source" }, { status: 400 });

    // DO NOTHING on a repeat: a second click must not un-tick a topic you already finished
    const res = await db.execute({
      sql: `INSERT INTO daily_plan_items (date, topic_id, source, done) VALUES (?, ?, ?, 0)
            ON CONFLICT(date, topic_id) DO NOTHING`,
      args: [date, topic_id, source],
    });
    return NextResponse.json({ success: true, date, added: res.rowsAffected > 0 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT { topic_id, done, date? } -> tick / un-tick a planned topic
export async function PUT(request: Request) {
  try {
    await initDatabase();
    const body = await request.json().catch(() => null);
    const topic_id = String(body?.topic_id ?? "").trim();
    if (!topic_id || typeof body?.done !== "boolean") {
      return NextResponse.json({ error: "topic_id and done (true/false) required" }, { status: 400 });
    }
    const date = dateOrToday(body?.date);
    if (!date) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

    const res = await db.execute({
      sql: "UPDATE daily_plan_items SET done = ? WHERE date = ? AND topic_id = ?",
      args: [body.done ? 1 : 0, date, topic_id],
    });
    if (res.rowsAffected === 0) return NextResponse.json({ error: "Not in the plan" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE ?topic_id=...&date=... -> take the topic out of that day's plan
export async function DELETE(request: Request) {
  try {
    await initDatabase();
    const { searchParams } = new URL(request.url);
    const topic_id = searchParams.get("topic_id");
    if (!topic_id) return NextResponse.json({ error: "topic_id required" }, { status: 400 });
    const date = dateOrToday(searchParams.get("date"));
    if (!date) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

    await db.execute({
      sql: "DELETE FROM daily_plan_items WHERE date = ? AND topic_id = ?",
      args: [date, topic_id],
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
