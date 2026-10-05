"use client";

import { useState, useEffect, useCallback } from "react";
import { GATE_DAILY_SCHEDULE } from "@/lib/dailySchedule";
import ApiStatusBanner from "@/components/ApiStatusBanner";
import { apiGet, apiSend, errText } from "@/lib/apiClient";

export default function TodoList() {
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  const [customTasks, setCustomTasks] = useState<Record<string, string>>({});
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [tempTaskText, setTempTaskText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");

  const fetchTasks = useCallback(async () => {
    try {
      const data = await apiGet("/api/todo-list");
      if (!data || typeof data !== "object") throw new Error("The server sent unexpected data.");
      setCompletedMap(data.todoMap || {});
      setCustomTasks(data.taskMap || {});
      setLoadError("");
    } catch (e) {
      console.error("Failed to fetch todo tasks", e);
      // keep whatever is on screen; an error must never look like "no tasks done"
      setLoadError(`To-do data could not be loaded (${errText(e, "unknown error")}). Changes are switched off until it loads.`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const toggleTask = async (date: string, currentStatus: boolean) => {
    if (loadError) {
      setSaveError("To-do data was not loaded, so changes are blocked. Press Retry first.");
      return;
    }
    const newStatus = !currentStatus;
    setSaveError("");
    setCompletedMap((prev) => ({ ...prev, [date]: newStatus }));

    try {
      await apiSend("/api/todo-list", "POST", { date, completed: newStatus });
    } catch (e) {
      console.error("Failed to update task status", e);
      setCompletedMap((prev) => ({ ...prev, [date]: currentStatus }));
      setSaveError(`This tick was NOT saved (${errText(e, "unknown error")}).`);
    }
  };

  const saveEditedTask = async (date: string) => {
    if (!tempTaskText.trim()) return;
    if (loadError) {
      setSaveError("To-do data was not loaded, so changes are blocked. Press Retry first.");
      return;
    }
    const before = customTasks[date];
    setSaveError("");
    setCustomTasks((prev) => ({ ...prev, [date]: tempTaskText }));
    setEditingDate(null);

    try {
      await apiSend("/api/todo-list", "POST", { date, task: tempTaskText });
    } catch (e) {
      console.error("Failed to save edited task text", e);
      // restore the old text and re-open the editor so the typed text is not lost
      setCustomTasks((prev) => {
        const next = { ...prev };
        if (before === undefined) delete next[date];
        else next[date] = before;
        return next;
      });
      setEditingDate(date);
      setSaveError(`This task text was NOT saved (${errText(e, "unknown error")}). Your text is still in the box.`);
    }
  };

  const completedCount = Object.values(completedMap).filter(Boolean).length;
  const totalCount = GATE_DAILY_SCHEDULE.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6 pb-16">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            GATE 2027 Daily To-Do Tracker (Editable & SQLite Synced)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Track and customize your daily targets from 1 October 2026 to 31 January 2027.
          </p>
        </div>
        <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 px-4 py-2 rounded-xl text-xs font-bold">
          Progress: {progressPct}% ({completedCount}/{totalCount} Days)
        </div>
      </div>

      <ApiStatusBanner message={loadError} onRetry={fetchTasks} />
      <ApiStatusBanner message={saveError} onDismiss={() => setSaveError("")} />

      {loading && <p className="text-sm text-slate-400 text-center py-4">Loading tasks from database...</p>}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-3">
        {GATE_DAILY_SCHEDULE.map((item) => {
          const isDone = !!completedMap[item.date];
          const taskText = customTasks[item.date] !== undefined ? customTasks[item.date] : item.task;
          const isEditing = editingDate === item.date;

          return (
            <div
              key={item.date}
              className={`flex items-center justify-between p-3 rounded-xl border text-xs transition-colors ${
                isDone
                  ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300"
                  : "bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-3 flex-1 mr-4">
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => toggleTask(item.date, isDone)}
                  className="rounded border-slate-300 dark:border-slate-600 h-4 w-4 text-indigo-600 dark:text-indigo-400 cursor-pointer shrink-0"
                />
                <div className="flex-1">
                  <span className="font-bold text-slate-500 dark:text-slate-400 block text-[10px]">{item.date}</span>
                  {isEditing ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="text"
                        value={tempTaskText}
                        onChange={(e) => setTempTaskText(e.target.value)}
                        className="w-full border rounded px-2 py-1 text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                      />
                      <button
                        onClick={() => saveEditedTask(item.date)}
                        className="px-2.5 py-1 bg-indigo-600 text-white rounded text-[10px] font-medium"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingDate(null)}
                        className="px-2 py-1 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300 rounded text-[10px]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span className={`font-medium block mt-0.5 ${isDone ? "line-through text-slate-400" : "text-slate-800 dark:text-slate-100"}`}>
                      {taskText}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!isEditing && (
                  <button
                    onClick={() => {
                      setEditingDate(item.date);
                      setTempTaskText(taskText);
                    }}
                    className="px-2.5 py-1 border rounded text-[10px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Edit
                  </button>
                )}
                <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${isDone ? "bg-emerald-200 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400"}`}>
                  {isDone ? "Done ✓" : "Pending"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}