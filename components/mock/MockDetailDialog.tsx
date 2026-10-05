"use client";

import { useEffect, useMemo } from "react";
import SectionBreakdown from "@/components/mock/SectionBreakdown";
import { topicById } from "@/lib/topics";
import { fmtMarks, reasonLabel, round2, summarizeSections, type MockTest } from "@/lib/mockScoring";

interface Props {
  test: MockTest;
  onClose: () => void;
  /** When given, an "Edit" button is shown. */
  onEdit?: (test: MockTest) => void;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export default function MockDetailDialog({ test, onClose, onEdit }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const totals = useMemo(() => summarizeSections(test.sections), [test.sections]);
  const hasSections = test.sections.length > 0;

  const losses = useMemo(
    () => [...test.topic_losses].sort((a, b) => b.marks_lost - a.marks_lost),
    [test.topic_losses],
  );
  const lostTotal = round2(losses.reduce((a, l) => a + l.marks_lost, 0));
  const lostMax = losses[0]?.marks_lost || 1;

  const byReason = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of test.topic_losses) m.set(l.reason, round2((m.get(l.reason) || 0) + l.marks_lost));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [test.topic_losses]);

  const pct = test.max_score > 0 ? Math.round((test.score / test.max_score) * 100) : 0;
  const gap = round2(test.max_score - test.score); // marks not scored in total
  const neg = hasSections ? totals.neg_marks : test.negative_marks;
  const usedMin = totals.time_min;

  const title = test.test_name || test.subject;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Mock test detail: ${title}`}
        className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b dark:border-slate-800">
          <div className="min-w-0">
            <h4 className="font-semibold text-lg text-slate-900 dark:text-white truncate">{title}</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {test.test_date}
              {test.test_name && test.subject ? ` · ${test.subject}` : ""}
              {test.duration_min ? ` · ${test.duration_min} min paper` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile label="Net score" value={`${fmtMarks(test.score)} / ${fmtMarks(test.max_score)}`} sub={`${pct}%`} />
            <Tile label="Negative marks" value={neg > 0 ? `−${fmtMarks(neg)}` : "0"} />
            <Tile
              label="Accuracy"
              value={totals.accuracy === null ? "—" : `${totals.accuracy}%`}
              sub={hasSections ? `${totals.correct} of ${totals.attempted} attempted` : undefined}
            />
            <Tile
              label="Time"
              value={usedMin > 0 ? `${usedMin} min` : "—"}
              sub={test.duration_min ? `of ${test.duration_min} min` : undefined}
            />
          </div>

          <section>
            <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">Section-wise</h5>
            <SectionBreakdown sections={test.sections} durationMin={test.duration_min} />
          </section>

          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Where the marks went</h5>
              {losses.length > 0 && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {fmtMarks(lostTotal)} marks traced to topics · {fmtMarks(gap)} marks short of full
                </span>
              )}
            </div>

            {losses.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No topic-wise losses were logged for this test.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {losses.map((l) => {
                    const t = topicById(l.topic_id);
                    return (
                      <div key={l.topic_id} className="p-3 rounded-xl border dark:border-slate-800">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                              {t?.name ?? l.topic_id}
                            </div>
                            <div className="text-xs text-slate-400 truncate">{t?.subject ?? "Unknown topic"}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {l.reason && (
                              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                {reasonLabel(l.reason)}
                              </span>
                            )}
                            <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                              −{fmtMarks(l.marks_lost)}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div className="h-full bg-red-400" style={{ width: `${(l.marks_lost / lostMax) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {byReason.length > 1 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {byReason.map(([reason, marks]) => (
                      <span
                        key={reason || "none"}
                        className="text-xs px-2.5 py-1 rounded-full border dark:border-slate-700 text-slate-600 dark:text-slate-300"
                      >
                        {reasonLabel(reason)}: <b>{fmtMarks(marks)}</b>
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t dark:border-slate-800">
          {onEdit && (
            <button
              onClick={() => onEdit(test)}
              className="px-3.5 py-1.5 text-sm rounded-lg border dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Edit
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
