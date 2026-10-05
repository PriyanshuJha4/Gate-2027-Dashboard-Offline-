"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { putCard, recordReview, type Card } from "@/lib/notesDb";
import { RATINGS, formatInterval, review, todayStr, type Rating } from "@/lib/srs";

type Props = {
  /** All cards. The session queue is built once, from the cards due today. */
  cards: Card[];
  onCardUpdated: (card: Card) => void;
  onReviewed: () => void;
};

const RATING_STYLES: Record<Rating, string> = {
  0: "bg-red-600 hover:bg-red-500",
  3: "bg-amber-500 hover:bg-amber-400",
  4: "bg-emerald-600 hover:bg-emerald-500",
  5: "bg-sky-600 hover:bg-sky-500",
};

export default function ReviewSession({ cards, onCardUpdated, onReviewed }: Props) {
  const today = todayStr();

  // Build the queue once when the session starts
  const [queue, setQueue] = useState<string[]>(() =>
    cards
      .filter((c) => c.due <= today)
      .sort((a, b) => a.due.localeCompare(b.due))
      .map((c) => c.id),
  );
  const [total] = useState(queue.length);
  const [done, setDone] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cardMap = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const current = queue.length > 0 ? cardMap.get(queue[0]) || null : null;

  const rate = useCallback(
    async (q: Rating) => {
      if (!current || busy) return;
      setBusy(true);
      setError("");
      try {
        const updated = review(current, q);
        await putCard(updated);
        try {
          await recordReview(todayStr());
        } catch (e) {
          // the card is already saved; only the streak counter missed one tick, so do not ask for a retry
          // (a retry would count the review twice)
          console.error("Could not update the review streak", e);
        }
        onCardUpdated(updated);
        onReviewed();
        setQueue((list) => list.slice(1));
        setDone((n) => n + 1);
        setShowAnswer(false);
      } catch (e) {
        console.error(e);
        setError("Could not save this review. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [current, busy, onCardUpdated, onReviewed],
  );

  // Keyboard: Space / Enter = show answer, 1-4 = Again / Hard / Good / Easy
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current) return;
      if (!showAnswer && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShowAnswer(true);
        return;
      }
      if (showAnswer) {
        const r = RATINGS.find((x) => x.key === e.key);
        if (r) rate(r.value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, showAnswer, rate]);

  // Finished (or nothing due)
  if (!current) {
    const nextDue = cards
      .filter((c) => c.due > today)
      .map((c) => c.due)
      .sort()[0];

    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-2 text-4xl">{cards.length === 0 ? "🃏" : "🎉"}</p>
        {cards.length === 0 ? (
          <>
            <p className="font-semibold text-slate-700 dark:text-slate-200">No flashcards yet</p>
            <p className="mt-1 text-sm text-slate-400">
              Open a PDF in the Notes Viewer, pick the 🃏 tool and drag a box over a note.
            </p>
            <Link
              href="/notes"
              className="mt-4 inline-block text-sm text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Go to Notes Viewer →
            </Link>
          </>
        ) : (
          <>
            <p className="font-semibold text-slate-700 dark:text-slate-200">
              {done > 0 ? `Great! You reviewed ${done} card${done > 1 ? "s" : ""}.` : "No cards due today."}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {nextDue ? `Next cards are due on ${nextDue}.` : "All caught up."}
            </p>
          </>
        )}
      </div>
    );
  }

  const source = current.source;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Card {Math.min(done + 1, total)} of {total}
        </span>
        <span className="font-medium text-indigo-600 dark:text-indigo-400">
          {queue.length} card{queue.length > 1 ? "s" : ""} due
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full bg-indigo-500 transition-all"
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>
            {[current.subject, current.topic].filter(Boolean).join(" · ") || "Flashcard"}
          </span>
          {source && (
            <Link
              href={`/notes?pdf=${source.pdfId}&page=${source.page}`}
              className="text-indigo-600 hover:underline dark:text-indigo-400"
              title={source.pdfName}
            >
              📄 Open source (p.{source.page})
            </Link>
          )}
        </div>

        {/* Front */}
        <div className="space-y-3">
          {current.frontImage && (
            <img
              src={current.frontImage}
              alt="Question"
              className="mx-auto max-h-[45vh] max-w-full rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-700"
            />
          )}
          {current.front && (
            <p className="whitespace-pre-wrap break-words text-base font-medium text-slate-800 dark:text-slate-100">
              {current.front}
            </p>
          )}
        </div>

        {/* Back */}
        {showAnswer ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Answer
            </p>
            <p className="whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-100">
              {current.back}
            </p>
          </div>
        ) : (
          <button
            onClick={() => setShowAnswer(true)}
            className="w-full rounded-xl border border-dashed border-indigo-300 py-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
          >
            Show answer <span className="text-xs text-slate-400">(Space)</span>
          </button>
        )}
      </div>

      {showAnswer && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RATINGS.map((r) => (
            <button
              key={r.value}
              onClick={() => rate(r.value)}
              disabled={busy}
              className={`rounded-xl px-3 py-2.5 text-white transition disabled:opacity-50 ${RATING_STYLES[r.value]}`}
            >
              <span className="block text-sm font-semibold">{r.label}</span>
              <span className="block text-[11px] opacity-80">
                {formatInterval(review(current, r.value).interval)} · key {r.key}
              </span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}