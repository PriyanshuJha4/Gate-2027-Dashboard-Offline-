// Error-log revision schedule. Pure helpers (no DB) so the API routes AND the
// client components use exactly the same rule for what "pending" means.
//
//   Pending  =  not mastered  AND  (next_review is empty  OR  next_review <= today)
//
// A brand-new entry (or an old one with no next_review yet) is due immediately.
// Each time you tap "Revised" the gap grows: 1 -> 3 -> 7 -> 14 -> 30 days.

/** Days until the next revision after the 1st, 2nd, 3rd... review. Edit freely. */
export const REVIEW_GAPS = [1, 3, 7, 14, 30];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Date `days` after `fromISO` (YYYY-MM-DD, local). */
function addDays(fromISO: string, days: number): string {
  const [y, m, d] = fromISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/**
 * Next revision date after finishing review number `reviewCountAfter`
 * (1 = first time revised). Counts beyond the table reuse the last gap.
 */
export function nextReviewDate(reviewCountAfter: number, fromISO: string): string {
  const idx = Math.min(Math.max(reviewCountAfter, 1), REVIEW_GAPS.length) - 1;
  return addDays(fromISO, REVIEW_GAPS[idx]);
}

/** True when the entry should be revised today (or is overdue). */
export function isErrorDue(
  e: { mastered?: unknown; next_review?: string | null },
  todayISO: string,
): boolean {
  if (Number(e.mastered) === 1) return false;
  const nr = e.next_review ? String(e.next_review) : "";
  return nr === "" || nr <= todayISO;
}
