// SINGLE SOURCE OF TRUTH for the plan's key dates.
// Used by: Dashboard countdown, Roadmap schedule + header text, Today page.
// Change a date here and every page follows. Pure helpers only (no DB), so
// it is safe to import from both server routes and client components.

export interface Milestone {
  id: string;
  /** YYYY-MM-DD (local date) */
  date: string;
  label: string;
}

/** First day of the master plan. */
export const PLAN_START = "2026-09-27";

export const MILESTONES: Milestone[] = [
  { id: "syllabus-end", date: "2026-11-30", label: "Syllabus complete" },
  { id: "revision-end", date: "2027-01-30", label: "Intensive revision ends" },
  { id: "plan-end", date: "2027-02-28", label: "Plan end (taper / exam buffer)" },
];

export const SYLLABUS_END = MILESTONES[0].date;
export const REVISION_END = MILESTONES[1].date;
export const PLAN_END = MILESTONES[2].date;

/* ------------------------------ date helpers ------------------------------ */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

/** "2026-11-30" -> local Date at midnight (same as new Date(2026, 10, 30)). */
export function isoToLocalDate(iso: string): Date {
  const [y, m, d] = parts(iso);
  return new Date(y, m - 1, d);
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  const dt = new Date(y, m - 1, d + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/** "Nov 30, 2026"  (or "Nov 30" when withYear is false). Locale-independent. */
export function formatMilestoneDate(iso: string, withYear = true): string {
  const [y, m, d] = parts(iso);
  const base = `${MONTHS[m - 1]} ${d}`;
  return withYear ? `${base}, ${y}` : base;
}

/** "Feb 2027" */
export function formatMonthYear(iso: string): string {
  const [y, m] = parts(iso);
  return `${MONTHS[m - 1]} ${y}`;
}

/** The first milestone that is today or later, or null when all have passed. */
export function nextMilestone(todayISO: string): Milestone | null {
  return MILESTONES.find((m) => m.date >= todayISO) ?? null;
}
