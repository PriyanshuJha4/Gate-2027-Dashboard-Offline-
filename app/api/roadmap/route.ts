import { NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";

// Always read the live database. Without this, `next build` runs this GET once and `next start` keeps serving that snapshot.
export const dynamic = "force-dynamic";

const initDb = initDatabase;

export async function GET() {
  try {
    await initDb();
    const result = await db.execute("SELECT * FROM roadmap_schedule");
    let scheduleData = null;
    
    if (result.rows.length > 0) {
      const row = result.rows[0] as any;
      try {
        scheduleData = JSON.parse(row.data);
      } catch {
        scheduleData = row.data;
      }
    }

    return NextResponse.json({ data: scheduleData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await initDb();
    const body = await request.json();
    const { data } = body;
    const scheduleId = "main_schedule";

    const jsonString = typeof data === "string" ? data : JSON.stringify(data);

    await db.execute({
      sql: `INSERT INTO roadmap_schedule (id, data, updated_at) 
            VALUES (?, ?, ?) 
            ON CONFLICT(id) DO UPDATE SET 
              data = ?, 
              updated_at = ?`,
      args: [scheduleId, jsonString, new Date().toISOString(), jsonString, new Date().toISOString()],
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}