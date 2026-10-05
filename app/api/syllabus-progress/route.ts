import { NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";

const initDb = initDatabase;

export async function GET(request: Request) {
  try {
    await initDb();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "default_user";

    const result = await db.execute({
      sql: `SELECT topic_key, completed FROM syllabus_progress WHERE user_id = ?`,
      args: [userId],
    });

    const progressMap: Record<string, boolean> = {};
    result.rows.forEach((row: any) => {
      if (row.completed) {
        progressMap[row.topic_key] = true;
      }
    });

    return NextResponse.json(progressMap);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await initDb();
    const body = await request.json();
    const { userId = "default_user", topicKey, completed } = body;

    const id = `${userId}_${topicKey}`;

    await db.execute({
      sql: `INSERT OR REPLACE INTO syllabus_progress (id, user_id, topic_key, completed, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [id, userId, topicKey, completed ? 1 : 0, new Date().toISOString()],
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}