import { NextRequest, NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";

// Always read the live database. Without this, `next build` runs this GET once and `next start` keeps serving that snapshot.
export const dynamic = "force-dynamic";

// GET all review days (for streak calculations)
export async function GET() {
  try {
    await initDatabase();
    const result = await db.execute("SELECT date, count FROM reviews ORDER BY date DESC");
    return NextResponse.json({ reviews: result.rows });
  } catch (error: any) {
    console.error("Get Reviews Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST / Record a review for today
export async function POST(req: NextRequest) {
  try {
    await initDatabase();
    const body = await req.json();
    const { date } = body;

    if (!date) {
      return NextResponse.json({ error: "date parameter is required" }, { status: 400 });
    }

    // Check if record exists for this date, then increment count or insert 1
    await db.execute({
      sql: `INSERT INTO reviews (date, count) VALUES (?, 1)
            ON CONFLICT(date) DO UPDATE SET count = count + 1`,
      args: [date],
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Record Review Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}