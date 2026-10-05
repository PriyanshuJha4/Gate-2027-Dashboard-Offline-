import fs from "fs";
import path from "path";
import crypto from "crypto";
import { db } from "@/lib/db";
import { PDF_DIR, resolvePdfPath } from "@/lib/paths";

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFKC")
    // Remove invisible Unicode formatting characters that can make two
    // visually identical folder names become different DB values.
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\\/g, "/")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hashFile(filePath: string) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function moveToTrash(relativePath: string) {
  if (!relativePath) return;
  const fullPath = resolvePdfPath(relativePath);
  if (!fullPath || !fs.existsSync(fullPath)) return;
  const trash = path.join(PDF_DIR, "_trash");
  fs.mkdirSync(trash, { recursive: true });
  const target = path.join(trash, `${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${path.basename(fullPath)}`);
  try { fs.renameSync(fullPath, target); } catch { /* keep DB cleanup even if an old file is inaccessible */ }
}

/**
 * Resource Root is the single source of truth for PDF identity.
 *
 * This cleanup intentionally does NOT collapse every PDF in a chapter into one.
 * Different PDFs are valid and remain visible. It only:
 *  - canonicalizes subject/chapter casing/whitespace, and
 *  - merges exact-content duplicates within the same normalized chapter.
 *
 * Existing annotations, bookmarks and flashcard sources are moved to the keeper
 * before the duplicate row is removed.
 */
export async function dedupeAndNormalizePdfs() {
  const result = await db.execute("SELECT * FROM pdfs ORDER BY created_at ASC, rowid ASC");
  const rows = result.rows as any[];
  const groups = new Map<string, any[]>();

  for (const row of rows) {
    const subject = String(row.subject || "Uncategorized").replace(/\s+/g, " ").trim() || "Uncategorized";
    const chapter = String(row.chapter || "General").replace(/\s+/g, " ").trim() || "General";
    const key = `${normalizeText(subject)}\n${normalizeText(chapter)}`;
    const group = groups.get(key) || [];
    group.push({ ...row, subject, chapter });
    groups.set(key, group);
  }

  let normalized = 0;
  let merged = 0;

  for (const group of groups.values()) {
    if (!group.length) continue;
    const canonicalSubject = group[0].subject;
    const canonicalChapter = group[0].chapter;

    for (const row of group) {
      if (row.subject !== canonicalSubject || row.chapter !== canonicalChapter) {
        await db.execute({
          sql: "UPDATE pdfs SET subject=?, chapter=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
          args: [canonicalSubject, canonicalChapter, row.id],
        });
        normalized++;
      }
    }

    const byContent = new Map<string, any>();
    for (const row of group) {
      const storedPath = resolvePdfPath(String(row.relative_path || ""));
      if (!storedPath || !fs.existsSync(storedPath)) continue;
      let hash = "";
      try { hash = hashFile(storedPath); } catch { continue; }
      const contentKey = `${Number(row.file_size || 0)}:${hash}`;
      const keeper = byContent.get(contentKey);
      if (!keeper) {
        byContent.set(contentKey, row);
        continue;
      }
      if (keeper.id === row.id) continue;

      // Move annotations/bookmarks to the canonical PDF id.
      const annotations = await db.execute({ sql: "SELECT key, page, items_json FROM pdf_annotations WHERE pdf_id=?", args: [row.id] });
      for (const ann of annotations.rows as any[]) {
        const existing = await db.execute({
          sql: "SELECT key FROM pdf_annotations WHERE pdf_id=? AND page=? LIMIT 1",
          args: [keeper.id, ann.page],
        });
        if (!existing.rows.length) {
          const key = `${keeper.id}:${ann.page}`;
          await db.execute({ sql: "UPDATE pdf_annotations SET key=?, pdf_id=?, updated_at=CURRENT_TIMESTAMP WHERE key=?", args: [key, keeper.id, ann.key] });
        } else {
          await db.execute({ sql: "DELETE FROM pdf_annotations WHERE key=?", args: [ann.key] });
        }
      }

      const bookmarks = await db.execute({ sql: "SELECT id, page, label FROM pdf_bookmarks WHERE pdf_id=?", args: [row.id] });
      for (const bm of bookmarks.rows as any[]) {
        const existing = await db.execute({
          sql: "SELECT id FROM pdf_bookmarks WHERE pdf_id=? AND page=? AND label=? LIMIT 1",
          args: [keeper.id, bm.page, bm.label],
        });
        if (!existing.rows.length) {
          await db.execute({ sql: "UPDATE pdf_bookmarks SET pdf_id=? WHERE id=?", args: [keeper.id, bm.id] });
        } else {
          await db.execute({ sql: "DELETE FROM pdf_bookmarks WHERE id=?", args: [bm.id] });
        }
      }

      // Flashcards keep the PDF id inside source_json.
      const cards = await db.execute({ sql: "SELECT id, source_json FROM cards WHERE source_json IS NOT NULL AND source_json LIKE ?", args: [`%${row.id}%`] });
      for (const card of cards.rows as any[]) {
        try {
          const source = JSON.parse(String(card.source_json || "null"));
          if (source && source.pdfId === row.id) {
            source.pdfId = keeper.id;
            await db.execute({ sql: "UPDATE cards SET source_json=? WHERE id=?", args: [JSON.stringify(source), card.id] });
          }
        } catch { /* unrelated/non-JSON source data */ }
      }

      moveToTrash(String(row.relative_path || ""));
      await db.execute({ sql: "DELETE FROM pdfs WHERE id=?", args: [row.id] });
      merged++;
    }
  }

  return { normalized, merged };
}
