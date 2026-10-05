import type { Card, ReviewDay } from "@/lib/notesDb";

/** Local date as YYYY-MM-DD (not UTC, so it is correct in India). */
export function todayStr(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return todayStr(new Date(y, m - 1, d + days));
}

/** 0 = Again, 3 = Hard, 4 = Good, 5 = Easy */
export type Rating = 0 | 3 | 4 | 5;

export const RATINGS: { value: Rating; label: string; key: string }[] = [
  { value: 0, label: "Again", key: "1" },
  { value: 3, label: "Hard", key: "2" },
  { value: 4, label: "Good", key: "3" },
  { value: 5, label: "Easy", key: "4" },
];

/** SM-2 scheduler. Returns a NEW card object (the input is not modified). */
export function review(card: Card, q: Rating, today: string = todayStr()): Card {
  let { reps, interval, ease, lapses } = card;

  if (q < 3) {
    reps = 0;
    interval = 1;
    lapses += 1;
  } else {
    reps += 1;
    interval =
      reps === 1 ? 1 : reps === 2 ? 3 : Math.round(Math.max(interval, 1) * ease);
  }

  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  interval = Math.max(1, interval);

  return {
    ...card,
    reps,
    interval,
    ease,
    lapses,
    due: addDays(today, interval),
    lastReviewed: today,
  };
}

export function formatInterval(days: number): string {
  if (days < 1) return "<1d";
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${(days / 30).toFixed(1).replace(".0", "")}mo`;
  return `${(days / 365).toFixed(1).replace(".0", "")}y`;
}

/** Consecutive days with at least one review, counting back from today (or yesterday). */
export function computeStreak(days: ReviewDay[]): number {
  const reviewed = new Set(days.filter((d) => d.count > 0).map((d) => d.date));
  let cursor = todayStr();
  if (!reviewed.has(cursor)) cursor = addDays(cursor, -1);

  let streak = 0;
  while (reviewed.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}