import { NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";
import { parseMockPayload, type MockSection, type MockTopicLoss } from "@/lib/mockScoring";
import { TOPIC_BY_ID } from "@/lib/topics";

export const dynamic = "force-dynamic"; // never serve a build-time snapshot

const initDb = initDatabase;

// GET: every test with its sections and topic losses.
// score / max_score keep their old meaning (net score), so DashboardHeader needs no change.
export async function GET() {
  try {
    await initDb();
    const tests = await db.execute("SELECT * FROM mock_tests ORDER BY test_date ASC, created_at ASC");
    const secRows = await db.execute("SELECT * FROM mock_test_sections ORDER BY rowid ASC");
    const lossRows = await db.execute("SELECT * FROM mock_test_topic_loss ORDER BY marks_lost DESC");

    const secBy = new Map<string, MockSection[]>();
    for (const r of secRows.rows as any[]) {
      const key = String(r.test_id);
      const list = secBy.get(key) || [];
      list.push({
        name: String(r.name),
        attempted: Number(r.attempted) || 0,
        correct: Number(r.correct) || 0,
        wrong: Number(r.wrong) || 0,
        marks: Number(r.marks) || 0,
        neg_marks: Number(r.neg_marks) || 0,
        time_min: Number(r.time_min) || 0,
      });
      secBy.set(key, list);
    }
    const lossBy = new Map<string, MockTopicLoss[]>();
    for (const r of lossRows.rows as any[]) {
      const key = String(r.test_id);
      const list = lossBy.get(key) || [];
      list.push({ topic_id: String(r.topic_id), marks_lost: Number(r.marks_lost) || 0, reason: String(r.reason ?? "") });
      lossBy.set(key, list);
    }

    const data = (tests.rows as any[]).map((row) => ({
      id: row.id,
      test_date: row.test_date,
      subject: row.subject,
      score: Number(row.score),
      max_score: Number(row.max_score),
      // new fields (old rows have NULLs; the UI falls back to `subject`)
      test_name: row.test_name ? String(row.test_name) : null,
      duration_min: row.duration_min === null || row.duration_min === undefined ? null : Number(row.duration_min),
      negative_marks: Number(row.negative_marks) || 0,
      sections: secBy.get(String(row.id)) || [],
      topic_losses: lossBy.get(String(row.id)) || [],
    }));
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: create or update one test.
//  - body with only {id, test_date, subject, score, max_score} behaves like before
//  - `sections` present  -> replaces the saved sections; score + negative_marks are computed from them
//  - `topic_losses` present -> replaces the saved topic losses
//  - key missing         -> that part is left untouched
export async function POST(request: Request) {
  try {
    await initDb();
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = parseMockPayload(body, { knownTopic: (id) => TOPIC_BY_ID.has(id) });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const p = parsed.value;

    const tx = await db.transaction("write");
    try {
      const prevRes = await tx.execute({ sql: "SELECT * FROM mock_tests WHERE id = ?", args: [p.id] });
      const prev = prevRes.rows[0] as any | undefined;

      const test_name = p.test_name !== undefined ? p.test_name : prev?.test_name ?? null;
      const duration_min = p.duration_min !== undefined ? p.duration_min : prev?.duration_min ?? null;
      const negative_marks = p.negative_marks !== undefined ? p.negative_marks : Number(prev?.negative_marks) || 0;

      // UPSERT, not INSERT OR REPLACE: REPLACE would delete the row first and could wipe the child tables.
      await tx.execute({
        sql: `INSERT INTO mock_tests (id, test_date, subject, score, max_score, created_at, test_name, duration_min, negative_marks)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                test_date = excluded.test_date,
                subject = excluded.subject,
                score = excluded.score,
                max_score = excluded.max_score,
                test_name = excluded.test_name,
                duration_min = excluded.duration_min,
                negative_marks = excluded.negative_marks`,
        args: [p.id, p.test_date, p.subject, p.score, p.max_score, new Date().toISOString(), test_name, duration_min, negative_marks],
      });

      if (p.sections) {
        await tx.execute({ sql: "DELETE FROM mock_test_sections WHERE test_id = ?", args: [p.id] });
        for (const s of p.sections) {
          await tx.execute({
            sql: `INSERT INTO mock_test_sections (test_id, name, attempted, correct, wrong, marks, neg_marks, time_min)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [p.id, s.name, s.attempted, s.correct, s.wrong, s.marks, s.neg_marks, s.time_min],
          });
        }
      }

      if (p.topic_losses) {
        await tx.execute({ sql: "DELETE FROM mock_test_topic_loss WHERE test_id = ?", args: [p.id] });
        for (const l of p.topic_losses) {
          await tx.execute({
            sql: `INSERT INTO mock_test_topic_loss (test_id, topic_id, marks_lost, reason) VALUES (?, ?, ?, ?)`,
            args: [p.id, l.topic_id, l.marks_lost, l.reason],
          });
        }
      }

      await tx.commit();
    } catch (e) {
      await tx.rollback().catch(() => {});
      throw e;
    } finally {
      tx.close();
    }

    return NextResponse.json({ success: true, score: p.score, negative_marks: p.negative_marks });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await initDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const tx = await db.transaction("write");
    try {
      // children first (the foreign keys would cascade anyway, this just keeps it explicit)
      await tx.execute({ sql: "DELETE FROM mock_test_sections WHERE test_id = ?", args: [id] });
      await tx.execute({ sql: "DELETE FROM mock_test_topic_loss WHERE test_id = ?", args: [id] });
      await tx.execute({ sql: "DELETE FROM mock_tests WHERE id = ?", args: [id] });
      await tx.commit();
    } catch (e) {
      await tx.rollback().catch(() => {});
      throw e;
    } finally {
      tx.close();
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
