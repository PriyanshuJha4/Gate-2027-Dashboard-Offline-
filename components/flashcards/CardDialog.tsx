"use client";

import { useEffect, useRef, useState } from "react";
import { GATE_SYLLABUS } from "@/lib/syllabus";
import { putCard, uid, type Card, type CardSource } from "@/lib/notesDb";
import { todayStr } from "@/lib/srs";

type Props = {
  /** Cropped region from the PDF (data URL) for a new card */
  image?: string | null;
  /** Where the card came from (PDF + page) for a new card */
  source?: CardSource | null;
  /** Pre-filled subject from PDF metadata */
  subject?: string;
  /** Pre-filled topic/chapter from PDF metadata */
  topic?: string;
  /** Pass an existing card to edit it (its schedule is kept) */
  initial?: Card;
  onClose: () => void;
  onSaved: (card: Card) => void;
};

/* ------------------------ voice typing (browser Web Speech API) ------------------------ */
// No library: the browser's own SpeechRecognition. Works in Chrome / Edge / Safari (Chrome and Edge send the
// audio to their speech service, so it needs internet), and only on https:// or localhost / 127.0.0.1.

type VoiceField = "front" | "back";

/** The few parts of the (still non-standard) SpeechRecognition object that are used here. */
type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

const VOICE_LANGS = [
  { code: "en-IN", label: "English (India)" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "en-US", label: "English (US)" },
];
const VOICE_LANG_KEY = "gate-voice-lang";

function getRecognitionCtor(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Add spoken text after what is already typed. A sentence start gets a capital letter. */
function appendSpoken(base: string, spoken: string): string {
  const said = spoken.replace(/\s+/g, " ").trim();
  if (!said) return base;
  const head = base.replace(/\s+$/, "");
  const text = !head || /[.!?]$/.test(head) ? said.charAt(0).toUpperCase() + said.slice(1) : said;
  return head ? `${head} ${text}` : text;
}

function voiceErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone is blocked. Allow it for this site (lock icon next to the address bar), then try again.";
    case "no-speech":
      return "Did not hear anything. Tap the mic and speak again.";
    case "audio-capture":
      return "No microphone found.";
    case "network":
      return "Voice typing needs internet (the browser sends the audio to its speech service).";
    case "language-not-supported":
      return "Your browser does not support this voice language.";
    case "aborted":
      return "";
    default:
      return `Voice typing stopped (${code}).`;
  }
}

const FIELD_CLS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white";

export default function CardDialog({ image, source, subject: initSubject, topic: initTopic, initial, onClose, onSaved }: Props) {
  const [front, setFront] = useState(initial?.front || "");
  const [back, setBack] = useState(initial?.back || "");
  const [frontImage, setFrontImage] = useState(initial?.frontImage || image || "");
  const [subject, setSubject] = useState(initial?.subject || initSubject || "");
  const [topic, setTopic] = useState(initial?.topic || initTopic || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // voice typing
  const [voiceOk, setVoiceOk] = useState(false); // decided after mount (the server cannot know the browser)
  const [listening, setListening] = useState<VoiceField | null>(null);
  const [voiceMsg, setVoiceMsg] = useState("");
  const [voiceLang, setVoiceLang] = useState("en-IN");
  const recRef = useRef<SpeechRec | null>(null);

  const topics = GATE_SYLLABUS.find((s) => s.subject === subject)?.topics || [];
  const canSave = (front.trim() !== "" || frontImage !== "") && back.trim() !== "";

  useEffect(() => {
    setVoiceOk(getRecognitionCtor() !== null);
    try {
      const saved = localStorage.getItem(VOICE_LANG_KEY);
      if (saved && VOICE_LANGS.some((l) => l.code === saved)) setVoiceLang(saved);
    } catch {
      /* storage blocked: keep the default */
    }
    return () => stopVoice(); // dialog closed: release the microphone
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Drop the current recognition session right away (used when switching field, typing, saving, closing). */
  function stopVoice() {
    const rec = recRef.current;
    recRef.current = null;
    setListening(null);
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    }
  }

  /** Mic button of a field: tap to start speaking into it, tap again to stop. */
  function startVoiceInput(field: VoiceField) {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setVoiceMsg("Voice typing is not supported in this browser. Use Chrome or Edge.");
      return;
    }
    // same field is already listening -> finish gracefully (the last words still arrive, then onend)
    if (listening === field && recRef.current) {
      recRef.current.stop();
      return;
    }
    stopVoice(); // another field was listening
    setVoiceMsg("");

    const base = field === "front" ? front : back;
    const setText = field === "front" ? setFront : setBack;

    const rec = new Ctor();
    rec.lang = voiceLang;
    rec.interimResults = true; // show words while you are still speaking
    rec.maxAlternatives = 1;
    // Chrome on Android repeats earlier sentences in continuous mode, so there it listens one phrase per tap.
    rec.continuous = !/Android/i.test(navigator.userAgent);

    rec.onresult = (e) => {
      // every result so far (final + the one still being heard), always rebuilt from the text that was there at the start
      const spoken = Array.from(e.results as ArrayLike<any>)
        .map((r) => r?.[0]?.transcript ?? "")
        .join(" ");
      setText(appendSpoken(base, spoken));
    };
    rec.onerror = (e) => {
      const msg = voiceErrorMessage(String(e?.error ?? ""));
      if (msg) setVoiceMsg(msg);
    };
    rec.onend = () => {
      if (recRef.current === rec) {
        recRef.current = null;
        setListening(null);
      }
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(field);
    } catch (err) {
      console.error("voice start failed", err);
      recRef.current = null;
      setVoiceMsg("Could not start the microphone. Try again.");
    }
  }

  function changeVoiceLang(code: string) {
    stopVoice(); // the new language applies from the next tap
    setVoiceLang(code);
    try {
      localStorage.setItem(VOICE_LANG_KEY, code);
    } catch {
      /* ignore */
    }
  }

  /** Small mic button shown next to a field label (hidden when the browser has no speech recognition). */
  function micButton(field: VoiceField) {
    if (!voiceOk) return null;
    const on = listening === field;
    return (
      <button
        type="button"
        onClick={() => startVoiceInput(field)}
        aria-pressed={on}
        aria-label={on ? `Stop voice typing for ${field}` : `Voice typing for ${field}`}
        title={on ? "Tap to stop" : "Speak instead of typing"}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
          on
            ? "animate-pulse bg-red-600 text-white"
            : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        }`}
      >
        <span aria-hidden="true">{on ? "⏹" : "🎤"}</span>
        {on ? "Listening… tap to stop" : "Speak"}
      </button>
    );
  }

  async function save() {
    if (!canSave || saving) return;
    stopVoice(); // no late words may change the card after Save
    setSaving(true);
    setError("");

    const card: Card = initial
      ? { ...initial, front: front.trim(), back: back.trim(), frontImage, subject, topic }
      : {
          id: uid(),
          front: front.trim(),
          back: back.trim(),
          frontImage,
          subject,
          topic,
          source: source || null,
          ease: 2.5,
          interval: 0,
          reps: 0,
          lapses: 0,
          due: todayStr(),
          createdAt: new Date().toISOString(),
          lastReviewed: "",
        };

    try {
      await putCard(card);
      onSaved(card);
    } catch (e) {
      console.error(e);
      setError(`Could not save the card: ${e instanceof Error ? e.message : "server error"}`);
      setSaving(false);
    }
  }

  const src = initial?.source || source || null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
            {initial ? "Edit flashcard" : "🃏 New flashcard"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>

        {src && (
          <p className="text-[11px] text-slate-400">
            Source: {src.pdfName} · page {src.page}
          </p>
        )}

        {frontImage && (
          <div className="relative rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-950">
            <img
              src={frontImage}
              alt="Cropped from notes"
              className="mx-auto max-h-56 max-w-full object-contain"
            />
            <button
              onClick={() => setFrontImage("")}
              className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white hover:bg-black/80"
            >
              Remove image
            </button>
          </div>
        )}

        {voiceOk && (
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>🎤 Voice typing language</span>
            <select
              value={voiceLang}
              onChange={(e) => changeVoiceLang(e.target.value)}
              aria-label="Voice typing language"
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              {VOICE_LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Front (question) {frontImage ? "– optional, image is the question" : ""}
            </label>
            {micButton("front")}
          </div>
          <textarea
            rows={2}
            className={FIELD_CLS}
            value={front}
            onChange={(e) => {
              if (listening === "front") stopVoice(); // typing while listening would be overwritten by the next words
              setFront(e.target.value);
            }}
            placeholder="Type the question..."
            autoFocus={!frontImage}
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Back (answer) *
            </label>
            {micButton("back")}
          </div>
          <textarea
            rows={3}
            className={FIELD_CLS}
            value={back}
            onChange={(e) => {
              if (listening === "back") stopVoice();
              setBack(e.target.value);
            }}
            placeholder="Type the answer..."
            autoFocus={!!frontImage}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select
            className={FIELD_CLS}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setTopic("");
            }}
          >
            <option value="">Subject (optional)</option>
            {GATE_SYLLABUS.map((s) => (
              <option key={s.subject} value={s.subject}>
                {s.subject}
              </option>
            ))}
          </select>
          <select
            className={FIELD_CLS}
            value={topic}
            disabled={!subject}
            onChange={(e) => setTopic(e.target.value)}
          >
            <option value="">{subject ? "Topic (optional)" : "Select subject first"}</option>
            {topics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {voiceMsg && <p className="text-xs text-amber-700 dark:text-amber-400">{voiceMsg}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave || saving}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save card"}
          </button>
        </div>
      </div>
    </div>
  );
}