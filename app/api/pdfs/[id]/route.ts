import { NextRequest, NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";

// GET single PDF metadata
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initDatabase();
    const { id } = params;

    const result = await db.execute({
      sql: `SELECT * FROM pdfs WHERE id = ?`,
      args: [id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "PDF not found" }, { status: 404 });
    }

    const row = result.rows[0];
    const pdf = {
      id: row.id,
      name: row.title,
      originalName: row.original_filename,
      relativePath: row.relative_path,
      subject: row.subject,
      chapter: row.chapter,
      size: row.file_size,
      addedAt: row.created_at,
      lastPage: row.last_page,
    };

    return NextResponse.json({ pdf });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH update PDF metadata (e.g., lastPage, title, etc.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initDatabase();
    const { id } = params;
    const body = await req.json();
    const { title, subject, chapter, lastPage } = body;

    const existing = await db.execute({
      sql: `SELECT * FROM pdfs WHERE id = ?`,
      args: [id],
    });

    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "PDF not found" }, { status: 404 });
    }

    const row = existing.rows[0];
    const newTitle = title || row.title;
    const newSubject = subject || row.subject;
    const newChapter = chapter || row.chapter;
    const newLastPage = lastPage !== undefined ? lastPage : row.last_page;

    await db.execute({
      sql: `UPDATE pdfs SET title = ?, subject = ?, chapter = ?, last_page = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [newTitle, newSubject, newChapter, newLastPage, id],
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE is intentionally disabled: Resource Root is the only source of truth.
export async function DELETE() {
  return NextResponse.json(
    { error: "PDF deletion is disabled here. Manage the source PDF in Resource Root and run Sync Library." },
    { status: 410 },
  );
}
