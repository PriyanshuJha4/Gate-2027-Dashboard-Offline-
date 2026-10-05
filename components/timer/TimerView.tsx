"use client";

import { useCallback, useEffect, useState } from "react";
import PomodoroTimer from "./PomodoroTimer";
import StreakHeatmap from "./StreakHeatmap";
import { useTimer } from "@/lib/timerContext";
import { KIND_LABEL, formatDuration, type SessionKind, type Streaks } from "@/lib/studySessions";
import { topicName } from "@/lib/topics";

type StatsData = {
  today: string;
  days: Record<string, number>;
  streak: Streaks;
  todayStats: { focus_sec: number; sessions: number };
  totals: { focus_sec: number; sessions: number; active_days: number };
  bySubject: { subject: string; focus_sec: number; sessions: number }[];
  recent: {
    id: string;
    date: string;
    subject: string;
    topic_id: string | null;
    duration_sec: number;
    kind: SessionKind;
    created_at: string | null;
  }[];
};

const CARD = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";

export default function TimerView() {
  const { sessionsVersion } = useTimer();
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/study-sessions", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
      setError("");
    } catch (e: any) {
      setError(e?.message || "Could not load study stats");
    }
  }, []);

  // refetch on open and every time the timer saves a session (even if it ended on another page)
  useEffect(() => {
    void load();
  }, [load, sessionsVersion]);

  const remove = async (id: string) => {
    if (!window.confirm("Delete this session from your history?")) return;
    try {
      await fetch(`/api/study-sessions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } finally {
      void load();
    }
  };

  const maxSubject = data?.bySubject[0]?.focus_sec || 1;

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">⏱️ Pomodoro Timer</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          The timer keeps running when you switch pages. It is also shown in the top bar.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <PomodoroTimer />
        </div>
        <div className="grid content-start gap-4 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-1">
          <StatCard label="Focus today" value={data ? formatDuration(data.todayStats.focus_sec) : "…"} sub={data ? `${data.todayStats.sessions} session${data.todayStats.sessions === 1 ? "" : "s"}` : ""} />
          <StatCard label="Current streak" value={data ? `${data.streak.current} ${data.streak.current === 1 ? "day" : "days"}` : "…"} sub={data ? `longest ${data.streak.longest}` : ""} />
          <StatCard label="All time" value={data ? formatDuration(data.totals.focus_sec) : "…"} sub={data ? `${data.totals.sessions} sessions · ${data.totals.active_days} days` : ""} />
        </div>
      </div>

      <StreakHeatmap
        days={data?.days ?? {}}
        streak={data?.streak ?? { current: 0, longest: 0 }}
        today={data?.today ?? clientToday()}
        totalFocusSec={data?.totals.focus_sec ?? 0}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <div className={CARD}>
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-slate-100">Focus by subject</h3>
          {!data || data.bySubject.length === 0 ? (
            <p className="text-sm text-slate-400">No focus sessions yet. Start the timer!</p>
          ) : (
            <div className="space-y-3">
              {data.bySubject.map((s) => (
                <div key={s.subject}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-200">{s.subject}</span>
                    <span className="text-slate-500 dark:text-slate-400">{formatDuration(s.focus_sec)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-2 rounded-full bg-indigo-500"
                      style={{ width: `${Math.max(3, Math.round((s.focus_sec / maxSubject) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={CARD}>
          <h3 className="mb-3 font-semibold text-slate-800 dark:text-slate-100">Recent sessions</h3>
          {!data || data.recent.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing logged yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                      {r.topic_id ? topicName(r.topic_id) : r.subject || "No subject"}
                    </div>
                    <div className="text-xs text-slate-400">
                      {r.date} · {KIND_LABEL[r.kind] ?? r.kind}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`text-sm font-semibold ${r.kind === "focus" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"}`}>
                      {formatDuration(r.duration_sec)}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      aria-label="Delete session"
                      className="cursor-pointer text-slate-300 hover:text-rose-500"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={CARD}>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-2xl font-semibold text-indigo-600 dark:text-indigo-400">{value}</div>
      <div className="text-xs text-slate-400">{sub || "\u00A0"}</div>
    </div>
  );
}

// only used until the first API response arrives (the heatmap needs "today" to outline it)
function clientToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
