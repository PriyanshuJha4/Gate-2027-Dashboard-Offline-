import { NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";
import { toStoredImages, toClientImages, pruneEntryShots, removeEntryShots } from "@/lib/shots";
import { topicIdByName } from "@/lib/topics";
import { nextReviewDate } from "@/lib/errorReview";

// Always run on the Node.js runtime and never cache responses
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// initDatabase() also upgrades error_logs (lib/errorLogsSchema.ts) and runs the one-time migrations
const initDb = initDatabase;

function todayLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function safeParseImages(value: unknown) {
  if (!value || typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    await initDb();
    const result = await db.execute(
      "SELECT * FROM error_logs ORDER BY log_date DESC, created_at DESC",
    );

    const rows = result.rows.map((row: any) => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      obj.images = toClientImages(safeParseImages(obj.images));
      return obj;
    });

    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await initDb();
    const body = await request.json();
    const {
      id,
      log_date,
      subject,
      topic,
      question,
      reason,
      images,
      source_url,
      my_answer,
      correct_answer,
      what_went_wrong,
      solution,
    } = body;

    if (!subject || !String(subject).trim()) {
      return NextResponse.json({ error: "Subject is required" }, { status: 400 });
    }

    const logId = id ? String(id) : `err_${Date.now()}`;
    // Screenshots are written to files (screenshots/<id>/...); the DB only keeps the paths.
    const storedImages = toStoredImages(logId, images);
    const imagesJson = JSON.stringify(storedImages);
    const topicId = topicIdByName(topic, subject);

    // Legacy columns are filled with sensible values for backward compatibility
    const legacyMistake = reason || what_went_wrong || "General Mistake";
    const legacyCorrectConcept = solution || correct_answer || "";

    // Upsert: updates the row on edit but keeps the original created_at
    await db.execute({
      sql: `INSERT INTO error_logs
              (id, log_date, subject, topic, topic_id, question, reason, mistake, correct_concept,
               images, source_url, my_answer, correct_answer, what_went_wrong, solution, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              log_date = excluded.log_date,
              subject = excluded.subject,
              topic = excluded.topic,
              topic_id = excluded.topic_id,
              question = excluded.question,
              reason = excluded.reason,
              mistake = excluded.mistake,
              correct_concept = excluded.correct_concept,
              images = excluded.images,
              source_url = excluded.source_url,
              my_answer = excluded.my_answer,
              correct_answer = excluded.correct_answer,
              what_went_wrong = excluded.what_went_wrong,
              solution = excluded.solution`,
      args: [
        logId,
        log_date || todayLocal(),
        String(subject),
        topic || "",
        topicId,
        question || "",
        reason || "",
        legacyMistake,
        legacyCorrectConcept,
        imagesJson,
        source_url || "",
        my_answer || "",
        correct_answer || "",
        what_went_wrong || "",
        solution || "",
        new Date().toISOString(),
      ],
    });

    // Delete files of screenshots that were removed while editing
    pruneEntryShots(logId, storedImages.map((i) => i.path));

    return NextResponse.json({ success: true, id: logId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Revision progress: mark an entry as mastered / reviewed (does not touch the content)
export async function PATCH(request: Request) {
  try {
    await initDb();
    const body = await request.json();
    const { id, mastered, mark_reviewed } = body;

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const sets: string[] = [];
    const args: any[] = [];
    // undefined = leave next_review untouched, null = clear it (entry is due again)
    let nextReview: string | null | undefined;

    if (typeof mastered === "boolean") {
      sets.push("mastered = ?");
      args.push(mastered ? 1 : 0);
      // "Undo mastered" -> the entry needs revising again, so it becomes due right away
      if (!mastered) nextReview = null;
    }

    if (mark_reviewed === true) {
      const today = todayLocal();
      const cur = await db.execute({
        sql: "SELECT review_count FROM error_logs WHERE id = ?",
        args: [String(id)],
      });
      const newCount = (Number(cur.rows[0]?.review_count) || 0) + 1;

      sets.push("review_count = COALESCE(review_count, 0) + 1");
      sets.push("last_reviewed = ?");
      args.push(today);
      // Gap grows with every review: 1 -> 3 -> 7 -> 14 -> 30 days (lib/errorReview.ts)
      nextReview = nextReviewDate(newCount, today);
    }

    if (nextReview !== undefined) {
      sets.push("next_review = ?");
      args.push(nextReview);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    args.push(String(id));

    const result = await db.execute({
      sql: `UPDATE error_logs SET ${sets.join(", ")} WHERE id = ?`,
      args,
    });

    if (result.rowsAffected === 0) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await initDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    await db.execute({
      sql: `DELETE FROM error_logs WHERE id = ?`,
      args: [id],
    });
    removeEntryShots(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}