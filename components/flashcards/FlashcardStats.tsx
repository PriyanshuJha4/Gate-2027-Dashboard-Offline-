"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listCards, listReviewDays, type Card, type ReviewDay } from "@/lib/notesDb";
import { computeStreak, todayStr } from "@/lib/srs";

/**
 * Small widget for the dashboard home page:
 *   import FlashcardStats from "@/components/flashcards/FlashcardStats";
 *   ...
 *   <FlashcardStats />
 */
export default function FlashcardStats() {
  const [cards, setCards] = useState<Card[]>([]);
  const [days, setDays] = useState<ReviewDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [c, d] = await Promise.all([listCards(), listReviewDays()]);
        setCards(c);
        setDays(d);
      } catch (e) {
        console.error(e);
        setFailed(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const today = todayStr();
  const due = cards.filter((c) => c.due <= today).length;
  const streak = computeStreak(days);
  const reviewedToday = days.find((d) => d.date === today)?.count || 0;

  const bySubject = useMemo(() => {
    const map = new Map<string, number>();
    cards.forEach((c) => {
      const key = c.subject || "No subject";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [cards]);

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">🃏 Flashcards</h2>
        <Link
          href="/flashcards"
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
        >
          {due > 0 ? `Review ${due} due →` : "Open →"}
        </Link>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading...</p>
      ) : failed ? (
        <p className="text-xs text-red-600">Could not read flashcards from database.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{due}</p>
              <p className="text-[11px] text-slate-500">Due today</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{streak}🔥</p>
              <p className="text-[11px] text-slate-500">Day streak</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {reviewedToday}
              </p>
              <p className="text-[11px] text-slate-500">Reviewed today</p>
            </div>
          </div>

          {bySubject.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {bySubject.map(([subject, count]) => (
                <span
                  key={subject}
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  {subject} · {count}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}