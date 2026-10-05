"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { generateDailySchedule, DayPlan } from "@/lib/roadmapPlan";
import {
  SYLLABUS_END,
  REVISION_END,
  PLAN_END,
  addDaysISO,
  formatMilestoneDate,
  formatMonthYear,
} from "@/lib/milestones";
import ApiStatusBanner from "@/components/ApiStatusBanner";
import { apiGet, apiSend, errText } from "@/lib/apiClient";

export default function RoadmapPage() {
  const [plans, setPlans] = useState<DayPlan[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editTopic, setEditTopic] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");

  const loadPlans = useCallback(async () => {
    const defaultSchedule = generateDailySchedule();
    try {
      const json = await apiGet("/api/roadmap");
      if (json && json.data && !Array.isArray(json.data)) {
        throw new Error("the saved plan is in an unexpected format");
      }
      if (json && Array.isArray(json.data)) {
        setPlans(json.data);
      } else {
        // the server answered fine and nothing is saved yet: a first start, so the default plan is correct
        setPlans(defaultSchedule);
      }
      setLoadError("");
    } catch (e) {
      console.error("Failed to load roadmap schedule", e);
      // IMPORTANT: do not show the default plan here. Editing it would overwrite your saved plan.
      setLoadError(`Your study plan could not be loaded (${errText(e, "unknown error")}). Editing is switched off so your saved plan is not overwritten.`);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const saveToDb = async (updated: DayPlan[]) => {
    if (loadError) {
      setSaveError("The plan was not loaded, so changes are blocked. Press Retry first.");
      return;
    }
    const previous = plans;
    setSaveError("");
    setPlans(updated);
    try {
      await apiSend("/api/roadmap", "POST", { data: updated });
    } catch (e) {
      console.error("Failed to save roadmap schedule", e);
      setPlans(previous); // it was NOT saved: show the real state again
      setSaveError(`This change was NOT saved (${errText(e, "unknown error")}).`);
    }
  };

  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const visiblePlans = useMemo(() => {
    return plans.filter((p) => {
      const isUpcoming = p.date >= todayStr;
      if (!isUpcoming) return false;
      if (selectedMonth === "ALL") return true;
      return p.date.startsWith(selectedMonth);
    });
  }, [plans, todayStr, selectedMonth]);

  const toggleTask = (date: string, taskKey: keyof DayPlan["tasks"]) => {
    const updated = plans.map((p) => {
      if (p.date === date) {
        return {
          ...p,
          tasks: { ...p.tasks, [taskKey]: !p.tasks[taskKey] },
        };
      }
      return p;
    });
    saveToDb(updated);
  };

  const startEditRow = (plan: DayPlan) => {
    setEditingDate(plan.date);
    setEditSubject(plan.subject === "—" ? "" : plan.subject);
    setEditTopic(plan.topic.includes("Final Buffer") ? "" : plan.topic);
  };

  const saveEditRow = (date: string) => {
    const updated = plans.map((p) => {
      if (p.date === date) {
        return {
          ...p,
          subject: editSubject.trim() || "—",
          topic: editTopic.trim() || "Free / Buffer Day",
        };
      }
      return p;
    });
    saveToDb(updated);
    setEditingDate(null);
  };

  return (
    <div className="space-y-6 pb-12">
      <ApiStatusBanner message={loadError} onRetry={loadPlans} />
      <ApiStatusBanner message={saveError} onDismiss={() => setSaveError("")} />
      {/* Top Controller */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            GATE 2027 Master Study Plan
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            <strong>Syllabus Delivery:</strong> Till {formatMilestoneDate(SYLLABUS_END)} |{" "}
            <strong>Intensive Revision:</strong> {formatMilestoneDate(addDaysISO(SYLLABUS_END, 1), false)} –{" "}
            {formatMilestoneDate(REVISION_END)} |{" "}
            <strong>Taper/Exam:</strong> {formatMonthYear(PLAN_END)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-xs border rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-800/50 outline-none text-slate-700 dark:text-slate-300"
          >
            <option value="ALL">All Months</option>
            <option value="2026-09">Sep 2026</option>
            <option value="2026-10">Oct 2026</option>
            <option value="2026-11">Nov 2026 (Syllabus End)</option>
            <option value="2026-12">Dec 2026 (Revision)</option>
            <option value="2027-01">Jan 2027 (Revision End)</option>
            <option value="2027-02">Feb 2027 (Exam Buffer)</option>
          </select>

          <button
            onClick={() => {
              setIsEditMode(!isEditMode);
              setEditingDate(null);
            }}
            className={`text-xs px-3.5 py-2 rounded-lg font-medium transition-colors ${
              isEditMode
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
            }`}
          >
            {isEditMode ? "Done Editing" : "Edit Rows"}
          </button>
        </div>
      </div>

      {/* Rows */}
      <div className="space-y-2.5">
        {visiblePlans.map((plan) => {
          const isToday = plan.date === todayStr;
          const isRowEditing = editingDate === plan.date;
          const isBlank = plan.phase === "BLANK";

          return (
            <div
              key={plan.date}
              className={`rounded-xl border p-4 transition-all shadow-sm ${
                isToday
                  ? "border-indigo-500 ring-2 ring-indigo-100 dark:ring-indigo-900 bg-indigo-50/20 dark:bg-indigo-950/20"
                  : isBlank
                  ? "border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Date & Content */}
                <div className="flex items-start gap-4 min-w-[320px]">
                  <div
                    className={`text-center rounded-lg px-2.5 py-1.5 shrink-0 border ${
                      isBlank
                        ? "bg-slate-200/50 dark:bg-slate-700/50 border-slate-300 dark:border-slate-600 text-slate-400"
                        : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <span className="block text-[10px] font-bold uppercase">
                      {plan.dayName}
                    </span>
                    <span className="block text-sm font-extrabold text-slate-800 dark:text-slate-100">
                      {plan.date.split("-")[2]}
                    </span>
                    <span className="block text-[9px] text-slate-400">
                      {plan.date.split("-")[1]}/{plan.date.split("-")[0].slice(2)}
                    </span>
                  </div>

                  <div className="overflow-hidden flex-1">
                    {isRowEditing ? (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          placeholder="Subject"
                          className="w-full text-xs font-semibold border rounded px-2 py-1 outline-none"
                        />
                        <input
                          type="text"
                          value={editTopic}
                          onChange={(e) => setEditTopic(e.target.value)}
                          placeholder="Topic / Content"
                          className="w-full text-xs border rounded px-2 py-1 outline-none"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                              plan.phase === "SYLLABUS"
                                ? "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300"
                                : plan.phase === "REVISION"
                                ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                            }`}
                          >
                            {plan.phase === "BLANK" ? "BLANK BUFFER" : plan.subject}
                          </span>
                          {isToday && (
                            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-2 py-0.5 rounded-full">
                              TODAY
                            </span>
                          )}
                        </div>
                        <p
                          className={`text-sm mt-1 truncate ${
                            isBlank
                              ? "text-slate-400 font-normal italic"
                              : "text-slate-800 dark:text-slate-100 font-medium"
                          }`}
                        >
                          {plan.topic}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Non-Negotiable Tasks */}
                {!isBlank ? (
                  <div className="flex flex-wrap items-center gap-1.5 lg:gap-2 text-xs">
                    {(
                      [
                        { key: "classNotes", label: "Notes" },
                        { key: "dpp", label: "DPP" },
                        { key: "pyqs", label: "PYQs" },
                        { key: "mockTest", label: "Mock" },
                        { key: "errorLog", label: "Errors" },
                        { key: "shortNotes", label: "Revision" },
                      ] as { key: keyof DayPlan["tasks"]; label: string }[]
                    ).map((t) => (
                      <button
                        key={t.key}
                        onClick={() => toggleTask(plan.date, t.key)}
                        className={`px-2 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                          plan.tasks[t.key]
                            ? "bg-emerald-500 text-white border-emerald-600"
                            : "bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                      >
                        ✓ {t.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic">
                    Blank buffer window (Reserved for exam)
                  </div>
                )}

                {/* Edit Button */}
                {isEditMode && (
                  <div className="flex items-center justify-end gap-2 border-t pt-2 lg:border-t-0 lg:pt-0">
                    {isRowEditing ? (
                      <>
                        <button
                          onClick={() => saveEditRow(plan.date)}
                          className="px-2.5 py-1 bg-indigo-600 text-white rounded text-xs font-semibold"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingDate(null)}
                          className="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => startEditRow(plan)}
                        className="px-2.5 py-1 text-xs border rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}