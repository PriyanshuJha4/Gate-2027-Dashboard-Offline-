"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTimer, type TimerMode } from "@/lib/timerContext";
import { formatClock } from "@/lib/studySessions";
import { topicById } from "@/lib/topics";

export const MODE_ICON: Record<TimerMode, string> = {
  focus: "🍅",
  short_break: "☕",
  long_break: "🌴",
};

/** Compact timer for the sticky header (components/Sidebar.tsx). Click the time to open /timer. */
export default function MiniTimer() {
  const t = useTimer();
  const running = t.status === "running";
  const label = t.topicId ? topicById(t.topicId)?.name : t.subject;

  return (
    <div
      className={`flex shrink-0 items-center rounded-xl border text-sm ${
        running
          ? "border-indigo-300 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/40"
          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
      }`}
    >
      <Link
        href="/timer"
        title={label ? `${label} · open timer` : "Open timer"}
        className="flex items-center gap-1.5 rounded-l-xl py-1.5 pl-2.5 pr-2 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <span aria-hidden className={running ? "animate-pulse" : ""}>
          {MODE_ICON[t.mode]}
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums">{formatClock(t.remainingMs)}</span>
        {label && (
          <span className="hidden max-w-[10rem] truncate text-xs text-slate-500 dark:text-slate-400 lg:inline">
            {label}
          </span>
        )}
      </Link>
      <button
        type="button"
        onClick={running ? t.pause : t.start}
        aria-label={running ? "Pause timer" : t.status === "paused" ? "Resume timer" : "Start timer"}
        className="cursor-pointer rounded-r-xl border-l border-slate-200 px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {running ? "⏸" : "▶"}
      </button>
    </div>
  );
}

/**
 * Message after a session ends. Rendered from ClientLayout (NOT from the header: the header has
 * backdrop-blur, which would turn `fixed` into "fixed inside the header").
 */
export function TimerToast() {
  const { notice, dismissNotice } = useTimer();

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(dismissNotice, 8000);
    return () => clearTimeout(id);
  }, [notice, dismissNotice]);

  if (!notice) return null;
  return (
    <div
      role="status"
      onClick={dismissNotice}
      className="fixed bottom-4 right-4 z-[60] max-w-sm cursor-pointer rounded-2xl border border-indigo-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-xl dark:border-indigo-900 dark:bg-slate-900 dark:text-slate-100"
    >
      {notice.text}
    </div>
  );
}
