"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GATE_SYLLABUS } from "@/lib/syllabus";
import { isErrorDue, nextReviewDate } from "@/lib/errorReview";

/* ----------------------------- Types & helpers ---------------------------- */

type ImageAttachment = {
  id: string;
  name: string;
  dataUrl: string;
};

type Entry = {
  id: string;
  log_date: string;
  subject: string;
  topic: string;
  reason: string;
  question: string;
  source_url: string;
  my_answer: string;
  correct_answer: string;
  what_went_wrong: string;
  solution: string;
  images: ImageAttachment[];
  mastered: boolean;
  review_count: number;
  last_reviewed: string;
  next_review: string; // YYYY-MM-DD, "" = due now
};

type StatusFilter = "all" | "pending" | "scheduled" | "mastered";
type SortOrder = "newest" | "oldest";

const ITEMS_PER_PAGE = 6;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDate(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!m) return value || "—";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

function todayLocal() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function isSafeUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

// Supports both legacy images (array of strings) and the new object format
function normalizeImages(value: unknown, entryId: string): ImageAttachment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item: any, index: number) => {
      if (typeof item === "string") {
        return { id: `${entryId}-img-${index}`, name: "image", dataUrl: item };
      }
      if (item && typeof item.dataUrl === "string") {
        return {
          id: String(item.id || `${entryId}-img-${index}`),
          name: String(item.name || "image"),
          dataUrl: item.dataUrl,
        };
      }
      return null;
    })
    .filter(Boolean) as ImageAttachment[];
}

function normalizeEntry(raw: any): Entry {
  const id = String(raw.id);
  return {
    id,
    log_date: raw.log_date || "",
    subject: raw.subject || "",
    topic: raw.topic || "",
    reason: raw.reason || raw.mistake || "",
    question: raw.question || "",
    source_url: raw.source_url || "",
    my_answer: raw.my_answer || "",
    correct_answer: raw.correct_answer || "",
    what_went_wrong: raw.what_went_wrong || "",
    solution: raw.solution || "",
    images: normalizeImages(raw.images, id),
    mastered: Number(raw.mastered) === 1,
    review_count: Number(raw.review_count) || 0,
    last_reviewed: raw.last_reviewed || "",
    next_review: raw.next_review || "",
  };
}

const CONTROL_CLS =
  "w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:opacity-60";

/* -------------------------------- Component ------------------------------- */

export default function ErrorReviewList() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  const [subjectFilter, setSubjectFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [search, setSearch] = useState("");

  const [practiceMode, setPracticeMode] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const [page, setPage] = useState(1);
  const [lightbox, setLightbox] = useState<{
    images: ImageAttachment[];
    index: number;
  } | null>(null);

  /* ------------------------------- Data load ------------------------------ */

  const loadEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/error-logs");
      const data = await res.json();

      if (Array.isArray(data)) {
        setEntries(data.map(normalizeEntry));
        setLoadError("");
      } else {
        setLoadError(data?.error || "Could not load error logs.");
      }
    } catch (e) {
      console.error("Failed to load error logs", e);
      setLoadError("Could not load error logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Go back to page 1 whenever the filters change
  useEffect(() => {
    setPage(1);
  }, [subjectFilter, topicFilter, reasonFilter, statusFilter, sortOrder, search]);

  /* ------------------------------ Derived data ----------------------------- */

  const stats = useMemo(() => {
    const today = todayLocal();
    const mastered = entries.filter((e) => e.mastered).length;
    // "pending" = due today or overdue (same rule as the Today page: lib/errorReview.ts)
    const pending = entries.filter((e) => isErrorDue(e, today)).length;
    return {
      total: entries.length,
      mastered,
      pending,
      scheduled: entries.length - mastered - pending, // revised recently, next revision is later
    };
  }, [entries]);

  // Subject chips: syllabus order first, then any unknown subjects
  const subjectChips = useMemo(() => {
    const counts = new Map<string, number>();
    entries.forEach((e) => counts.set(e.subject, (counts.get(e.subject) || 0) + 1));

    const ordered: { subject: string; count: number }[] = [];
    GATE_SYLLABUS.forEach((s) => {
      if (counts.has(s.subject)) {
        ordered.push({ subject: s.subject, count: counts.get(s.subject)! });
        counts.delete(s.subject);
      }
    });
    counts.forEach((count, subject) => {
      if (subject) ordered.push({ subject, count });
    });
    return ordered;
  }, [entries]);

  // Topics that actually have logged mistakes (for the selected subject)
  const topicOptions = useMemo(() => {
    if (!subjectFilter) return [];
    const counts = new Map<string, number>();
    entries
      .filter((e) => e.subject === subjectFilter && e.topic)
      .forEach((e) => counts.set(e.topic, (counts.get(e.topic) || 0) + 1));

    const syllabusTopics =
      GATE_SYLLABUS.find((s) => s.subject === subjectFilter)?.topics || [];
    const ordered: { topic: string; count: number }[] = [];
    syllabusTopics.forEach((t) => {
      if (counts.has(t)) {
        ordered.push({ topic: t, count: counts.get(t)! });
        counts.delete(t);
      }
    });
    counts.forEach((count, topic) => ordered.push({ topic, count }));
    return ordered;
  }, [entries, subjectFilter]);

  const reasonOptions = useMemo(() => {
    const counts = new Map<string, number>();
    entries.forEach((e) => {
      if (e.reason) counts.set(e.reason, (counts.get(e.reason) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayLocal();

    const list = entries.filter((e) => {
      if (subjectFilter && e.subject !== subjectFilter) return false;
      if (topicFilter && e.topic !== topicFilter) return false;
      if (reasonFilter && e.reason !== reasonFilter) return false;
      if (statusFilter === "pending" && !isErrorDue(e, today)) return false;
      if (statusFilter === "scheduled" && (e.mastered || isErrorDue(e, today))) return false;
      if (statusFilter === "mastered" && !e.mastered) return false;

      if (q) {
        const haystack = [
          e.question,
          e.topic,
          e.subject,
          e.my_answer,
          e.correct_answer,
          e.what_went_wrong,
          e.solution,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) =>
      sortOrder === "newest"
        ? b.log_date.localeCompare(a.log_date)
        : a.log_date.localeCompare(b.log_date),
    );
    return list;
  }, [entries, subjectFilter, topicFilter, reasonFilter, statusFilter, search, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const paginatedEntries = useMemo(() => {
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filteredEntries.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredEntries, safePage]);

  const hasActiveFilters =
    !!subjectFilter ||
    !!topicFilter ||
    !!reasonFilter ||
    statusFilter !== "all" ||
    !!search.trim();

  function clearFilters() {
    setSubjectFilter("");
    setTopicFilter("");
    setReasonFilter("");
    setStatusFilter("all");
    setSearch("");
  }

  function goToPage(next: number) {
    setPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* -------------------------------- Actions -------------------------------- */

  async function patchEntry(
    id: string,
    payload: { mastered?: boolean; mark_reviewed?: boolean },
    optimistic: (e: Entry) => Entry,
  ) {
    const previous = entries;
    setActionError("");
    setEntries((list) => list.map((e) => (e.id === id ? optimistic(e) : e)));

    try {
      const res = await fetch("/api/error-logs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
    } catch (e: any) {
      console.error("Failed to update entry", e);
      setEntries(previous); // roll back
      setActionError(e?.message || "Could not update this entry.");
    }
  }

  function toggleMastered(entry: Entry) {
    patchEntry(entry.id, { mastered: !entry.mastered }, (e) => ({
      ...e,
      mastered: !e.mastered,
      // un-mastering makes the entry due again (the server clears next_review as well)
      next_review: e.mastered ? "" : e.next_review,
    }));
  }

  function markReviewed(entry: Entry) {
    patchEntry(entry.id, { mark_reviewed: true }, (e) => {
      const today = todayLocal();
      const count = e.review_count + 1;
      return {
        ...e,
        review_count: count,
        last_reviewed: today,
        // same gap table as the server (1 -> 3 -> 7 -> 14 -> 30 days)
        next_review: nextReviewDate(count, today),
      };
    });
  }

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /* ------------------------------ Lightbox keys ----------------------------- */

  useEffect(() => {
    if (!lightbox) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight") {
        setLightbox((lb) =>
          lb ? { ...lb, index: (lb.index + 1) % lb.images.length } : lb,
        );
      }
      if (e.key === "ArrowLeft") {
        setLightbox((lb) =>
          lb
            ? { ...lb, index: (lb.index - 1 + lb.images.length) % lb.images.length }
            : lb,
        );
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  /* --------------------------------- Render -------------------------------- */

  const progressPct =
    stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Header, stats and filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              🎯 Error Review & Revisit Mode
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Subject-wise and chapter-wise cards with full details for active
              revision.
            </p>
          </div>
          <Link
            href="/error-log"
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition text-center"
          >
            &larr; Back to Error Log
          </Link>
        </div>

        {/* Progress */}
        {stats.total > 0 && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 mb-1.5">
              <span>
                <strong className="text-slate-700 dark:text-slate-200">
                  {stats.total}
                </strong>{" "}
                total ·{" "}
                <strong className="text-amber-600 dark:text-amber-400">
                  {stats.pending}
                </strong>{" "}
                due ·{" "}
                <strong className="text-sky-600 dark:text-sky-400">
                  {stats.scheduled}
                </strong>{" "}
                scheduled ·{" "}
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {stats.mastered}
                </strong>{" "}
                mastered
              </span>
              <span>{progressPct}% mastered</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Subject chips */}
        {subjectChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setSubjectFilter("");
                setTopicFilter("");
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                !subjectFilter
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400"
              }`}
            >
              All ({stats.total})
            </button>
            {subjectChips.map(({ subject, count }) => (
              <button
                key={subject}
                onClick={() => {
                  setSubjectFilter(subject === subjectFilter ? "" : subject);
                  setTopicFilter("");
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                  subjectFilter === subject
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400"
                }`}
              >
                {subject} ({count})
              </button>
            ))}
          </div>
        )}

        {/* Dropdown filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            className={CONTROL_CLS}
            value={topicFilter}
            disabled={!subjectFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
          >
            <option value="">
              {subjectFilter ? "All Chapters / Topics" : "Select a Subject First"}
            </option>
            {topicOptions.map(({ topic, count }) => (
              <option key={topic} value={topic}>
                {topic} ({count})
              </option>
            ))}
          </select>

          <select
            className={CONTROL_CLS}
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value)}
          >
            <option value="">All Mistake Reasons</option>
            {reasonOptions.map(([reason, count]) => (
              <option key={reason} value={reason}>
                {reason} ({count})
              </option>
            ))}
          </select>

          <select
            className={CONTROL_CLS}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All Status</option>
            <option value="pending">Due for revision</option>
            <option value="scheduled">Scheduled for later</option>
            <option value="mastered">Mastered</option>
          </select>

          <select
            className={CONTROL_CLS}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <input
            type="search"
            placeholder="Search question, answer, solution..."
            className={CONTROL_CLS}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer select-none">
            <input
              type="checkbox"
              checked={practiceMode}
              onChange={(e) => {
                setPracticeMode(e.target.checked);
                setRevealed(new Set());
              }}
              className="rounded border-slate-300 cursor-pointer"
            />
            Practice mode (hide answers)
          </label>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {(loadError || actionError) && (
        <p className="text-xs text-red-600 px-1">{loadError || actionError}</p>
      )}

      {/* Result count */}
      {!loading && filteredEntries.length > 0 && (
        <p className="text-xs text-slate-500 px-1">
          Showing {(safePage - 1) * ITEMS_PER_PAGE + 1}–
          {Math.min(safePage * ITEMS_PER_PAGE, filteredEntries.length)} of{" "}
          {filteredEntries.length} entries
        </p>
      )}

      {/* Cards */}
      {loading ? (
        <p className="text-center text-sm text-slate-400 py-8">
          Loading review cards...
        </p>
      ) : filteredEntries.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-sm space-y-3">
          {entries.length === 0 ? (
            <>
              <p>No mistakes logged yet.</p>
              <Link
                href="/error-log"
                className="inline-block text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Log your first mistake →
              </Link>
            </>
          ) : (
            <>
              <p>No error logs match your filters.</p>
              <button
                onClick={clearFilters}
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {paginatedEntries.map((item) => {
            const hasAnswerContent = !!(
              item.my_answer ||
              item.correct_answer ||
              item.what_went_wrong ||
              item.solution ||
              item.source_url
            );
            const hidden =
              practiceMode && hasAnswerContent && !revealed.has(item.id);

            return (
              <article
                key={item.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl border p-5 shadow-sm space-y-4 ${
                  item.mastered
                    ? "border-emerald-200 dark:border-emerald-900/60"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                {/* Card header */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2">
                    <span className="font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                      {item.subject}
                    </span>
                    <span className="flex items-center gap-2 text-slate-400">
                      {item.mastered && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-medium">
                          ✓ Mastered
                        </span>
                      )}
                      {formatDate(item.log_date)}
                    </span>
                  </div>

                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                    {item.topic || "General Topic"}
                  </h3>

                  {item.reason && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-100 dark:border-red-900/50">
                      {item.reason}
                    </span>
                  )}
                </div>

                {/* Question */}
                <div className="text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    Question
                  </p>
                  <p className="whitespace-pre-wrap break-words text-slate-700 dark:text-slate-200">
                    {item.question || (item.images.length ? "See image(s) below." : "—")}
                  </p>
                </div>

                {/* Images */}
                {item.images.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {item.images.map((img, index) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() =>
                          setLightbox({ images: item.images, index })
                        }
                        className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 overflow-hidden hover:opacity-85 transition"
                        title="Click to zoom"
                      >
                        <img
                          src={img.dataUrl}
                          alt={img.name}
                          className="h-28 w-auto max-w-[14rem] object-contain"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {/* Answer section */}
                {hasAnswerContent &&
                  (hidden ? (
                    <button
                      onClick={() => toggleReveal(item.id)}
                      className="w-full py-2.5 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-800 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition"
                    >
                      👁 Reveal answer & solution
                    </button>
                  ) : (
                    <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                      {(item.my_answer || item.correct_answer) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {item.my_answer && (
                            <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 p-2">
                              <p className="font-semibold text-red-700 dark:text-red-400 mb-0.5">
                                My answer
                              </p>
                              <p className="whitespace-pre-wrap break-words">
                                {item.my_answer}
                              </p>
                            </div>
                          )}
                          {item.correct_answer && (
                            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 p-2">
                              <p className="font-semibold text-emerald-700 dark:text-emerald-400 mb-0.5">
                                Correct answer
                              </p>
                              <p className="whitespace-pre-wrap break-words">
                                {item.correct_answer}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {item.what_went_wrong && (
                        <div>
                          <p className="font-semibold text-slate-700 dark:text-slate-200 mb-0.5">
                            What went wrong
                          </p>
                          <p className="whitespace-pre-wrap break-words">
                            {item.what_went_wrong}
                          </p>
                        </div>
                      )}

                      {item.solution && (
                        <div>
                          <p className="font-semibold text-emerald-700 dark:text-emerald-400 mb-0.5">
                            Solution / Concept
                          </p>
                          <p className="whitespace-pre-wrap break-words">
                            {item.solution}
                          </p>
                        </div>
                      )}

                      {item.source_url && (
                        <div>
                          {isSafeUrl(item.source_url) ? (
                            <a
                              href={item.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 dark:text-indigo-400 hover:underline break-all"
                            >
                              🔗 Open source / reference
                            </a>
                          ) : (
                            <span className="break-all text-slate-500">
                              Source: {item.source_url}
                            </span>
                          )}
                        </div>
                      )}

                      {practiceMode && (
                        <button
                          onClick={() => toggleReveal(item.id)}
                          className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          Hide again
                        </button>
                      )}
                    </div>
                  ))}

                {/* Footer: revision tracking */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-[11px] text-slate-400">
                    {item.review_count > 0
                      ? `Revised ${item.review_count}× · last ${formatDate(item.last_reviewed)}`
                      : "Not revised yet"}
                    {!item.mastered && item.next_review > todayLocal()
                      ? ` · next ${formatDate(item.next_review)}`
                      : ""}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => markReviewed(item)}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                    >
                      ✔ Revised
                    </button>
                    <button
                      onClick={() => toggleMastered(item)}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                        item.mastered
                          ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                          : "bg-emerald-600 text-white hover:bg-emerald-500"
                      }`}
                    >
                      {item.mastered ? "Undo mastered" : "Mark mastered"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => goToPage(Math.max(safePage - 1, 1))}
            disabled={safePage === 1}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-slate-500 px-2">
            Page {safePage} of {totalPages}
          </span>
          <button
            onClick={() => goToPage(Math.min(safePage + 1, totalPages))}
            disabled={safePage === totalPages}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {/* Image lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative max-w-5xl max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightbox.images[lightbox.index].dataUrl}
              alt={lightbox.images[lightbox.index].name}
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl bg-white dark:bg-slate-900 p-2"
            />

            <button
              onClick={() => setLightbox(null)}
              className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-red-600 text-white font-bold text-sm shadow-md flex items-center justify-center hover:bg-red-500"
              aria-label="Close"
            >
              ×
            </button>

            {lightbox.images.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setLightbox({
                      ...lightbox,
                      index:
                        (lightbox.index - 1 + lightbox.images.length) %
                        lightbox.images.length,
                    })
                  }
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/60 text-white text-lg hover:bg-black/80"
                  aria-label="Previous image"
                >
                  ‹
                </button>
                <button
                  onClick={() =>
                    setLightbox({
                      ...lightbox,
                      index: (lightbox.index + 1) % lightbox.images.length,
                    })
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/60 text-white text-lg hover:bg-black/80"
                  aria-label="Next image"
                >
                  ›
                </button>
                <p className="text-center text-xs text-white/80 mt-2">
                  {lightbox.index + 1} / {lightbox.images.length}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
