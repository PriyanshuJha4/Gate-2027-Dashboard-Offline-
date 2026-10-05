"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LEECH_LAPSES, MOCK_HALF_LIFE_DAYS, WEIGHTS } from "@/lib/weakTopics";
import { addToPlan, cardsHref, loadWeak, removeFromPlan, type WeakResponse } from "@/lib/weakPlanClient";

const PAGE = 10;
const CARD = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";

/** Colour by rank inside the list, so the very worst topics stand out. */
function badgeTone(score: number, max: number) {
  const r = max > 0 ? score / max : 0;
  if (r >= 0.67) return "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300";
  if (r >= 0.34) return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

export default function WeakTopics() {
  const [limit, setLimit] = useState(PAGE);
  const [data, setData] = useState<WeakResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await loadWeak(limit));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load weak topics.");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function togglePlan(topicId: string, inPlan: boolean) {
    setBusy(topicId);
    try {
      if (inPlan) await removeFromPlan(topicId);
      else await addToPlan(topicId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update today's plan.");
    } finally {
      setBusy(null);
    }
  }

  const topics = data?.topics ?? [];
  const max = topics[0]?.score ?? 0;

  return (
    <section className={CARD}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">🎯 Weak Topics</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Ranked from your pending errors, marks lost in mock tests and flashcards you keep forgetting.
          </p>
        </div>
        {data && data.plan.length > 0 && (
          <Link href="/today" className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300">
            Today&apos;s plan: {data.plan.filter((p) => p.done).length}/{data.plan.length} done →
          </Link>
        )}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400">Finding your weak spots…</p>
      ) : topics.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          No weak topics yet. They appear once you log errors, add topic-wise losses to a mock test, or a flashcard
          lapses {LEECH_LAPSES}+ times.
        </p>
      ) : (
        <ol className="divide-y divide-slate-100 dark:divide-slate-800">
          {topics.map((w, i) => (
            <li key={w.topic_id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="mt-0.5 w-6 shrink-0 text-center text-xs font-bold text-slate-400">{i + 1}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{w.name}</p>
                  <p className="text-[11px] text-slate-400">{w.subject}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {w.reasons.map((r) => (
                      <span key={r} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2 pl-9 sm:pl-0">
                <span className={`rounded-lg px-2 py-1 text-xs font-bold ${badgeTone(w.score, max)}`} title="Weakness score">
                  {w.score}
                </span>
                <Link
                  href={cardsHref(w.topic_id)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  🃏 Cards
                </Link>
                {w.pendingErrors > 0 && (
                  <Link
                    href="/error-log/review"
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    ❌ Errors
                  </Link>
                )}
                <button
                  type="button"
                  disabled={busy === w.topic_id}
                  onClick={() => togglePlan(w.topic_id, w.inPlan)}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                    w.inPlan
                      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300"
                      : "bg-indigo-600 text-white hover:bg-indigo-500"
                  }`}
                  title={w.inPlan ? "Click to remove from today's plan" : undefined}
                >
                  {w.inPlan ? "✓ In today's plan" : "Aaj ke plan mein daalo"}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {data && data.total > topics.length && (
        <button
          type="button"
          onClick={() => setLimit((n) => Math.min(50, n + PAGE))}
          className="mt-3 w-full cursor-pointer rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Show more ({data.total - topics.length} more)
        </button>
      )}

      <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400 dark:border-slate-800">
        Score = {WEIGHTS.error} × pending errors + {WEIGHTS.mock} × marks lost in mocks (halves every {MOCK_HALF_LIFE_DAYS} days) +{" "}
        {WEIGHTS.leech} × flashcards with {LEECH_LAPSES}+ lapses. Change the numbers in <code>lib/weakTopics.ts</code>.
      </p>
    </section>
  );
}
