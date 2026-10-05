import { NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";

// Always read the live database. Without this, `next build` runs this GET once and `next start` keeps serving that snapshot.
export const dynamic = "force-dynamic";

const initDb = initDatabase;

export async function GET() {
  try {
    await initDb();
    const result = await db.execute("SELECT * FROM study_links ORDER BY created_at DESC");
    return NextResponse.json(result.rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await initDb();
    const body = await request.json();
    const { id, title, url, category } = body;

    const linkId = id || `link_${Date.now()}`;

    await db.execute({
      sql: `INSERT OR REPLACE INTO study_links (id, title, url, category, created_at) VALUES (?, ?, ?, ?, ?)`,
      args: [linkId, title, url, category || "General", new Date().toISOString()],
    });

    return NextResponse.json({ success: true, id: linkId });
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

    await db.execute({
      sql: `DELETE FROM study_links WHERE id = ?`,
      args: [id],
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}