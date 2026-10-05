import { NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";

// Always read the live database. Without this, `next build` runs this GET once and `next start` keeps serving that snapshot.
export const dynamic = "force-dynamic";

const initDb = initDatabase;

export async function GET() {
  try {
    await initDb();
    const result = await db.execute("SELECT * FROM todo_list");
    const todoMap: Record<string, boolean> = {};
    const taskMap: Record<string, string> = {};
    
    result.rows.forEach((row: any) => {
      if (row.completed) {
        todoMap[row.date] = true;
      }
      if (row.task) {
        taskMap[row.date] = row.task;
      }
    });

    return NextResponse.json({ tasks: result.rows, todoMap, taskMap });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await initDb();
    const body = await request.json();
    const { date, task, completed } = body;

    if (!date) {
      return NextResponse.json({ error: "date is required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const hasTask = typeof task === "string";
    const hasDone = completed !== undefined && completed !== null;

    // `task` is NOT NULL, so a "toggle only" request ({ date, completed }) must never INSERT a NULL task,
    // and `undefined` must never reach the driver. Insert with an empty task if the row is new, then
    // update only the field that was actually sent.
    await db.execute({
      sql: `INSERT INTO todo_list (date, task, completed, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
              task = CASE WHEN ? THEN excluded.task ELSE task END,
              completed = CASE WHEN ? THEN excluded.completed ELSE completed END,
              updated_at = excluded.updated_at`,
      args: [date, hasTask ? task : "", hasDone ? (completed ? 1 : 0) : 0, now, hasTask ? 1 : 0, hasDone ? 1 : 0],
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
