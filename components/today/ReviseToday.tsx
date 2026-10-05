"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { addToPlan, cardsHref, loadWeak, removeFromPlan, setPlanDone, type WeakResponse } from "@/lib/weakPlanClient";

const CARD = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
const SUGGESTIONS = 3;

/**
 * "Aaj revise karo" - today's revision queue (written by the Weak Topics page) plus the
 * next few weak topics you can add with one tap. Self-contained: drop <ReviseToday /> into any page.
 */
export default function ReviseToday() {
  const [data, setData] = useState<WeakResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await loadWeak(SUGGESTIONS + 12));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the revision plan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function run(topicId: string, action: () => Promise<unknown>) {
    setBusy(topicId);
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const plan = data?.plan ?? [];
  const doneCount = plan.filter((p) => p.done).length;
  const suggestions = (data?.topics ?? []).filter((t) => !t.inPlan).slice(0, SUGGESTIONS);

  if (loading) {
    return <section className={CARD}><p className="text-sm text-slate-400">Loading revision plan…</p></section>;
  }

  return (
    <section className={CARD}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">🔁 Aaj revise karo</h2>
        {plan.length > 0 && (
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            {doneCount}/{plan.length} done
          </span>
        )}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

      {plan.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nothing queued yet. Add a weak topic below, or from the{" "}
          <Link href="/analytics" className="text-indigo-600 hover:underline dark:text-indigo-400">Analytics page</Link>.
        </p>
      ) : (
        <ul className="space-y-2">
          {plan.map((p) => (
            <li key={p.topic_id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800">
              <input
                type="checkbox"
                checked={p.done}
                disabled={busy === p.topic_id}
                onChange={(e) => run(p.topic_id, () => setPlanDone(p.topic_id, e.target.checked))}
                className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-indigo-600"
                aria-label={`Mark ${p.name} as revised`}
              />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${p.done ? "text-slate-400 line-through" : "text-slate-800 dark:text-slate-100"}`}>{p.name}</p>
                <p className="truncate text-[11px] text-slate-400">
                  {p.subject}
                  {p.reasons[0] ? ` · ${p.reasons[0]}` : p.score === 0 ? " · no longer weak 👍" : ""}
                </p>
              </div>
              <Link href={cardsHref(p.topic_id)} className="shrink-0 text-xs text-indigo-600 hover:underline dark:text-indigo-400">Cards</Link>
              <button
                type="button"
                disabled={busy === p.topic_id}
                onClick={() => run(p.topic_id, () => removeFromPlan(p.topic_id))}
                aria-label={`Remove ${p.name} from today's plan`}
                className="shrink-0 cursor-pointer text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Suggested from your weak topics</p>
          <ul className="space-y-1.5">
            {suggestions.map((s) => (
              <li key={s.topic_id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-700 dark:text-slate-200">{s.name}</p>
                  <p className="truncate text-[11px] text-slate-400">{s.reasons[0]}</p>
                </div>
                <button
                  type="button"
                  disabled={busy === s.topic_id}
                  onClick={() => run(s.topic_id, () => addToPlan(s.topic_id))}
                  className="shrink-0 cursor-pointer rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  + Add
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
