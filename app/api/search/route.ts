import { NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/search?q=deadlock&limit=6
//  -> { q, tooShort, limit, failed: string[], groups: [{ key, label, more, items: [{ id, title, subtitle, href }] }] }
//
// Searches (case-insensitive for English letters, substring match):
//   error_logs ............ question, topic, reason
//   cards ................. front, back, topic
//   study_links ........... title, url, category
//   pdfs .................. title
//   library_resources ..... title, category
//   subject_wise_resources  title, subject
//   chapter_wise_resources  title, subject, chapter
//
// Safety: the text goes in only as a bound parameter (never glued into the SQL), and the user's own
// % and _ (and \) are escaped, so searching for "100%" or "a_b" finds exactly that text.

const MIN_CHARS = 2;
const MAX_CHARS = 100;
const DEFAULT_LIMIT = 6;
const MIN_LIMIT = 5;
const MAX_LIMIT = 8;

/** Make user text literal inside LIKE ... ESCAPE '\' : \ % _ get a backslash in front. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => "\\" + ch);
}

const clip = (v: unknown, n: number) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};
const join = (...parts: unknown[]) => parts.map((p) => String(p ?? "").trim()).filter(Boolean).join(" · ");

type Item = { id: string; title: string; subtitle: string; href: string };
type GroupDef = {
  key: string;
  label: string;
  /** columns that are searched (any of them may match) */
  table: string;
  columns: string[];
  /** columns to read (never the big ones: images, front_image, source_json ...) */
  select: string;
  order: string;
  map: (r: any) => Item;
};

const GROUPS: GroupDef[] = [
  {
    key: "errors",
    label: "Error log",
    table: "error_logs",
    columns: ["question", "topic", "reason"],
    select: "id, question, topic, subject, reason",
    order: "COALESCE(created_at, '') DESC, rowid DESC",
    map: (r) => ({
      id: String(r.id),
      title: clip(r.question, 140) || clip(r.topic, 140) || "(no question text)",
      subtitle: join(r.subject, r.topic, clip(r.reason, 60)),
      href: "/error-log",
    }),
  },
  {
    key: "cards",
    label: "Flashcards",
    table: "cards",
    columns: ["front", "back", "topic"],
    select: "id, front, back, topic, subject",
    order: "COALESCE(created_at, '') DESC, rowid DESC",
    map: (r) => ({
      id: String(r.id),
      title: clip(r.front, 140) || "(image card)",
      subtitle: join(r.subject, r.topic, clip(r.back, 60)),
      href: "/flashcards",
    }),
  },
  {
    key: "links",
    label: "Links",
    table: "study_links",
    columns: ["title", "url", "category"],
    select: "id, title, url, category",
    order: "title COLLATE NOCASE ASC",
    map: (r) => ({
      id: String(r.id),
      title: clip(r.title, 140),
      subtitle: join(r.category, clip(r.url, 80)),
      href: "/study-links",
    }),
  },
  {
    key: "pdfs",
    label: "PDFs / Notes",
    table: "pdfs",
    columns: ["title"],
    select: "id, title, subject, chapter",
    order: "title COLLATE NOCASE ASC",
    map: (r) => ({
      id: String(r.id),
      title: clip(r.title, 140),
      subtitle: join(r.subject, r.chapter),
      href: `/notes?pdf=${encodeURIComponent(String(r.id))}`, // opens the PDF straight away
    }),
  },
  {
    key: "library",
    label: "Library",
    table: "library_resources",
    columns: ["title", "category"],
    select: "id, title, category",
    order: "title COLLATE NOCASE ASC",
    map: (r) => ({ id: String(r.id), title: clip(r.title, 140), subtitle: join(r.category), href: "/library" }),
  },
  {
    key: "subject",
    label: "Subject-wise resources",
    table: "subject_wise_resources",
    columns: ["title", "subject"],
    select: "id, title, subject",
    order: "title COLLATE NOCASE ASC",
    map: (r) => ({
      id: String(r.id),
      title: clip(r.title, 140),
      subtitle: join(r.subject),
      href: "/library/subject-wise",
    }),
  },
  {
    key: "chapter",
    label: "Chapter-wise resources",
    table: "chapter_wise_resources",
    columns: ["title", "subject", "chapter"],
    select: "id, title, subject, chapter",
    order: "title COLLATE NOCASE ASC",
    map: (r) => ({
      id: String(r.id),
      title: clip(r.title, 140),
      subtitle: join(r.subject, r.chapter),
      href: "/library/chapter-wise",
    }),
  },
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim().slice(0, MAX_CHARS);
    const limit = Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(Number(searchParams.get("limit"))) || DEFAULT_LIMIT));

    // count real characters (an emoji or a Hindi letter is one character, not two)
    if ([...q].length < MIN_CHARS) {
      return NextResponse.json({ q, tooShort: true, min: MIN_CHARS, limit, failed: [], groups: [] });
    }

    await initDatabase();
    const pattern = `%${escapeLike(q)}%`;
    const failed: string[] = [];

    const results = await Promise.all(
      GROUPS.map(async (g) => {
        try {
          // `columns`, `table`, `select`, `order` are fixed strings from the list above, never user input
          const where = g.columns.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(" OR ");
          const res = await db.execute({
            sql: `SELECT ${g.select} FROM ${g.table} WHERE ${where} ORDER BY ${g.order} LIMIT ?`,
            args: [...g.columns.map(() => pattern), limit + 1], // one extra row only to know if there is more
          });
          const rows = res.rows as any[];
          return { key: g.key, label: g.label, more: rows.length > limit, items: rows.slice(0, limit).map(g.map) };
        } catch (e) {
          console.error(`search: ${g.key} failed`, e);
          failed.push(g.label);
          return { key: g.key, label: g.label, more: false, items: [] as Item[] };
        }
      }),
    );

    return NextResponse.json({
      q,
      tooShort: false,
      min: MIN_CHARS,
      limit,
      failed, // groups that could not be searched (shown as a warning, never silently hidden)
      groups: results.filter((g) => g.items.length > 0),
    });
  } catch (error: any) {
    console.error("search error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
