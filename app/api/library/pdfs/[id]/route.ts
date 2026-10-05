import { NextRequest, NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";
import fs from "fs";
import path from "path";
import { PDF_DIR, resolvePdfPath } from "@/lib/paths";
import { topicIdByName } from "@/lib/topics";

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
      sql: `UPDATE pdfs SET title = ?, subject = ?, chapter = ?, topic_id = ?, last_page = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [newTitle, newSubject, newChapter, topicIdByName(newChapter, newSubject), newLastPage, id],
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE PDF, move its physical file to trash folder, and clean database
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initDatabase();
    const { id } = params;

    const result = await db.execute({
      sql: `SELECT relative_path FROM pdfs WHERE id = ?`,
      args: [id],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "PDF not found" }, { status: 404 });
    }

    const relativePath = result.rows[0].relative_path as string;

    // Move physical file to trash folder instead of permanent deletion
    if (relativePath) {
      const fullPath = resolvePdfPath(relativePath);
      if (fullPath && fs.existsSync(fullPath)) {
        const trash = path.join(PDF_DIR, "_trash");
        fs.mkdirSync(trash, { recursive: true });
        fs.renameSync(
          fullPath,
          path.join(trash, `${Date.now()}_${path.basename(fullPath)}`)
        );
      }
    }

    // Delete from SQLite database (Foreign key constraints handle annotations and bookmarks if configured, else delete explicitly)
    await db.execute({ sql: `DELETE FROM pdf_annotations WHERE pdf_id = ?`, args: [id] });
    await db.execute({ sql: `DELETE FROM pdf_bookmarks WHERE pdf_id = ?`, args: [id] });
    await db.execute({ sql: `DELETE FROM pdfs WHERE id = ?`, args: [id] });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}