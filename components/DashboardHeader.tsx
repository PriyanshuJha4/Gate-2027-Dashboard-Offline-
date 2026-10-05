"use client";

import { useEffect, useState, useCallback } from "react";
import LiveClock from "./LiveClock";
import { daysRemaining, formatCountdownLabel } from "@/lib/countdown";
import { SYLLABUS_DATA, CATEGORIES, countCompleted } from "@/lib/syllabusProgress";
import { SYLLABUS_END } from "@/lib/milestones";
import { apiGet } from "@/lib/apiClient";

const SYLLABUS_DEADLINE_DATE = SYLLABUS_END; // single source: lib/milestones.ts

export default function DashboardHeader() {
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [mockTests, setMockTests] = useState<any[]>([]);
  // true = the data could not be loaded (shown as a message instead of a misleading 0%)
  const [syllabusFailed, setSyllabusFailed] = useState(false);
  const [mocksFailed, setMocksFailed] = useState(false);

  // 4 categories ke hisaab se total checkpoints
  const totalTopics = SYLLABUS_DATA.reduce(
    (acc, curr) => acc + curr.topics.length * CATEGORIES.length,
    0
  );

  const loadDatabaseData = useCallback(async () => {
    // The two loads are independent: one failing must not hide the other.
    try {
      // 1. Load Mocks from SQLite API (/api/mock-tests)
      const mockData = await apiGet("/api/mock-tests");
      if (!Array.isArray(mockData)) throw new Error("unexpected mock-test data");
      setMockTests(mockData);
      setMocksFailed(false);
    } catch (err) {
      console.error("Error loading mock tests:", err);
      setMocksFailed(true);
    }

    try {
      // 2. Load Syllabus Progress from SQLite API (/api/syllabus-progress)
      const data = await apiGet(`/api/syllabus-progress?userId=default_user`);
      if (!data || typeof data !== "object") throw new Error("unexpected progress data");
      setCompletedCount(countCompleted(data as Record<string, boolean>));
      setSyllabusFailed(false);
    } catch (err) {
      console.error("Error loading syllabus progress:", err);
      setSyllabusFailed(true);
    }
  }, []);

  useEffect(() => {
    loadDatabaseData();
  }, [loadDatabaseData]);

  const syllabusPct =
    totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0;

  const latestTest = mockTests.length > 0 ? mockTests[mockTests.length - 1] : null;
  const lastScorePct =
    latestTest && latestTest.max_score > 0
      ? Math.round((latestTest.score / latestTest.max_score) * 100)
      : null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 mb-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Welcome, Aspirant
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            GATE 2027 Dashboard (SQLite Synced)
          </p>
        </div>
        <LiveClock />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
        <Metric
          label="Days to Syllabus Deadline"
          value={formatCountdownLabel(daysRemaining(SYLLABUS_DEADLINE_DATE))}
        />
        <Metric
          label="Syllabus Completion"
          value={syllabusFailed ? "Could not load data" : `${syllabusPct}% (${completedCount}/${totalTopics})`}
        />
        <Metric
          label="Last Mock Test Score"
          value={
            mocksFailed
              ? "Could not load data"
              : lastScorePct !== null
                ? `${lastScorePct}% (${latestTest?.score}/${latestTest?.max_score})`
                : "No tests yet"
          }
        />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">{value}</div>
    </div>
  );
}