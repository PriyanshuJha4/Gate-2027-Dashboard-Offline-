// Weak-topic detector. Pure functions (no DB, no fetch): the API route loads the rows,
// this file turns them into a ranked list. Everything is grouped by the permanent topic id (lib/topics.ts).
//
//   score =  ERROR_WEIGHT * pending errors
//          + MOCK_WEIGHT  * marks lost in mock tests (recent tests count more)
//          + LEECH_WEIGHT * flashcards with many lapses ("leech" cards)
//
// "Pending error" uses the SAME rule as the Error Review page (lib/errorReview.ts):
// not mastered AND (next_review empty OR next_review <= today).

import { isErrorDue } from "@/lib/errorReview";
import { daysBetween } from "@/lib/countdown";
import { topicById, topicIdByName } from "@/lib/topics";
import { reasonLabel } from "@/lib/mockScoring";

/** Tune freely: these three numbers decide the ranking. */
export const WEIGHTS = {
  /** points per pending error-log entry */
  error: 3,
  /** points per mark lost in a mock test (after the recency factor) */
  mock: 1.5,
  /** points per flashcard that is a leech */
  leech: 2,
};

/** A flashcard with this many lapses (or more) counts as a leech. */
export const LEECH_LAPSES = 3;
/** Marks lost in a mock lose half their weight every this many days. */
export const MOCK_HALF_LIFE_DAYS = 30;

/* ------------------------------- inputs ------------------------------- */

export interface ErrorRow {
  topic_id?: string | null;
  topic?: string | null;
  subject?: string | null;
  mastered?: unknown;
  next_review?: string | null;
}
export interface CardRow {
  topic_id?: string | null;
  topic?: string | null;
  subject?: string | null;
  lapses?: unknown;
}
export interface MockLossRow {
  topic_id: string;
  marks_lost: number;
  reason?: string | null;
  /** YYYY-MM-DD of the mock test */
  test_date: string;
}

/* ------------------------------- output ------------------------------- */

export interface WeakTopic {
  topic_id: string;
  name: string;
  subject: string;
  score: number;
  pendingErrors: number;
  /** real marks lost in mocks (not weighted), for display */
  markLost: number;
  leechCards: number;
  /** most common reason for the marks lost in mocks, if any */
  topReason: string | null;
  /** human readable lines, strongest signal first */
  reasons: string[];
}

/* ------------------------------- helpers ------------------------------- */

const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Stored topic_id if it is a known topic, else try to recover it from the old name spelling. */
function resolveTopic(r: { topic_id?: string | null; topic?: string | null; subject?: string | null }): string | null {
  const id = r.topic_id ? String(r.topic_id) : "";
  if (id && topicById(id)) return id;
  return topicIdByName(r.topic, r.subject);
}

/** 1 for a test today, 0.5 after one half-life, and so on. Future dates count as today. */
export function recencyFactor(testDate: string, todayISO: string): number {
  const age = Math.max(0, daysBetween(testDate, todayISO));
  return Math.pow(0.5, age / MOCK_HALF_LIFE_DAYS);
}

interface Acc {
  pendingErrors: number;
  markLost: number;
  markLostWeighted: number;
  leechCards: number;
  reasonMarks: Map<string, number>;
}

/* -------------------------------- main -------------------------------- */

export function computeWeakTopics(input: {
  errors: ErrorRow[];
  cards: CardRow[];
  losses: MockLossRow[];
  today: string;
}): WeakTopic[] {
  const acc = new Map<string, Acc>();
  const get = (id: string): Acc => {
    let a = acc.get(id);
    if (!a) acc.set(id, (a = { pendingErrors: 0, markLost: 0, markLostWeighted: 0, leechCards: 0, reasonMarks: new Map() }));
    return a;
  };

  for (const e of input.errors) {
    if (!isErrorDue({ mastered: e.mastered, next_review: e.next_review }, input.today)) continue;
    const id = resolveTopic(e);
    if (id) get(id).pendingErrors++;
  }

  for (const c of input.cards) {
    if ((Number(c.lapses) || 0) < LEECH_LAPSES) continue;
    const id = resolveTopic(c);
    if (id) get(id).leechCards++;
  }

  for (const l of input.losses) {
    const lost = Number(l.marks_lost) || 0;
    if (lost <= 0 || !topicById(l.topic_id)) continue;
    const a = get(l.topic_id);
    a.markLost += lost;
    a.markLostWeighted += lost * recencyFactor(l.test_date, input.today);
    const r = l.reason || "";
    a.reasonMarks.set(r, (a.reasonMarks.get(r) || 0) + lost);
  }

  const out: WeakTopic[] = [];
  for (const [id, a] of acc) {
    const score = round1(WEIGHTS.error * a.pendingErrors + WEIGHTS.mock * a.markLostWeighted + WEIGHTS.leech * a.leechCards);
    if (score <= 0) continue;
    const t = topicById(id)!;

    let topReason: string | null = null;
    let best = 0;
    for (const [r, m] of a.reasonMarks) {
      if (r && m > best) {
        best = m;
        topReason = r;
      }
    }

    // each signal with its own points, so the biggest contributor is listed first
    const parts: { pts: number; text: string }[] = [];
    if (a.pendingErrors > 0)
      parts.push({
        pts: WEIGHTS.error * a.pendingErrors,
        text: `${a.pendingErrors} pending ${a.pendingErrors === 1 ? "error" : "errors"}`,
      });
    if (a.markLost > 0)
      parts.push({
        pts: WEIGHTS.mock * a.markLostWeighted,
        text: `${round2(a.markLost)} marks lost in mocks${topReason ? ` (mostly: ${reasonLabel(topReason).toLowerCase()})` : ""}`,
      });
    if (a.leechCards > 0)
      parts.push({
        pts: WEIGHTS.leech * a.leechCards,
        text: `${a.leechCards} ${a.leechCards === 1 ? "card" : "cards"} with ${LEECH_LAPSES}+ lapses`,
      });
    parts.sort((x, y) => y.pts - x.pts);

    out.push({
      topic_id: id,
      name: t.name,
      subject: t.subject,
      score,
      pendingErrors: a.pendingErrors,
      markLost: round2(a.markLost),
      leechCards: a.leechCards,
      topReason,
      reasons: parts.map((p) => p.text),
    });
  }

  // highest score first; ties -> more pending errors, then name (stable, no flicker between reloads)
  out.sort((x, y) => y.score - x.score || y.pendingErrors - x.pendingErrors || x.name.localeCompare(y.name));
  return out;
}
