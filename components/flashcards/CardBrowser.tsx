"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GATE_SYLLABUS } from "@/lib/syllabus";
import { deleteCard, listCards, type Card } from "@/lib/notesDb";
import { todayStr } from "@/lib/srs";
import { topicIdByName } from "@/lib/topics";
import CardViewer from "@/components/flashcards/CardViewer";
import CardDialog from "@/components/flashcards/CardDialog";

type View = "grouped" | "grid";
type Status = "all" | "due" | "new" | "strong";
type Sort = "chapter" | "newest" | "due";

const NO_SUBJECT = "No subject";
const NO_TOPIC = "General";
const STRONG_DAYS = 21; // a card with a 21+ day gap counts as "strong"

/* ------------------------- Syllabus ordering helpers ---------------------- */

const SUBJECT_IDX = new Map<string, number>(
  GATE_SYLLABUS.map((s, i): [string, number] => [s.subject, i]),
);
const TOPIC_IDX = new Map<string, Map<string, number>>(
  GATE_SYLLABUS.map((s): [string, Map<string, number>] => [
    s.subject,
    new Map<string, number>(s.topics.map((t, i): [string, number] => [t, i])),
  ]),
);

function subjectRank(subject: string) {
  if (!subject) return 1000;
  return SUBJECT_IDX.get(subject) ?? 500;
}

function topicRank(subject: string, topic: string) {
  if (!topic) return 1000;
  return TOPIC_IDX.get(subject)?.get(topic) ?? 500;
}

/** Subject -> chapter (syllabus order) -> original notes order (PDF name, page) */
function chapterCompare(a: Card, b: Card): number {
  return (
    subjectRank(a.subject) - subjectRank(b.subject) ||
    a.subject.localeCompare(b.subject) ||
    topicRank(a.subject, a.topic) - topicRank(b.subject, b.topic) ||
    a.topic.localeCompare(b.topic) ||
    (a.source?.pdfName || "").localeCompare(b.source?.pdfName || "") ||
    (a.source?.page || 0) - (b.source?.page || 0) ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

/* --------------------------------- Tile ----------------------------------- */

function CardTile({
  card,
  today,
  onOpen,
}: {
  card: Card;
  today: string;
  onOpen: () => void;
}) {
  const isNew = card.reps === 0 && !card.lastReviewed;
  const isDue = card.due <= today;
  const isStrong = card.interval >= STRONG_DAYS;

  return (
    <button
      onClick={onOpen}
      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
    >
      <div className="flex h-36 w-full items-center justify-center bg-slate-50 dark:bg-slate-950">
        {card.frontImage ? (
          <img
            src={card.frontImage}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain"
          />
        ) : (
          <p className="line-clamp-5 px-3 text-xs text-slate-600 dark:text-slate-300">
            {card.front}
          </p>
        )}
      </div>

      <div className="space-y-1.5 p-3">
        {card.frontImage && card.front && (
          <p className="line-clamp-2 text-xs font-medium text-slate-800 dark:text-slate-100">
            {card.front}
          </p>
        )}
        <p className="line-clamp-2 text-[11px] text-slate-500">{card.back}</p>

        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          {isDue && !isNew && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
              Due
            </span>
          )}
          {isNew && (
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
              New
            </span>
          )}
          {isStrong && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              ✓ Strong
            </span>
          )}
          {card.source && (
            <span className="text-[10px] text-slate-400">p.{card.source.page}</span>
          )}
        </div>
      </div>
    </button>
  );
}

/* -------------------------------- Browser --------------------------------- */

const CONTROL_CLS =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white";

/** topicId (from ?topic=) limits the whole browser (chips, filters, viewer) to one syllabus topic. */
export default function CardBrowser({ topicId = null }: { topicId?: string | null }) {
  const [allCards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [subjectFilter, setSubjectFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [sort, setSort] = useState<Sort>("chapter");
  const [view, setView] = useState<View>("grouped");
  const [search, setSearch] = useState("");

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState<Card | null>(null);

  const today = todayStr();

  // Match by topic id (not by the exact text): "Dead Lock" and "Deadlock" cards both belong to the same topic
  const cards = useMemo(
    () => (topicId ? allCards.filter((c) => topicIdByName(c.topic, c.subject) === topicId) : allCards),
    [allCards, topicId],
  );

  useEffect(() => {
    (async () => {
      try {
        setCards(await listCards());
      } catch (e) {
        console.error(e);
        setLoadError("Could not read the browser storage (IndexedDB).");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Changing the subject resets the chapter filter
  useEffect(() => {
    setTopicFilter("");
  }, [subjectFilter]);

  /* ------------------------------ Derived data ---------------------------- */

  const subjectChips = useMemo(() => {
    const counts = new Map<string, number>();
    cards.forEach((c) => {
      const key = c.subject || NO_SUBJECT;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries()).sort(
      (a, b) =>
        subjectRank(a[0] === NO_SUBJECT ? "" : a[0]) -
          subjectRank(b[0] === NO_SUBJECT ? "" : b[0]) || a[0].localeCompare(b[0]),
    );
  }, [cards]);

  const topicOptions = useMemo(() => {
    if (!subjectFilter) return [];
    const subjectKey = subjectFilter === NO_SUBJECT ? "" : subjectFilter;
    const counts = new Map<string, number>();
    cards
      .filter((c) => c.subject === subjectKey)
      .forEach((c) => {
        const key = c.topic || NO_TOPIC;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    return Array.from(counts.entries()).sort(
      (a, b) =>
        topicRank(subjectKey, a[0] === NO_TOPIC ? "" : a[0]) -
          topicRank(subjectKey, b[0] === NO_TOPIC ? "" : b[0]) || a[0].localeCompare(b[0]),
    );
  }, [cards, subjectFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (subjectFilter && (c.subject || NO_SUBJECT) !== subjectFilter) return false;
      if (topicFilter && (c.topic || NO_TOPIC) !== topicFilter) return false;

      const isNew = c.reps === 0 && !c.lastReviewed;
      if (status === "due" && !(c.due <= today && !isNew)) return false;
      if (status === "new" && !isNew) return false;
      if (status === "strong" && c.interval < STRONG_DAYS) return false;

      if (q) {
        const hay = `${c.front} ${c.back} ${c.subject} ${c.topic}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [cards, subjectFilter, topicFilter, status, search, today]);

  const chapterSorted = useMemo(() => [...filtered].sort(chapterCompare), [filtered]);

  const flatSorted = useMemo(() => {
    if (sort === "newest") {
      return [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    if (sort === "due") {
      return [...filtered].sort(
        (a, b) => a.due.localeCompare(b.due) || a.createdAt.localeCompare(b.createdAt),
      );
    }
    return chapterSorted;
  }, [filtered, sort, chapterSorted]);

  // Subject -> chapter groups (in syllabus order)
  const groups = useMemo(() => {
    const out: {
      subject: string;
      count: number;
      topics: { topic: string; cards: Card[] }[];
    }[] = [];

    for (const c of chapterSorted) {
      const s = c.subject || NO_SUBJECT;
      const t = c.topic || NO_TOPIC;

      let g = out[out.length - 1];
      if (!g || g.subject !== s) {
        g = { subject: s, count: 0, topics: [] };
        out.push(g);
      }
      g.count += 1;

      let tg = g.topics[g.topics.length - 1];
      if (!tg || tg.topic !== t) {
        tg = { topic: t, cards: [] };
        g.topics.push(tg);
      }
      tg.cards.push(c);
    }
    return out;
  }, [chapterSorted]);

  // The viewer moves through exactly what is shown on the screen
  const viewerList = view === "grouped" ? chapterSorted : flatSorted;

  const hasFilters = !!subjectFilter || !!topicFilter || status !== "all" || !!search.trim();

  function clearFilters() {
    setSubjectFilter("");
    setTopicFilter("");
    setStatus("all");
    setSearch("");
  }

  function openCard(card: Card) {
    const i = viewerList.findIndex((c) => c.id === card.id);
    if (i >= 0) setViewerIndex(i);
  }

  /* -------------------------------- Actions ------------------------------- */

  const closeViewer = useCallback(() => setViewerIndex(null), []);

  async function handleDelete(card: Card) {
    if (!window.confirm("Delete this flashcard?")) return;
    try {
      await deleteCard(card.id);
      setCards((list) => list.filter((c) => c.id !== card.id));
    } catch (e) {
      console.error(e);
      setLoadError("Could not delete the card.");
    }
  }

  /* --------------------------------- Render ------------------------------- */

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-400">Loading flashcards...</p>;
  }

  return (
    <div className="space-y-5 pb-12">
      {loadError && <p className="text-xs text-red-600">{loadError}</p>}

      {/* Header + controls */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              📖 Flashcard Library
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Browse every saved flashcard subject-wise and chapter-wise. Click a card to open it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              onClick={() => setViewerIndex(0)}
              disabled={viewerList.length === 0}
              className="rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              ▶ Start revision ({viewerList.length})
            </button>
            <Link
              href="/flashcards"
              className="rounded-lg bg-slate-100 px-3 py-2 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              &larr; Today&apos;s review
            </Link>
          </div>
        </div>

        {/* Subject chips */}
        {subjectChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSubjectFilter("")}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                !subjectFilter
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
              }`}
            >
              All ({cards.length})
            </button>
            {subjectChips.map(([subject, count]) => (
              <button
                key={subject}
                onClick={() => setSubjectFilter(subject === subjectFilter ? "" : subject)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  subjectFilter === subject
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                }`}
              >
                {subject} ({count})
              </button>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            className={CONTROL_CLS}
            value={topicFilter}
            disabled={!subjectFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
          >
            <option value="">
              {subjectFilter ? "All chapters / topics" : "Select a subject first"}
            </option>
            {topicOptions.map(([topic, count]) => (
              <option key={topic} value={topic}>
                {topic} ({count})
              </option>
            ))}
          </select>

          <select
            className={CONTROL_CLS}
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
          >
            <option value="all">All cards</option>
            <option value="due">Due for review</option>
            <option value="new">New (never reviewed)</option>
            <option value="strong">Strong (21+ day gap)</option>
          </select>

          <select
            className={CONTROL_CLS}
            value={sort}
            disabled={view === "grouped"}
            onChange={(e) => setSort(e.target.value as Sort)}
            title={view === "grouped" ? "Grouped view always uses chapter order" : ""}
          >
            <option value="chapter">Chapter order</option>
            <option value="newest">Newest first</option>
            <option value="due">Due soonest</option>
          </select>

          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(
              [
                ["grouped", "By chapter"],
                ["grid", "All in grid"],
              ] as [View, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  view === id
                    ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-indigo-300"
                    : "text-slate-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search question, answer, chapter..."
            className={`${CONTROL_CLS} flex-1`}
          />
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="whitespace-nowrap text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Result count */}
      {cards.length > 0 && (
        <p className="px-1 text-xs text-slate-500">
          Showing {filtered.length} of {cards.length} cards
        </p>
      )}

      {/* Content */}
      {cards.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-3xl">🃏</p>
          <p>No flashcards saved yet.</p>
          <Link href="/notes" className="inline-block text-indigo-600 hover:underline dark:text-indigo-400">
            Create your first card from a PDF →
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          <p>No cards match your filters.</p>
          <button onClick={clearFilters} className="text-indigo-600 hover:underline dark:text-indigo-400">
            Clear filters
          </button>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {flatSorted.map((c) => (
            <CardTile key={c.id} card={c} today={today} onOpen={() => openCard(c)} />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <details
              key={g.subject}
              open
              className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <summary className="flex cursor-pointer select-none items-center justify-between px-5 py-3">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {g.subject}
                </span>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                  {g.count} card{g.count > 1 ? "s" : ""}
                </span>
              </summary>

              <div className="space-y-4 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
                {g.topics.map((t) => (
                  <details key={t.topic} open>
                    <summary className="mb-2 flex cursor-pointer select-none items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <span>{t.topic}</span>
                      <span className="font-normal text-slate-400">({t.cards.length})</span>
                    </summary>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {t.cards.map((c) => (
                        <CardTile key={c.id} card={c} today={today} onOpen={() => openCard(c)} />
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}

      {/* Big card viewer (hidden while the edit dialog is open, position is kept) */}
      {viewerIndex !== null && !editing && (
        <CardViewer
          cards={viewerList}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={closeViewer}
          onEdit={(c) => setEditing(c)}
          onDelete={handleDelete}
        />
      )}

      {editing && (
        <CardDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setCards((list) => list.map((c) => (c.id === saved.id ? saved : c)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
