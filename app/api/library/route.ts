import { NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";

// Always read the live database. Without this, `next build` runs this GET once and `next start` keeps serving that snapshot.
export const dynamic = "force-dynamic";

const initDb = initDatabase;

// GET: Database se saare resources laane ke liye
export async function GET() {
  try {
    await initDb();
    const result = await db.execute("SELECT * FROM library_resources");
    const formattedRows = result.rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      locationType: row.location_type,
      pathOrUrl: row.path_or_url,
      type: row.type,
    }));
    return NextResponse.json(formattedRows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Naya resource database mein insert ya update karne ke liye
export async function POST(request: Request) {
  try {
    await initDb();
    const body = await request.json();
    const { id, title, category, locationType, pathOrUrl, type } = body;

    await db.execute({
      sql: `INSERT OR REPLACE INTO library_resources (id, title, category, location_type, path_or_url, type) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, title, category || "Custom", locationType, pathOrUrl, type],
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Database se resource delete karne ke liye
export async function DELETE(request: Request) {
  try {
    await initDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    await db.execute({
      sql: `DELETE FROM library_resources WHERE id = ?`,
      args: [id],
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}