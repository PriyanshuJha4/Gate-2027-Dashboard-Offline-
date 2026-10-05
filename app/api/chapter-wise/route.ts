import { NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";

// Always read the live database. Without this, `next build` runs this GET once and `next start` keeps serving that snapshot.
export const dynamic = "force-dynamic";

const initDb = initDatabase;

export async function GET() {
  try {
    await initDb();
    const result = await db.execute("SELECT * FROM chapter_wise_resources");
    const formattedRows = result.rows.map((row: any) => ({
      id: row.id,
      subject: row.subject,
      chapter: row.chapter,
      title: row.title,
      locationType: row.location_type,
      pathOrUrl: row.path_or_url,
      type: row.type,
    }));
    return NextResponse.json(formattedRows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await initDb();
    const body = await request.json();
    const { id, subject, chapter, title, locationType, pathOrUrl, type } = body;

    await db.execute({
      sql: `INSERT OR REPLACE INTO chapter_wise_resources (id, subject, chapter, title, location_type, path_or_url, type) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, subject, chapter, title, locationType, pathOrUrl, type],
    });

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

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    await db.execute({
      sql: `DELETE FROM chapter_wise_resources WHERE id = ?`,
      args: [id],
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}