// Shared, pure helpers for the Pomodoro timer + streak heatmap.
// No DB / no browser APIs here, so it is safe to import from API routes AND client components.

import { addDaysISO } from "@/lib/milestones";

export type SessionKind = "focus" | "short_break" | "long_break";
export const SESSION_KINDS: SessionKind[] = ["focus", "short_break", "long_break"];

export const KIND_LABEL: Record<SessionKind, string> = {
  focus: "Focus",
  short_break: "Short break",
  long_break: "Long break",
};

/** A day counts for the streak when it has at least this much FOCUS time. */
export const STREAK_MIN_SEC = 10 * 60;

/** Sessions shorter than this are never logged (accidental start/stop). */
export const MIN_LOG_SEC = 60;

export interface StudySession {
  id: string;
  date: string; // YYYY-MM-DD (local)
  subject: string;
  topic_id: string | null;
  duration_sec: number;
  kind: SessionKind;
  created_at: string | null;
}

/** 0 = nothing, 1..4 = darker. Thresholds are focus minutes in one day. */
export const HEAT_STEPS_MIN = [1, 60, 180, 300] as const;

export function heatLevel(sec: number): 0 | 1 | 2 | 3 | 4 {
  const min = sec / 60;
  if (min <= 0) return 0;
  if (min >= HEAT_STEPS_MIN[3]) return 4;
  if (min >= HEAT_STEPS_MIN[2]) return 3;
  if (min >= HEAT_STEPS_MIN[1]) return 2;
  return 1;
}

/** 4500 -> "1h 15m", 1500 -> "25m", 40 -> "40s", 0 -> "0m" */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s === 0) return "0m";
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Milliseconds -> "24:13" (rounds UP, so the clock never shows 00:00 while time is left). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export interface Streaks {
  current: number;
  longest: number;
}

/**
 * days: { "YYYY-MM-DD": focusSeconds }.
 * Current streak: consecutive active days ending today. If today has no study yet the streak is
 * NOT broken (the day is not over), it is counted from yesterday.
 */
export function computeStreaks(days: Record<string, number>, today: string, minSec = STREAK_MIN_SEC): Streaks {
  const active = Object.keys(days)
    .filter((d) => days[d] >= minSec)
    .sort();

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of active) {
    run = prev && addDaysISO(prev, 1) === d ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = d;
  }

  const isActive = (d: string) => (days[d] ?? 0) >= minSec;
  let cursor = isActive(today) ? today : addDaysISO(today, -1);
  let current = 0;
  while (isActive(cursor)) {
    current++;
    cursor = addDaysISO(cursor, -1);
  }

  return { current, longest };
}
