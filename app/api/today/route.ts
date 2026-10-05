import { NextResponse } from "next/server";
import { db, initDatabase } from "@/lib/db";
import { todayStr, daysBetween } from "@/lib/countdown";
import { defaultTaskFor } from "@/lib/dailySchedule";
import { nextMilestone } from "@/lib/milestones";
import { isErrorDue } from "@/lib/errorReview";

// Always run on the Node.js runtime and never cache: the numbers must be live.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How many due error entries to preview on the Today page. */
const ERROR_PREVIEW = 5;

function snippet(value: unknown, max = 110): string {
  const s = String(value ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// GET /api/today  ->  everything the Today page needs, in ONE request.
export async function GET() {
  try {
    await initDatabase();
    const today = todayStr();

    // 1) Today's to-do. Same rule as the To-Do page: an edited task (todo_list.task)
    //    wins, otherwise the default from the plan (lib/dailySchedule.ts).
    const todoRes = await db.execute({
      sql: "SELECT task, completed FROM todo_list WHERE date = ?",
      args: [today],
    });
    const todoRow: any = todoRes.rows[0];
    const customTask = todoRow && todoRow.task ? String(todoRow.task) : "";
    const task = customTask || defaultTaskFor(today) || "";

    // 2) Flashcards due: same comparison the review session uses (due <= today, YYYY-MM-DD text).
    const cardRes = await db.execute({
      sql: "SELECT COUNT(*) AS total, SUM(CASE WHEN due <= ? THEN 1 ELSE 0 END) AS due FROM cards",
      args: [today],
    });
    const cardRow: any = cardRes.rows[0];

    // 3) Error log: "pending" = not mastered AND (no next_review OR next_review <= today).
    //    `images` is not selected on purpose (can be large, not needed here).
    const errRes = await db.execute(
      "SELECT id, subject, topic, question, log_date, mastered, next_review FROM error_logs",
    );
    const errRows = errRes.rows as any[];

    let mastered = 0;
    const due: any[] = [];
    for (const r of errRows) {
      if (Number(r.mastered) === 1) {
        mastered++;
        continue;
      }
      if (isErrorDue({ mastered: r.mastered, next_review: r.next_review }, today)) due.push(r);
    }
    // Most overdue first
    const sortKey = (r: any) => String(r.next_review || r.log_date || "");
    due.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    // 4) Next milestone
    const m = nextMilestone(today);

    return NextResponse.json({
      date: today,
      todo: {
        date: today,
        task,
        completed: Number(todoRow?.completed) === 1,
      },
      cards: {
        due: Number(cardRow?.due) || 0,
        total: Number(cardRow?.total) || 0,
      },
      errors: {
        due: due.length,
        total: errRows.length,
        mastered,
        items: due.slice(0, ERROR_PREVIEW).map((r) => ({
          id: String(r.id),
          subject: String(r.subject ?? ""),
          topic: String(r.topic ?? ""),
          question: snippet(r.question),
          log_date: String(r.log_date ?? ""),
          next_review: String(r.next_review ?? ""),
        })),
      },
      milestone: m
        ? { id: m.id, label: m.label, date: m.date, daysLeft: daysBetween(today, m.date) }
        : null,
    });
  } catch (error: any) {
    console.error("Today API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
