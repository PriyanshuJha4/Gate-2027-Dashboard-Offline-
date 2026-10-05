import { NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";
import { todayStr } from "@/lib/countdown";
import { topicById, topicIdByName } from "@/lib/topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/topics/<topicId>/resources
//   -> the PDFs and flashcards that belong to one syllabus topic (used by the Syllabus Tracker popover).
//
// Matching is done in code, with the same function every other page uses:
//   topicIdByName(row.topic / row.chapter, row.subject) === topicId
// so any old spelling ("Dead Lock" / "Deadlock") lands on the same topic.
// Heavy columns (front_image, source_json, annotations) are never selected.
export async function GET(_req: Request, { params }: { params: { topicId: string } }) {
  try {
    const topicId = decodeURIComponent(params.topicId || "");
    const topic = topicById(topicId);
    if (!topic) return NextResponse.json({ error: "Unknown topic" }, { status: 404 });

    await initDatabase();
    const today = todayStr();

    const pdfRes = await db.execute("SELECT id, title, subject, chapter, last_page FROM pdfs");
    const pdfs = (pdfRes.rows as any[])
      .filter((r) => topicIdByName(r.chapter, r.subject) === topicId)
      .map((r) => ({
        id: String(r.id),
        title: String(r.title ?? ""),
        subject: String(r.subject ?? ""),
        chapter: String(r.chapter ?? ""),
        lastPage: Number(r.last_page) || 1,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));

    const cardRes = await db.execute("SELECT subject, topic, due, reps, last_reviewed FROM cards");
    let total = 0;
    let due = 0;
    let fresh = 0;
    for (const r of cardRes.rows as any[]) {
      if (topicIdByName(r.topic, r.subject) !== topicId) continue;
      total++;
      // same rules as the flashcards pages: due <= today, "new" = never reviewed
      if (String(r.due) <= today) due++;
      if (Number(r.reps) === 0 && !r.last_reviewed) fresh++;
    }

    return NextResponse.json({
      topicId,
      name: topic.name,
      subject: topic.subject,
      pdfs,
      cards: { total, due, new: fresh },
    });
  } catch (error: any) {
    console.error("topic resources error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
