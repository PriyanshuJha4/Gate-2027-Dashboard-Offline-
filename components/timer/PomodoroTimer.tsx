"use client";

import { useEffect, useMemo, useState } from "react";
import { useTimer, type TimerMode, type TimerSettings } from "@/lib/timerContext";
import { formatClock, KIND_LABEL } from "@/lib/studySessions";
import { topicsBySubject } from "@/lib/topics";
import { MODE_ICON } from "./MiniTimer";

const CARD = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
const FIELD =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

// literal class names on purpose (Tailwind only keeps classes it can see in the source)
const RING: Record<TimerMode, string> = {
  focus: "stroke-indigo-500",
  short_break: "stroke-emerald-500",
  long_break: "stroke-sky-500",
};
const TAB_ON: Record<TimerMode, string> = {
  focus: "bg-indigo-600 text-white",
  short_break: "bg-emerald-600 text-white",
  long_break: "bg-sky-600 text-white",
};

const R = 92;
const CIRC = 2 * Math.PI * R;

export default function PomodoroTimer() {
  const t = useTimer();
  const idle = t.status === "idle";
  const groups = useMemo(() => topicsBySubject(), []);

  const subjectName = t.topicId
    ? groups.find((g) => g.topics.some((x) => x.id === t.topicId))?.subject ?? t.subject
    : t.subject;
  const topics = groups.find((g) => g.subject === subjectName)?.topics ?? [];

  const confirmDiscard = () => {
    const elapsedSec = (t.totalMs - t.remainingMs) / 1000;
    if (elapsedSec < 60 || window.confirm("Discard this session without saving it?")) t.reset();
  };

  const primary = t.status === "running" ? "Pause" : t.status === "paused" ? "Resume" : "Start";
  const filledDots = t.cycle % t.settings.longEvery;

  return (
    <div className={CARD}>
      {/* mode tabs */}
      <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {(["focus", "short_break", "long_break"] as TimerMode[]).map((m) => (
          <button
            key={m}
            type="button"
            disabled={!idle}
            onClick={() => t.setMode(m)}
            className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition sm:text-sm ${
              t.mode === m
                ? TAB_ON[m]
                : "text-slate-600 hover:bg-white disabled:hover:bg-transparent dark:text-slate-300 dark:hover:bg-slate-700"
            } ${idle ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
          >
            {KIND_LABEL[m]}
          </button>
        ))}
      </div>

      {/* ring */}
      <div className="relative mx-auto h-64 w-64">
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
          <circle cx="100" cy="100" r={R} fill="none" strokeWidth="10" className="stroke-slate-100 dark:stroke-slate-800" />
          <circle
            cx="100"
            cy="100"
            r={R}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            className={RING[t.mode]}
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - t.progress)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {MODE_ICON[t.mode]} {KIND_LABEL[t.mode]}
          </div>
          <div className="font-mono text-5xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatClock(t.remainingMs)}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {t.status === "paused" ? "Paused" : t.status === "running" ? "Running" : "Ready"}
          </div>
        </div>
      </div>

      {/* pomodoro dots */}
      <div className="mt-3 flex items-center justify-center gap-1.5" aria-label="Focus sessions until long break">
        {Array.from({ length: t.settings.longEvery }).map((_, i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 rounded-full ${
              i < filledDots ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700"
            }`}
          />
        ))}
      </div>

      {/* controls */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={t.status === "running" ? t.pause : t.start}
          className="min-w-[7rem] cursor-pointer rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          {primary}
        </button>
        {!idle && (
          <>
            <button
              type="button"
              onClick={t.finishEarly}
              className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t.mode === "focus" ? "Finish & log" : "Skip break"}
            </button>
            <button
              type="button"
              onClick={confirmDiscard}
              className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/30"
            >
              Reset
            </button>
          </>
        )}
      </div>

      {/* what are you studying */}
      <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
          Subject
          <select
            className={`${FIELD} mt-1`}
            disabled={!idle}
            value={subjectName}
            onChange={(e) => t.setTarget(e.target.value, null)}
          >
            <option value="">No subject</option>
            {groups.map((g) => (
              <option key={g.subject} value={g.subject}>
                {g.subject}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
          Topic
          <select
            className={`${FIELD} mt-1`}
            disabled={!idle || !subjectName}
            value={t.topicId ?? ""}
            onChange={(e) => t.setTarget(subjectName, e.target.value || null)}
          >
            <option value="">Whole subject</option>
            {topics.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {tp.name}
              </option>
            ))}
          </select>
        </label>
        {!idle && (
          <p className="text-xs text-slate-400 sm:col-span-2">Subject and topic are locked while a session is running.</p>
        )}
      </div>

      <Settings settings={t.settings} onChange={t.updateSettings} disabled={!idle} />
    </div>
  );
}

/* -------------------------------- settings -------------------------------- */

function Settings({
  settings,
  onChange,
  disabled,
}: {
  settings: TimerSettings;
  onChange: (s: Partial<TimerSettings>) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
      >
        {open ? "▾" : "▸"} Durations
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField label="Focus (min)" value={settings.focusMin} min={1} max={180} disabled={disabled} onCommit={(n) => onChange({ focusMin: n })} />
          <NumberField label="Short break" value={settings.shortMin} min={1} max={60} disabled={disabled} onCommit={(n) => onChange({ shortMin: n })} />
          <NumberField label="Long break" value={settings.longMin} min={1} max={90} disabled={disabled} onCommit={(n) => onChange({ longMin: n })} />
          <NumberField label="Long break every" value={settings.longEvery} min={2} max={10} disabled={disabled} onCommit={(n) => onChange({ longEvery: n })} />
          {disabled && <p className="col-span-full text-xs text-slate-400">Change durations when the timer is idle.</p>}
        </div>
      )}
    </div>
  );
}

/** Lets you clear the box and type freely; the value is validated when you leave the field. */
function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const n = Math.round(Number(draft));
    if (!Number.isFinite(n) || draft.trim() === "") {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        disabled={disabled}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className={`${FIELD} mt-1`}
      />
    </label>
  );
}
