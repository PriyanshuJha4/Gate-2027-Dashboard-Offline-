"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatCountdownLabel } from "@/lib/countdown";
import { formatMilestoneDate } from "@/lib/milestones";
import ReviseToday from "@/components/today/ReviseToday";

// Shape returned by GET /api/today
interface TodayData {
  date: string;
  todo: { date: string; task: string; completed: boolean };
  cards: { due: number; total: number };
  errors: {
    due: number;
    total: number;
    mastered: number;
    items: { id: string; subject: string; topic: string; question: string; log_date: string; next_review: string }[];
  };
  milestone: { id: string; label: string; date: string; daysLeft: number } | null;
}

const CARD = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";

function Stat({ href, label, value, hint, alert }: { href: string; label: string; value: string | number; hint?: string; alert?: boolean }) {
  return (
    <Link href={href} className={`${CARD} block transition-colors hover:border-indigo-400`}>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${alert ? "text-amber-600" : "text-emerald-600"}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </Link>
  );
}

export default function TodayView() {
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/today", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `Request failed (${res.status})`);
      setData(json);
      setDone(!!json.todo?.completed);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load today's data.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleDone() {
    if (!data) return;
    const next = !done;
    setDone(next);
    try {
      const res = await fetch("/api/todo-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: data.todo.date, completed: next }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      setDone(!next); // revert: the tick was not saved
      setError("Could not save the tick. Please try again.");
    }
  }

  return (
    <div className="space-y-5 pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">🌅 Today</h1>
        {data && <p className="text-xs text-slate-400">{formatMilestoneDate(data.date)}</p>}
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

      {!data && !error && <p className="py-10 text-center text-sm text-slate-400">Loading…</p>}

      {data && (
        <>
          <section className={CARD}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Today&apos;s plan</div>
                <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{data.todo.task || "No plan is scheduled for today"}</h2>
              </div>
              {data.todo.task && (
                <button
                  type="button"
                  onClick={toggleDone}
                  className={`cursor-pointer rounded-xl border px-4 py-2 text-sm font-semibold ${
                    done
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  {done ? "✓ Done" : "Mark done"}
                </button>
              )}
            </div>
          </section>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Stat href="/flashcards" label="Flashcards due" value={data.cards.due} hint={`${data.cards.total} cards in total`} alert={data.cards.due > 0} />
            <Stat href="/error-log/review" label="Errors to re-test" value={data.errors.due} hint={`${data.errors.mastered} mastered · ${data.errors.total} logged`} alert={data.errors.due > 0} />
            {data.milestone && (
              <Link href="/roadmap" className={`${CARD} col-span-2 block transition-colors hover:border-indigo-400 lg:col-span-1`}>
                <div className="text-xs text-slate-500 dark:text-slate-400">Next milestone</div>
                <div className="mt-1 text-base font-bold text-indigo-600 dark:text-indigo-400">{data.milestone.label}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {formatMilestoneDate(data.milestone.date)} · {formatCountdownLabel(data.milestone.daysLeft)}
                </div>
              </Link>
            )}
          </div>

          {/* Weak-topic revision queue ("Aaj revise karo") */}
          <ReviseToday />

          {data.errors.items.length > 0 && (
            <section className={CARD}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Errors to re-test</h2>
                <Link href="/error-log/review" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">Open review mode →</Link>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.errors.items.map((e) => (
                  <li key={e.id} className="py-2">
                    <p className="text-sm text-slate-800 dark:text-slate-100">{e.question || "(screenshot question)"}</p>
                    <p className="text-[11px] text-slate-400">{[e.subject, e.topic].filter(Boolean).join(" › ")}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
