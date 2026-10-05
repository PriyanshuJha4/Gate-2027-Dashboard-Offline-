"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  MILESTONES,
  PLAN_END,
  PLAN_START,
  addDaysISO,
  formatMilestoneDate,
  isoToLocalDate,
} from "@/lib/milestones";
import { HEAT_STEPS_MIN, formatDuration, heatLevel, type Streaks } from "@/lib/studySessions";

// Same card look as components/ReverseCalendar.tsx, and the grid runs over the same plan window
// (PLAN_START .. PLAN_END from lib/milestones.ts); the key milestones are marked with an amber ring.

// literal class names on purpose (Tailwind only keeps classes it can see in the source)
const LEVEL_CLASS = [
  "bg-slate-100 dark:bg-slate-800",
  "bg-indigo-200 dark:bg-indigo-900",
  "bg-indigo-400 dark:bg-indigo-700",
  "bg-indigo-500 dark:bg-indigo-500",
  "bg-indigo-700 dark:bg-indigo-300",
];

const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Monday = 0 ... Sunday = 6 */
function weekdayIndex(iso: string) {
  return (isoToLocalDate(iso).getDay() + 6) % 7;
}

function longDate(iso: string) {
  const d = isoToLocalDate(iso);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

interface Props {
  /** { "YYYY-MM-DD": focusSeconds } */
  days: Record<string, number>;
  streak: Streaks;
  today: string;
  totalFocusSec: number;
}

export default function StreakHeatmap({ days, streak, today, totalFocusSec }: Props) {
  const scroller = useRef<HTMLDivElement>(null);

  const weeks = useMemo(() => {
    const start = addDaysISO(PLAN_START, -weekdayIndex(PLAN_START)); // Monday on/before plan start
    const out: string[][] = [];
    let cursor = start;
    while (cursor <= PLAN_END) {
      const week: string[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(cursor);
        cursor = addDaysISO(cursor, 1);
      }
      out.push(week);
    }
    return out;
  }, []);

  const milestoneByDate = useMemo(() => new Map(MILESTONES.map((m) => [m.date, m.label])), []);

  // month label above the first week that starts in a new month
  const monthLabels = useMemo(() => {
    let lastMonth = -1;
    return weeks.map((w) => {
      const m = Number(w[0].slice(5, 7)) - 1;
      if (m === lastMonth) return "";
      lastMonth = m;
      return MONTHS[m];
    });
  }, [weeks]);

  // on small screens the grid scrolls sideways: bring the current week into view
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const idx = weeks.findIndex((w) => w.includes(today));
    if (idx > 0) el.scrollLeft = Math.max(0, (idx - 3) * 20);
  }, [weeks, today]);

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-semibold text-gray-800 dark:text-slate-100">Study Streak — Focus Heatmap</h3>
        <div className="flex gap-5 text-right">
          <Stat label="Current streak" value={`${streak.current} ${streak.current === 1 ? "day" : "days"}`} accent />
          <Stat label="Longest" value={`${streak.longest} ${streak.longest === 1 ? "day" : "days"}`} />
          <Stat label="Total focus" value={formatDuration(totalFocusSec)} />
        </div>
      </div>

      <div ref={scroller} className="mt-4 overflow-x-auto pb-2">
        <div className="inline-flex gap-2">
          {/* weekday labels */}
          <div className="flex flex-col gap-1 pt-5 text-[10px] leading-4 text-slate-400">
            {WEEKDAY_LABELS.map((l, i) => (
              <div key={i} className="h-4">
                {l}
              </div>
            ))}
          </div>

          <div className="flex gap-1">
            {weeks.map((week, wi) => (
              <div key={week[0]} className="flex flex-col gap-1">
                <div className="h-4 text-[10px] leading-4 text-slate-400">{monthLabels[wi]}</div>
                {week.map((date) => {
                  const outside = date < PLAN_START || date > PLAN_END;
                  if (outside) return <div key={date} className="h-4 w-4" aria-hidden />;

                  const sec = days[date] ?? 0;
                  const future = date > today;
                  const milestone = milestoneByDate.get(date);
                  const ring = milestone
                    ? "ring-2 ring-amber-400"
                    : date === today
                      ? "ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-900"
                      : "";
                  const title =
                    `${longDate(date)}: ${sec > 0 ? formatDuration(sec) + " focus" : future ? "upcoming" : "no focus"}` +
                    (milestone ? ` · ${milestone} (${formatMilestoneDate(date)})` : "");

                  return (
                    <div
                      key={date}
                      title={title}
                      className={`h-4 w-4 rounded-[4px] ${LEVEL_CLASS[heatLevel(sec)]} ${ring} ${future ? "opacity-40" : ""}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1">
          <span>Less</span>
          {LEVEL_CLASS.map((c, i) => (
            <span key={i} className={`h-3 w-3 rounded-[3px] ${c}`} />
          ))}
          <span>More</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-[3px] bg-slate-100 ring-2 ring-amber-400 dark:bg-slate-800" />
          <span>Milestone</span>
        </div>
      </div>

      <p className="mt-4 border-t pt-3 text-xs text-gray-400 dark:border-slate-800">
        Darker = more focus time in a day (from {HEAT_STEPS_MIN[0]} min, {HEAT_STEPS_MIN[1] / 60}h, {HEAT_STEPS_MIN[2] / 60}h to{" "}
        {HEAT_STEPS_MIN[3] / 60}h+). A day counts for the streak with at least 10 minutes of focus. Today is outlined in
        indigo.
      </p>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
      <div
        className={`text-base font-semibold ${
          accent ? "text-indigo-600 dark:text-indigo-400" : "text-slate-800 dark:text-slate-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
