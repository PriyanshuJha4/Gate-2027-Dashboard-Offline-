import { NextRequest, NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";
import { storeCardImage, pruneCardImages, cardImageForClient } from "@/lib/shots";
import { topicIdByName } from "@/lib/topics";

// Always read the live database. Without this, `next build` runs this GET once and `next start` keeps serving that snapshot.
export const dynamic = "force-dynamic";

// GET all flashcards
export async function GET() {
  try {
    await initDatabase();
    const result = await db.execute("SELECT * FROM cards ORDER BY created_at DESC");

    const cards = result.rows.map((row: any) => ({
      id: row.id,
      front: row.front,
      back: row.back,
      frontImage: cardImageForClient(row.front_image),
      subject: row.subject,
      topic: row.topic,
      source: row.source_json ? JSON.parse(row.source_json) : null,
      ease: row.ease,
      interval: row.interval,
      reps: row.reps,
      lapses: row.lapses,
      due: row.due,
      createdAt: row.created_at,
      lastReviewed: row.last_reviewed || "",
    }));

    return NextResponse.json({ cards });
  } catch (error: any) {
    console.error("Get Cards Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST / Save or update a flashcard
export async function POST(req: NextRequest) {
  try {
    await initDatabase();
    const body = await req.json();
    const {
      id,
      front,
      back,
      frontImage,
      subject: rawSubject,
      topic: rawTopic,
      source,
      ease,
      interval,
      reps,
      lapses,
      due,
      createdAt,
      lastReviewed,
    } = body;

    // A card made from a PDF crop has an image and NO front text, so the image counts as the question.
    // Empty subject / topic must not drop the card either: they fall back to a default and can be edited later.
    const hasFrontImage = typeof frontImage === "string" && frontImage !== "";
    const frontText = typeof front === "string" ? front : "";
    if (!id || !due || typeof back !== "string" || !back.trim() || (!frontText.trim() && !hasFrontImage)) {
      return NextResponse.json(
        { error: "Missing required flashcard fields (need an id, a due date, an answer, and a question text or image)" },
        { status: 400 },
      );
    }
    const subject = String(rawSubject ?? "").trim() || "Unsorted";
    const topic = String(rawTopic ?? "").trim() || "General";

    const sourceJson = source ? JSON.stringify(source) : null;
    // Cropped image goes to a file (screenshots/_cards/...); the database only keeps its path
    const imagePath = storeCardImage(String(id), frontImage);
    const topicId = topicIdByName(topic, subject);
    if (!frontText.trim() && !imagePath) {
      return NextResponse.json({ error: "The card image could not be saved to disk (check the screenshots folder permissions)" }, { status: 500 });
    }

    await db.execute({
      sql: `INSERT OR REPLACE INTO cards 
            (id, front, back, front_image, subject, topic, topic_id, source_json, ease, interval, reps, lapses, due, created_at, last_reviewed) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        frontText,
        back,
        imagePath,
        subject,
        topic,
        topicId,
        sourceJson,
        ease ?? 2.5,
        interval ?? 0,
        reps ?? 0,
        lapses ?? 0,
        due,
        createdAt || new Date().toISOString(),
        lastReviewed || "",
      ],
    });

    pruneCardImages(String(id), imagePath); // removes the previous image file when it was replaced / removed

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Save Card Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE a flashcard
export async function DELETE(req: NextRequest) {
  try {
    await initDatabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id parameter is required" }, { status: 400 });
    }

    await db.execute({
      sql: `DELETE FROM cards WHERE id = ?`,
      args: [id],
    });
    pruneCardImages(id, "");

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete Card Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}