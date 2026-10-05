import { NextRequest, NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";
import { cardImageForClient, toClientImages } from "@/lib/shots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Scope = "all" | "subject" | "chapter";

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

function matches(value: unknown, expected: string): boolean {
  return normalize(value).toLowerCase() === expected.toLowerCase();
}

function safeJsonParse(value: unknown, fallback: any = null) {
  if (!value || typeof value !== "string") return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function safeAnnotationItems(value: unknown): any[] {
  const parsed = safeJsonParse(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function safeImages(value: unknown): any[] {
  const parsed = safeJsonParse(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * GET
 *
 * Examples:
 *
 * /api/one-shot-revision?scope=all
 *
 * /api/one-shot-revision?scope=subject&subject=Operating%20Systems
 *
 * /api/one-shot-revision?scope=chapter&subject=Operating%20Systems&chapter=Process%20Management
 *
 * /api/one-shot-revision?mode=filters
 */
export async function GET(request: NextRequest) {
  try {
    await initDatabase();

    const { searchParams } = new URL(request.url);

    const mode = normalize(searchParams.get("mode"));
    const scope = (normalize(searchParams.get("scope")) || "all") as Scope;
    const subject = normalize(searchParams.get("subject"));
    const chapter = normalize(searchParams.get("chapter"));

    // ---------------------------------------------------------
    // FILTER DATA
    // ---------------------------------------------------------

    if (mode === "filters") {
      const [subjectsResult, chaptersResult] = await Promise.all([
        db.execute(`
          SELECT DISTINCT subject
          FROM (
            SELECT subject FROM pdfs
            UNION
            SELECT subject FROM cards
            UNION
            SELECT subject FROM error_logs
          )
          WHERE subject IS NOT NULL
            AND TRIM(subject) != ''
          ORDER BY subject COLLATE NOCASE
        `),

        db.execute(`
          SELECT DISTINCT subject, chapter AS value
          FROM pdfs
          WHERE subject IS NOT NULL
            AND TRIM(subject) != ''
            AND chapter IS NOT NULL
            AND TRIM(chapter) != ''

          UNION

          SELECT subject, topic AS value
          FROM cards
          WHERE subject IS NOT NULL
            AND TRIM(subject) != ''
            AND topic IS NOT NULL
            AND TRIM(topic) != ''

          UNION

          SELECT subject, topic AS value
          FROM error_logs
          WHERE subject IS NOT NULL
            AND TRIM(subject) != ''
            AND topic IS NOT NULL
            AND TRIM(topic) != ''

          ORDER BY subject COLLATE NOCASE, value COLLATE NOCASE
        `),
      ]);

      const subjects = subjectsResult.rows.map((row: any) =>
        normalize(row.subject)
      );

      const chapters = chaptersResult.rows.map((row: any) => ({
        subject: normalize(row.subject),
        value: normalize(row.value),
      }));

      return NextResponse.json({
        success: true,
        subjects,
        chapters,
      });
    }

    // ---------------------------------------------------------
    // VALIDATE SCOPE
    // ---------------------------------------------------------

    if (!["all", "subject", "chapter"].includes(scope)) {
      return NextResponse.json(
        {
          error:
            "Invalid scope. Use 'all', 'subject', or 'chapter'.",
        },
        { status: 400 }
      );
    }

    if (scope === "subject" && !subject) {
      return NextResponse.json(
        { error: "Subject is required for subject scope." },
        { status: 400 }
      );
    }

    if (scope === "chapter" && (!subject || !chapter)) {
      return NextResponse.json(
        {
          error:
            "Subject and chapter are required for chapter scope.",
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // BUILD FILTER CONDITIONS
    // ---------------------------------------------------------

    const pdfConditions: string[] = [];
    const pdfArgs: any[] = [];

    const cardConditions: string[] = [];
    const cardArgs: any[] = [];

    const errorConditions: string[] = [];
    const errorArgs: any[] = [];

    if (scope === "subject" || scope === "chapter") {
      pdfConditions.push("LOWER(TRIM(subject)) = LOWER(TRIM(?))");
      pdfArgs.push(subject);

      cardConditions.push("LOWER(TRIM(subject)) = LOWER(TRIM(?))");
      cardArgs.push(subject);

      errorConditions.push("LOWER(TRIM(subject)) = LOWER(TRIM(?))");
      errorArgs.push(subject);
    }

    if (scope === "chapter") {
      pdfConditions.push("LOWER(TRIM(chapter)) = LOWER(TRIM(?))");
      pdfArgs.push(chapter);

      cardConditions.push("LOWER(TRIM(topic)) = LOWER(TRIM(?))");
      cardArgs.push(chapter);

      errorConditions.push("LOWER(TRIM(topic)) = LOWER(TRIM(?))");
      errorArgs.push(chapter);
    }

    const pdfWhere =
      pdfConditions.length > 0
        ? `WHERE ${pdfConditions.join(" AND ")}`
        : "";

    const cardWhere =
      cardConditions.length > 0
        ? `WHERE ${cardConditions.join(" AND ")}`
        : "";

    const errorWhere =
      errorConditions.length > 0
        ? `WHERE ${errorConditions.join(" AND ")}`
        : "";

    // ---------------------------------------------------------
    // FETCH PDFs
    // ---------------------------------------------------------

    const pdfResult = await db.execute({
      sql: `
        SELECT
          id,
          title,
          original_filename,
          relative_path,
          subject,
          chapter,
          created_at
        FROM pdfs
        ${pdfWhere}
        ORDER BY subject COLLATE NOCASE,
                 chapter COLLATE NOCASE,
                 created_at DESC
      `,
      args: pdfArgs,
    });

    const pdfRows = pdfResult.rows as any[];

    // ---------------------------------------------------------
    // FETCH ANNOTATIONS
    // ---------------------------------------------------------

    let annotationRows: any[] = [];

    if (pdfRows.length > 0) {
      const placeholders = pdfRows.map(() => "?").join(", ");

      const annotationResult = await db.execute({
        sql: `
          SELECT
            pdf_id,
            page,
            items_json,
            updated_at
          FROM pdf_annotations
          WHERE pdf_id IN (${placeholders})
          ORDER BY pdf_id, page
        `,
        args: pdfRows.map((row) => String(row.id)),
      });

      annotationRows = annotationResult.rows as any[];
    }

    const pdfMap = new Map<string, any>();

    for (const row of pdfRows) {
      pdfMap.set(String(row.id), {
        id: String(row.id),
        title: normalize(row.title) || normalize(row.original_filename),
        originalName: normalize(row.original_filename),
        relativePath: normalize(row.relative_path),
        subject: normalize(row.subject),
        chapter: normalize(row.chapter),
        annotations: [],
      });
    }

    let annotationCount = 0;
    let writtenNoteCount = 0;
    let highlightCount = 0;

    for (const row of annotationRows) {
      const pdf = pdfMap.get(String(row.pdf_id));

      if (!pdf) continue;

      const items = safeAnnotationItems(row.items_json);

      const pageNumber = Number(row.page) || 1;

      for (const item of items) {
        if (!item || typeof item !== "object") continue;

        annotationCount++;

        if (item.type === "text") {
          const text = normalize(item.text);

          if (!text) continue;

          writtenNoteCount++;

          pdf.annotations.push({
            type: "text",
            page: pageNumber,
            text,
            color: item.color || null,
            size: item.size || null,
          });
        } else if (item.type === "highlight") {
          highlightCount++;

          pdf.annotations.push({
            type: "highlight",
            page: pageNumber,
            color: item.color || null,
          });
        } else if (item.type === "rect") {
          pdf.annotations.push({
            type: "rect",
            page: pageNumber,
            color: item.color || null,
          });
        }
      }
    }

    // ---------------------------------------------------------
    // FETCH FLASHCARDS
    // ---------------------------------------------------------

    const cardsResult = await db.execute({
      sql: `
        SELECT
          id,
          front,
          back,
          front_image,
          subject,
          topic,
          source_json,
          ease,
          interval,
          reps,
          lapses,
          due,
          created_at,
          last_reviewed
        FROM cards
        ${cardWhere}
        ORDER BY subject COLLATE NOCASE,
                 topic COLLATE NOCASE,
                 created_at DESC
      `,
      args: cardArgs,
    });

    const flashcards = (cardsResult.rows as any[]).map((row) => ({
      id: String(row.id),
      front: normalize(row.front),
      back: normalize(row.back),
      frontImage: cardImageForClient(normalize(row.front_image)),
      subject: normalize(row.subject),
      topic: normalize(row.topic),
      source: safeJsonParse(row.source_json, null),
      due: normalize(row.due),
      createdAt: normalize(row.created_at),
      lastReviewed: normalize(row.last_reviewed),
    }));

    // ---------------------------------------------------------
    // FETCH ERROR LOGS
    // ---------------------------------------------------------

    const errorsResult = await db.execute({
      sql: `
        SELECT *
        FROM error_logs
        ${errorWhere}
        ORDER BY
          subject COLLATE NOCASE,
          topic COLLATE NOCASE,
          log_date DESC,
          created_at DESC
      `,
      args: errorArgs,
    });

    const errorLogs = (errorsResult.rows as any[]).map((row) => ({
      id: String(row.id),
      logDate: normalize(row.log_date),
      subject: normalize(row.subject),
      topic: normalize(row.topic),
      question: normalize(row.question),
      reason: normalize(row.reason),
      mistake: normalize(row.mistake),
      correctConcept: normalize(row.correct_concept),
      sourceUrl: normalize(row.source_url),
      myAnswer: normalize(row.my_answer),
      correctAnswer: normalize(row.correct_answer),
      whatWentWrong: normalize(row.what_went_wrong),
      solution: normalize(row.solution),
      images: toClientImages(safeImages(row.images)),
      mastered: Boolean(Number(row.mastered || 0)),
      reviewCount: Number(row.review_count || 0),
      lastReviewed: normalize(row.last_reviewed),
      nextReview: normalize(row.next_review),
      createdAt: normalize(row.created_at),
    }));

    // ---------------------------------------------------------
    // REMOVE EMPTY PDF RECORDS FROM REVISION ANNOTATIONS
    // ---------------------------------------------------------

    const documents = Array.from(pdfMap.values());

    // ---------------------------------------------------------
    // COUNTS
    // ---------------------------------------------------------

    const totalAnnotations = documents.reduce(
      (total, pdf) => total + pdf.annotations.length,
      0
    );

    const totalWrittenNotes = documents.reduce(
      (total, pdf) =>
        total +
        pdf.annotations.filter(
          (annotation: any) => annotation.type === "text"
        ).length,
      0
    );

    const totalHighlights = documents.reduce(
      (total, pdf) =>
        total +
        pdf.annotations.filter(
          (annotation: any) => annotation.type === "highlight"
        ).length,
      0
    );

    const masteredErrors = errorLogs.filter(
      (error: any) => error.mastered
    ).length;

    return NextResponse.json({
      success: true,

      filters: {
        scope,
        subject: subject || null,
        chapter: chapter || null,
      },

      summary: {
        pdfs: documents.length,
        annotations: totalAnnotations,
        writtenNotes: totalWrittenNotes,
        highlights: totalHighlights,
        flashcards: flashcards.length,
        errorLogs: errorLogs.length,
        masteredErrors,
        pendingErrors: errorLogs.length - masteredErrors,
      },

      documents,
      flashcards,
      errorLogs,
    });
  } catch (error: any) {
    console.error("One-Shot Revision Error:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Failed to generate One-Shot Revision.",
      },
      { status: 500 }
    );
  }
}