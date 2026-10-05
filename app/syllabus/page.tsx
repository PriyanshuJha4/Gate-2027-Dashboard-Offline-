"use client";

import { useState, useEffect, useCallback } from "react";
import { SYLLABUS_DATA, CATEGORIES, countCompleted } from "@/lib/syllabusProgress";
import { progressKey } from "@/lib/topics";
import TopicResourcesPopover, { type PopoverAnchor } from "@/components/syllabus/TopicResourcesPopover";
import ApiStatusBanner from "@/components/ApiStatusBanner";
import { apiGet, apiSend, errText } from "@/lib/apiClient";



export default function SyllabusPage() {
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  // Short Notes popover: which topic + where the checkbox is on screen
  const [popover, setPopover] = useState<{ topicId: string; anchor: PopoverAnchor } | null>(null);
  const closePopover = useCallback(() => setPopover(null), []);

  const openPopover = (topicId: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPopover({ topicId, anchor: { top: r.top, bottom: r.bottom, left: r.left, width: r.width } });
  };

  const userId = "default_user";

  const fetchProgress = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet(`/api/syllabus-progress?userId=${userId}`);
      if (!data || typeof data !== "object") throw new Error("The server sent unexpected data.");
      setCompletedMap(data);
      setLoadError("");
    } catch (e) {
      console.error("Failed to load progress", e);
      // do NOT touch completedMap: an error must never look like "nothing completed"
      setLoadError(`Progress could not be loaded (${errText(e, "unknown error")}). Ticking is switched off so nothing gets overwritten.`);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  const toggleCategoryCheck = async (topicId: string, categoryKey: string) => {
    if (loadError) {
      setSaveError("Progress was not loaded, so changes are blocked. Press Retry first.");
      return;
    }
    const topicKeyStr = progressKey(topicId, categoryKey);
    const isChecked = !!completedMap[topicKeyStr];
    const newStatus = !isChecked;
    setSaveError("");

    // Optimistic UI update
    setCompletedMap((prev) => ({
      ...prev,
      [topicKeyStr]: newStatus,
    }));

    try {
      await apiSend("/api/syllabus-progress", "POST", {
        userId,
        topicKey: topicKeyStr,
        completed: newStatus,
      });
    } catch (e) {
      console.error("Failed to save progress", e);
      // put the checkbox back: it was NOT saved
      setCompletedMap((prev) => ({ ...prev, [topicKeyStr]: isChecked }));
      setSaveError(`This tick was NOT saved (${errText(e, "unknown error")}).`);
    }
  };

  let totalCheckpoints = 0;
  SYLLABUS_DATA.forEach((s) => {
    totalCheckpoints += s.topics.length * CATEGORIES.length;
  });

  const totalCompleted = countCompleted(completedMap);
  const overallPercentage = totalCheckpoints > 0 ? Math.round((totalCompleted / totalCheckpoints) * 100) : 0;

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header & Dashboard Summary */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              GATE 2027 Syllabus & Revision Tracker (SQLite)
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Mark Class Notes, Practice Questions, PYQs, and Short Notes as you complete them.
            </p>
          </div>

          <div className="text-right">
            <span className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
              {overallPercentage}%
            </span>
            <p className="text-xs text-slate-400 font-medium">
              {totalCompleted} / {totalCheckpoints} Checkpoints Completed
            </p>
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="mt-4 h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
            style={{ width: `${overallPercentage}%` }}
          />
        </div>
      </div>

      <ApiStatusBanner message={loadError} onRetry={fetchProgress} />
      <ApiStatusBanner message={saveError} onDismiss={() => setSaveError("")} />

      {loading && (
        <p className="text-sm text-slate-400 text-center py-4">
          Loading progress from SQLite database...
        </p>
      )}

      {/* Subject Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {SYLLABUS_DATA.map((itemGroup) => {
          const subjectTotal = itemGroup.topics.length * CATEGORIES.length;
          const subjectCompleted = itemGroup.topics.reduce((acc, topic) => {
            return (
              acc +
              CATEGORIES.filter((cat) => completedMap[progressKey(topic.id, cat.key)]).length
            );
          }, 0);
          const subjectPercent =
            subjectTotal > 0 ? Math.round((subjectCompleted / subjectTotal) * 100) : 0;

          return (
            <div
              key={itemGroup.subject}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{itemGroup.subject}</h2>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    subjectPercent === 100 ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300" : "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300"
                  }`}>
                    {subjectCompleted}/{subjectTotal} ({subjectPercent}%)
                  </span>
                </div>

                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-3 mb-4">
                  <div
                    className={`h-full transition-all duration-300 ${subjectPercent === 100 ? "bg-emerald-500" : "bg-indigo-500"}`}
                    style={{ width: `${subjectPercent}%` }}
                  />
                </div>

                {/* Table for Categories */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-semibold bg-slate-50 dark:bg-slate-800/50">
                        <th className="p-2.5">Chapter / Topic</th>
                        <th className="p-2 text-center w-16">Notes</th>
                        <th className="p-2 text-center w-16">Practice</th>
                        <th className="p-2 text-center w-16">PYQs</th>
                        <th className="p-2 text-center w-20">Short</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {itemGroup.topics.map((topic) => (
                        <tr key={topic.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/70 transition-colors">
                          <td className="p-2.5 font-medium text-slate-700 dark:text-slate-300">
                            {topic.name}
                          </td>
                          {CATEGORIES.map((cat) => {
                            const key = progressKey(topic.id, cat.key);
                            const isChecked = !!completedMap[key];
                            return (
                              <td key={cat.key} className="p-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      toggleCategoryCheck(topic.id, cat.key);
                                      // only the Short Notes tick opens the PDFs / flashcards popover (when ticking on)
                                      if (cat.key === "short_notes" && !isChecked) openPopover(topic.id, e.currentTarget);
                                    }}
                                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 dark:text-indigo-400 focus:ring-indigo-500 cursor-pointer"
                                  />
                                  {/* already ticked: lets you open the popover again without un-ticking */}
                                  {cat.key === "short_notes" && isChecked && (
                                    <button
                                      type="button"
                                      onClick={(e) => openPopover(topic.id, e.currentTarget)}
                                      aria-label={`PDFs and flashcards for ${topic.name}`}
                                      title="PDFs & flashcards"
                                      className="cursor-pointer text-[11px] leading-none text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                                    >
                                      📎
                                    </button>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {popover && <TopicResourcesPopover topicId={popover.topicId} anchor={popover.anchor} onClose={closePopover} />}
    </div>
  );
}