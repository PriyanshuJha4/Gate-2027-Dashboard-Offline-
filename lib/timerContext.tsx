"use client";

// Pomodoro timer state. The provider is mounted in components/ClientLayout.tsx (which lives in the
// root layout), so it is NOT unmounted when you change pages: the countdown keeps running.
//
// Design notes
//  - The clock is `endAt` (a wall-clock timestamp), not a counter, so background-tab throttling
//    never makes it drift.
//  - State is mirrored to localStorage: a page reload (or a second tab) picks the timer up again.
//  - Every finished segment is POSTed to /api/study-sessions with a client-made id. The server
//    ignores duplicates, so two open tabs can never double-count a session.

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { todayStr } from "@/lib/countdown";
import { topicById } from "@/lib/topics";
import { MIN_LOG_SEC, formatDuration, type SessionKind } from "@/lib/studySessions";

export type TimerMode = SessionKind;
export type TimerStatus = "idle" | "running" | "paused";

export interface TimerSettings {
  focusMin: number;
  shortMin: number;
  longMin: number;
  /** a long break after this many focus sessions */
  longEvery: number;
}

export const DEFAULT_SETTINGS: TimerSettings = { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4 };

interface TimerState {
  mode: TimerMode;
  status: TimerStatus;
  endAt: number | null; // epoch ms, only while running
  remainingMs: number; // only meaningful while idle / paused
  totalMs: number; // planned length of the current segment
  sessionId: string | null;
  subject: string;
  topicId: string | null;
  settings: TimerSettings;
  cycle: number; // completed focus sessions (drives the long-break rhythm)
}

interface SessionPayload {
  id: string;
  date: string;
  subject: string;
  topic_id: string | null;
  duration_sec: number;
  kind: TimerMode;
}

const STORAGE_KEY = "gate-timer-v1";
const PENDING_KEY = "gate-timer-pending-v1";
const MODES: TimerMode[] = ["focus", "short_break", "long_break"];

/* --------------------------------- helpers -------------------------------- */

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function clampSettings(s: Partial<TimerSettings> | null | undefined): TimerSettings {
  return {
    focusMin: clampInt(s?.focusMin, 1, 180, DEFAULT_SETTINGS.focusMin),
    shortMin: clampInt(s?.shortMin, 1, 60, DEFAULT_SETTINGS.shortMin),
    longMin: clampInt(s?.longMin, 1, 90, DEFAULT_SETTINGS.longMin),
    longEvery: clampInt(s?.longEvery, 2, 10, DEFAULT_SETTINGS.longEvery),
  };
}

export function modeMs(mode: TimerMode, s: TimerSettings): number {
  const min = mode === "focus" ? s.focusMin : mode === "short_break" ? s.shortMin : s.longMin;
  return min * 60 * 1000;
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function idleState(base: TimerState, mode: TimerMode): TimerState {
  const ms = modeMs(mode, base.settings);
  return { ...base, mode, status: "idle", endAt: null, remainingMs: ms, totalMs: ms, sessionId: null };
}

const INITIAL: TimerState = idleState(
  {
    mode: "focus",
    status: "idle",
    endAt: null,
    remainingMs: 0,
    totalMs: 0,
    sessionId: null,
    subject: "",
    topicId: null,
    settings: DEFAULT_SETTINGS,
    cycle: 0,
  },
  "focus",
);

function readState(): TimerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return null;
    const settings = clampSettings(j.settings);
    const mode: TimerMode = MODES.includes(j.mode) ? j.mode : "focus";
    const status: TimerStatus = j.status === "running" || j.status === "paused" ? j.status : "idle";
    const total = Number(j.totalMs) > 0 ? Number(j.totalMs) : modeMs(mode, settings);
    const base: TimerState = {
      mode,
      status,
      endAt: Number.isFinite(Number(j.endAt)) && j.endAt ? Number(j.endAt) : null,
      remainingMs: Number.isFinite(Number(j.remainingMs)) ? Math.max(0, Number(j.remainingMs)) : total,
      totalMs: total,
      sessionId: typeof j.sessionId === "string" ? j.sessionId : null,
      subject: typeof j.subject === "string" ? j.subject : "",
      topicId: typeof j.topicId === "string" && topicById(j.topicId) ? j.topicId : null,
      settings,
      cycle: clampInt(j.cycle, 0, 100000, 0),
    };
    // a "running" timer without an end time (or any non-idle one without an id) is corrupt -> reset it
    if ((base.status === "running" && !base.endAt) || (base.status !== "idle" && !base.sessionId)) {
      return idleState(base, base.mode);
    }
    return base;
  } catch {
    return null;
  }
}

function writeState(s: TimerState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota: the timer still works, it just won't survive a reload */
  }
}

function readPending(): SessionPayload[] {
  try {
    const j = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}
function writePending(list: SessionPayload[]) {
  try {
    if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

async function postSession(p: SessionPayload) {
  const res = await fetch("/api/study-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/** Three short beeps. Browsers may block audio without a prior click; that is fine. */
function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.3);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {
    /* ignore */
  }
}

function systemNotify(title: string, body: string) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch {
    /* ignore */
  }
}

/* --------------------------------- context -------------------------------- */

export interface TimerContextValue {
  ready: boolean;
  mode: TimerMode;
  status: TimerStatus;
  /** live value, ticks while running */
  remainingMs: number;
  totalMs: number;
  /** 0..1 of the current segment that has elapsed */
  progress: number;
  subject: string;
  topicId: string | null;
  settings: TimerSettings;
  cycle: number;
  /** bumps after every successfully saved session: pages refetch their stats when it changes */
  sessionsVersion: number;
  notice: { id: number; text: string } | null;

  start: () => void;
  pause: () => void;
  /** discard the current segment without logging anything */
  reset: () => void;
  /** focus: stop now and log the time so far (>= 1 min). break: skip it. */
  finishEarly: () => void;
  setMode: (mode: TimerMode) => void;
  setTarget: (subject: string, topicId: string | null) => void;
  updateSettings: (s: Partial<TimerSettings>) => void;
  dismissNotice: () => void;
}

const TimerContext = createContext<TimerContextValue | null>(null);

export function useTimer(): TimerContextValue {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer must be used inside <TimerProvider> (see components/ClientLayout.tsx)");
  return ctx;
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<TimerState>(INITIAL);
  const stRef = useRef<TimerState>(INITIAL);
  const [now, setNow] = useState(0);
  const [ready, setReady] = useState(false);
  const [sessionsVersion, setSessionsVersion] = useState(0);
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);

  const say = useCallback((text: string) => setNotice({ id: Date.now(), text }), []);

  /** single place that changes state: ref (for callbacks) + React state + localStorage */
  const commit = useCallback((next: TimerState, fromStorage = false) => {
    stRef.current = next;
    setSt(next);
    setNow(Date.now());
    if (!fromStorage) writeState(next);
  }, []);

  /* ------------------------------ saving sessions ------------------------------ */

  const flushPending = useCallback(async () => {
    const list = readPending();
    if (!list.length) return;
    const left: SessionPayload[] = [];
    let saved = 0;
    for (const p of list) {
      try {
        await postSession(p);
        saved++;
      } catch {
        left.push(p);
      }
    }
    writePending(left);
    if (saved) setSessionsVersion((v) => v + 1);
  }, []);

  const logSession = useCallback(async (p: SessionPayload) => {
    try {
      await postSession(p);
      setSessionsVersion((v) => v + 1);
    } catch {
      // server unreachable: keep it and retry on the next page load
      writePending([...readPending().filter((x) => x.id !== p.id), p]);
      setNotice({ id: Date.now(), text: "Could not save the session right now. It will be retried automatically." });
    }
  }, []);

  /* -------------------------------- finishing -------------------------------- */

  /**
   * auto    : countdown reached zero            -> log the full planned length
   * restore : it ended while the app was closed -> log the full planned length
   * early   : user pressed "Finish & log"       -> log the elapsed time only
   */
  const complete = useCallback(
    (reason: "auto" | "restore" | "early") => {
      const s = stRef.current;
      if (s.status === "idle" || !s.sessionId) return;

      const liveRemaining = s.status === "running" && s.endAt ? Math.max(0, s.endAt - Date.now()) : s.remainingMs;
      const elapsedSec = reason === "early" ? Math.round((s.totalMs - liveRemaining) / 1000) : Math.round(s.totalMs / 1000);
      const wasFocus = s.mode === "focus";
      const natural = reason !== "early";

      // breaks are logged only when they ran to the end; focus time counts from 1 minute up
      const shouldLog = wasFocus ? elapsedSec >= MIN_LOG_SEC : natural && elapsedSec >= MIN_LOG_SEC;
      if (shouldLog) {
        void logSession({
          id: s.sessionId,
          date: todayStr(),
          subject: s.subject,
          topic_id: s.topicId,
          duration_sec: elapsedSec,
          kind: s.mode,
        });
      }

      // what comes next
      let next: TimerMode = "focus";
      let cycle = s.cycle;
      if (wasFocus && natural) {
        cycle = s.cycle + 1;
        next = cycle % s.settings.longEvery === 0 ? "long_break" : "short_break";
      }
      commit(idleState({ ...s, cycle }, next));

      // feedback
      if (natural) {
        beep();
        const text = wasFocus
          ? `Focus session done: ${formatDuration(elapsedSec)} logged. ${next === "long_break" ? "Time for a long break." : "Take a short break."}`
          : "Break is over. Ready for the next focus session?";
        const prefix = reason === "restore" ? "While the app was closed: " : "";
        say(prefix + text);
        systemNotify(wasFocus ? "Focus session done" : "Break is over", text);
      } else if (wasFocus) {
        say(shouldLog ? `Logged ${formatDuration(elapsedSec)} of focus.` : "Under 1 minute, so it was not logged.");
      }
    },
    [commit, logSession, say],
  );

  /* ---------------------------------- actions --------------------------------- */

  const start = useCallback(() => {
    const s = stRef.current;
    if (s.status === "running") return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        void Notification.requestPermission();
      } catch {
        /* ignore */
      }
    }
    if (s.status === "paused") {
      commit({ ...s, status: "running", endAt: Date.now() + s.remainingMs });
    } else {
      const total = modeMs(s.mode, s.settings);
      commit({
        ...s,
        status: "running",
        totalMs: total,
        remainingMs: total,
        endAt: Date.now() + total,
        sessionId: newId(),
      });
    }
  }, [commit]);

  const pause = useCallback(() => {
    const s = stRef.current;
    if (s.status !== "running" || !s.endAt) return;
    commit({ ...s, status: "paused", remainingMs: Math.max(0, s.endAt - Date.now()), endAt: null });
  }, [commit]);

  const reset = useCallback(() => {
    const s = stRef.current;
    commit(idleState(s, s.mode));
  }, [commit]);

  const finishEarly = useCallback(() => {
    const s = stRef.current;
    if (s.status === "idle") return;
    if (s.mode === "focus") complete("early");
    else commit(idleState(s, "focus")); // skipping a break
  }, [commit, complete]);

  const setMode = useCallback(
    (mode: TimerMode) => {
      const s = stRef.current;
      if (s.status !== "idle") return;
      commit(idleState(s, mode));
    },
    [commit],
  );

  const setTarget = useCallback(
    (subject: string, topicId: string | null) => {
      commit({ ...stRef.current, subject, topicId });
    },
    [commit],
  );

  const updateSettings = useCallback(
    (patch: Partial<TimerSettings>) => {
      const s = stRef.current;
      const settings = clampSettings({ ...s.settings, ...patch });
      if (s.status === "idle") commit(idleState({ ...s, settings }, s.mode));
      else commit({ ...s, settings }); // a running segment keeps its planned length
    },
    [commit],
  );

  /* ---------------------------------- effects --------------------------------- */

  // 1) first load: restore from localStorage
  useEffect(() => {
    const loaded = readState();
    if (loaded) commit(loaded, true);
    setNow(Date.now());
    setReady(true);
    if (loaded && loaded.status === "running" && loaded.endAt && loaded.endAt <= Date.now()) complete("restore");
    void flushPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) tick while running
  useEffect(() => {
    if (st.status !== "running") return;
    const tick = () => {
      const n = Date.now();
      setNow(n);
      const end = stRef.current.endAt;
      if (stRef.current.status === "running" && end && n >= end) complete("auto");
    };
    const id = setInterval(tick, 250);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [st.status, complete]);

  // 3) another tab changed the timer: follow it
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      const loaded = readState();
      if (loaded) commit(loaded, true);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [commit]);

  /* ----------------------------------- value ---------------------------------- */

  const remainingMs = st.status === "running" && st.endAt ? Math.max(0, st.endAt - now) : st.remainingMs;
  const progress = st.totalMs > 0 ? Math.min(1, Math.max(0, 1 - remainingMs / st.totalMs)) : 0;
  const dismissNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<TimerContextValue>(
    () => ({
      ready,
      mode: st.mode,
      status: st.status,
      remainingMs,
      totalMs: st.totalMs,
      progress,
      subject: st.subject,
      topicId: st.topicId,
      settings: st.settings,
      cycle: st.cycle,
      sessionsVersion,
      notice,
      start,
      pause,
      reset,
      finishEarly,
      setMode,
      setTarget,
      updateSettings,
      dismissNotice,
    }),
    [
      ready, st, remainingMs, progress, sessionsVersion, notice,
      start, pause, reset, finishEarly, setMode, setTarget, updateSettings, dismissNotice,
    ],
  );

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}
