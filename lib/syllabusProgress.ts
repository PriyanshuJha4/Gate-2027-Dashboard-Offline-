// Single source of truth for the Syllabus Tracker AND the Dashboard percentage.
// Topics come from lib/topics.ts. Progress is saved as `${topicId}::${category.key}`,
// so renaming a topic's display name never loses its ticks.
import { topicsBySubject, progressKey } from "@/lib/topics";

export type TrackerTopic = { id: string; name: string };

export const SYLLABUS_DATA: { subject: string; topics: TrackerTopic[] }[] = topicsBySubject((t) => t.inTracker).map(
  (g) => ({ subject: g.subject, topics: g.topics.map((t) => ({ id: t.id, name: t.name })) }),
);

export const CATEGORIES = [
  { key: "class_notes", label: "Class Notes" },
  { key: "practice_q", label: "Practice Questions" },
  { key: "pyqs", label: "PYQs" },
  { key: "short_notes", label: "Short Notes" },
];

export const VALID_KEYS: Set<string> = new Set(
  SYLLABUS_DATA.flatMap((s) =>
    s.topics.flatMap((t) => CATEGORIES.map((c) => progressKey(t.id, c.key)))
  )
);

/** Counts only ticks that still map to a real topic (ignores orphaned keys). */
export function countCompleted(map: Record<string, boolean>): number {
  return Object.entries(map).filter(([k, v]) => v && VALID_KEYS.has(k)).length;
}
