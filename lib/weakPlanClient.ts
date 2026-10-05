// Browser-side helpers for /api/weak-topics (weak-topic list + "today's revision plan").
// Used by components/WeakTopics.tsx (Analytics page) and components/today/ReviseToday.tsx (Today page).
import type { WeakTopic } from "@/lib/weakTopics";

export type WeakTopicRow = WeakTopic & { inPlan: boolean };

export interface PlanItem {
  topic_id: string;
  name: string;
  subject: string;
  source: string;
  done: boolean;
  /** 0 when the topic is no longer weak (you revised it) but is still in the plan */
  score: number;
  pendingErrors: number;
  markLost: number;
  leechCards: number;
  reasons: string[];
}

export interface WeakResponse {
  date: string;
  /** how many weak topics exist in total (the list below is cut to `limit`) */
  total: number;
  topics: WeakTopicRow[];
  plan: PlanItem[];
}

const JSON_HEADERS = { "Content-Type": "application/json" };

async function call<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data && data.error)) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

export function loadWeak(limit = 10, date?: string): Promise<WeakResponse> {
  const qs = `limit=${limit}${date ? `&date=${encodeURIComponent(date)}` : ""}`;
  return call<WeakResponse>(`/api/weak-topics?${qs}`);
}

/** "Put in today's plan". Safe to repeat: a second call never un-ticks a finished topic. */
export function addToPlan(topic_id: string, date?: string) {
  return call("/api/weak-topics", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ topic_id, source: "weak_topic", date }),
  });
}

export function setPlanDone(topic_id: string, done: boolean, date?: string) {
  return call("/api/weak-topics", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ topic_id, done, date }),
  });
}

export function removeFromPlan(topic_id: string, date?: string) {
  const qs = `topic_id=${encodeURIComponent(topic_id)}${date ? `&date=${encodeURIComponent(date)}` : ""}`;
  return call(`/api/weak-topics?${qs}`, { method: "DELETE" });
}

export const cardsHref = (topicId: string) => `/flashcards?tab=browser&topic=${encodeURIComponent(topicId)}`;
