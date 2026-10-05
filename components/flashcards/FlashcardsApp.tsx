"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  deleteCard,
  listCards,
  listReviewDays,
  type Card,
  type ReviewDay,
} from "@/lib/notesDb";
import { computeStreak, formatInterval, todayStr } from "@/lib/srs";
import { topicById, topicIdByName } from "@/lib/topics";
import ReviewSession from "@/components/flashcards/ReviewSession";
import CardDialog from "@/components/flashcards/CardDialog";

type Tab = "review" | "all";

/** topicId (from ?topic=) limits the review queue, the stats and the "All cards" list to one syllabus topic. */
export default function FlashcardsApp({ topicId = null }: { topicId?: string | null }) {
  const [allCards, setCards] = useState<Card[]>([]);
  const [days, setDays] = useState<ReviewDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("review");
  const [dialog, setDialog] = useState<{ card?: Card } | null>(null);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const refreshDays = useCallback(async () => {
    try {
      setDays(await listReviewDays());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [c, d] = await Promise.all([listCards(), listReviewDays()]);
        setCards(c);
        setDays(d);
      } catch (e) {
        console.error(e);
        setLoadError("Could not read server database.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Same matching rule as the Syllabus popover: any old spelling of the topic name maps to one topic id
  const cards = useMemo(
    () => (topicId ? allCards.filter((c) => topicIdByName(c.topic, c.subject) === topicId) : allCards),
    [allCards, topicId],
  );

  const today = todayStr();
  const dueCount = cards.filter((c) => c.due <= today).length;
  const streak = computeStreak(days);
  const reviewedToday = days.find((d) => d.date === today)?.count || 0;

  const subjects = useMemo(
    () => Array.from(new Set(cards.map((c) => c.subject).filter(Boolean))).sort(),
    [cards],
  );

  const visibleCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards
      .filter((c) => {
        if (subjectFilter && c.subject !== subjectFilter) return false;
        if (q && !`${c.front} ${c.back} ${c.topic}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.due.localeCompare(b.due));
  }, [cards, subjectFilter, search]);

  const handleCardUpdated = useCallback((updated: Card) => {
    setCards((list) => list.map((c) => (c.id === updated.id ? updated : c)));
  }, []);

  async function handleDelete(card: Card) {
    if (!window.confirm("Delete this flashcard?")) return;
    try {
      await deleteCard(card.id);
      setCards((list) => list.filter((c) => c.id !== card.id));
    } catch (e) {
      console.error(e);
      setMessage("Could not delete the card.");
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-400">Loading flashcards...</p>;
  }

  return (
    <div className="space-y-5 pb-12">
      {loadError && <p className="text-xs text-red-600">{loadError}</p>}

      {topicId && cards.length === 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          No flashcards for <strong>{topicById(topicId)?.name ?? "this topic"}</strong> yet. Use “＋ New card” and pick this topic.
        </p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Due today", value: dueCount, tone: "text-indigo-600 dark:text-indigo-400" },
          { label: "Reviewed today", value: reviewedToday, tone: "text-emerald-600 dark:text-emerald-400" },
          { label: "Day streak 🔥", value: streak, tone: "text-amber-600 dark:text-amber-400" },
          { label: "Total cards", value: cards.length, tone: "text-slate-700 dark:text-slate-200" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <p className={`text-2xl font-bold ${s.tone}`}>{s.value}</p>
            <p className="text-[11px] text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {(
            [
              ["review", `Today's review (${dueCount})`],
              ["all", `All cards (${cards.length})`],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                tab === id
                  ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-indigo-300"
                  : "text-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => setDialog({})}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-500"
          >
            ＋ New card
          </button>
        </div>
      </div>

      {message && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {message}
        </p>
      )}

      {/* Review tab */}
      {tab === "review" && (
        <ReviewSession
          key={`${topicId ?? "all"}-${cards.length}`}
          cards={cards}
          onCardUpdated={handleCardUpdated}
          onReviewed={refreshDays}
        />
      )}

      {/* All cards tab */}
      {tab === "all" && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cards..."
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          {visibleCards.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900">
              No cards found.
            </p>
          ) : (
            <ul className="space-y-2">
              {visibleCards.slice(0, 200).map((c) => (
                <li
                  key={c.id}
                  className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  {c.frontImage && (
                    <img
                      src={c.frontImage}
                      alt=""
                      className="h-16 w-24 shrink-0 rounded border border-slate-200 bg-white object-contain dark:border-slate-700"
                    />
                  )}
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                      {c.front || "(image question)"}
                    </p>
                    <p className="truncate text-slate-500">{c.back}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {[c.subject, c.topic].filter(Boolean).join(" · ") || "No subject"} · due{" "}
                      {c.due <= today ? "today" : c.due} · gap {formatInterval(c.interval)} ·{" "}
                      {c.reps} reps
                      {c.lapses > 0 ? ` · ${c.lapses} lapses` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-[11px]">
                    {c.source && (
                      <Link
                        href={`/notes?pdf=${c.source.pdfId}&page=${c.source.page}`}
                        className="text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        📄 p.{c.source.page}
                      </Link>
                    )}
                    <button onClick={() => setDialog({ card: c })} className="text-slate-500 hover:text-indigo-600">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(c)} className="text-slate-400 hover:text-red-600">
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {dialog && (
        <CardDialog
          initial={dialog.card}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setCards((list) =>
              list.some((c) => c.id === saved.id)
                ? list.map((c) => (c.id === saved.id ? saved : c))
                : [...list, saved],
            );
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}