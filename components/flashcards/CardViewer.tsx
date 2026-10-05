"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Card } from "@/lib/notesDb";
import { formatInterval, todayStr } from "@/lib/srs";

type Props = {
  /** The list the user is browsing (the viewer moves through this list) */
  cards: Card[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onEdit: (card: Card) => void;
  onDelete: (card: Card) => void;
};

const AUTO_KEY = "flashcard-viewer-autoreveal";

/**
 * Big "open card" view for revision. It only LOOKS at cards:
 * it never changes the spaced-repetition schedule.
 */
export default function CardViewer({
  cards,
  index,
  onIndexChange,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  const [autoReveal, setAutoReveal] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const safeIndex = Math.max(0, Math.min(index, cards.length - 1));
  const card: Card | undefined = cards[safeIndex];
  const cardId = card?.id;

  // Remember the "show answer automatically" choice
  useEffect(() => {
    try {
      setAutoReveal(localStorage.getItem(AUTO_KEY) === "1");
    } catch {
      /* storage not available - ignore */
    }
  }, []);

  // New card (or changed setting) -> hide / show the answer again
  useEffect(() => {
    setRevealed(autoReveal);
    setZoomed(false);
  }, [cardId, autoReveal]);

  // Nothing left (for example the last card was deleted)
  useEffect(() => {
    if (cards.length === 0) onClose();
  }, [cards.length, onClose]);

  // Keyboard: ← → move, Space/Enter flip, Esc close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) {
        return;
      }
      if (cards.length === 0) return;

      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight") {
        onIndexChange((safeIndex + 1) % cards.length);
      } else if (e.key === "ArrowLeft") {
        onIndexChange((safeIndex - 1 + cards.length) % cards.length);
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setRevealed((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards.length, safeIndex, onClose, onIndexChange]);

  if (!card) return null;

  const today = todayStr();
  const isNew = card.reps === 0 && !card.lastReviewed;
  const dueLabel = card.due <= today ? "Due today" : `Due ${card.due}`;

  function toggleAuto(value: boolean) {
    setAutoReveal(value);
    try {
      localStorage.setItem(AUTO_KEY, value ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-3"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              {[card.subject, card.topic].filter(Boolean).join(" › ") || "Flashcard"}
            </p>
            <p className="text-[11px] text-slate-400">
              {isNew ? "New card" : dueLabel}
              {card.interval > 0 ? ` · gap ${formatInterval(card.interval)}` : ""}
              {card.reps > 0 ? ` · ${card.reps} reps` : ""}
              {card.lapses > 0 ? ` · ${card.lapses} lapses` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {safeIndex + 1} / {cards.length}
            </span>
            <button
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {card.frontImage && (
            <div
              className={`rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-950 ${
                zoomed ? "overflow-auto" : ""
              }`}
              style={zoomed ? { maxHeight: "70vh" } : undefined}
            >
              <img
                src={card.frontImage}
                alt="Question"
                onClick={() => setZoomed((z) => !z)}
                title={zoomed ? "Click to fit" : "Click for full size"}
                className={
                  zoomed
                    ? "max-w-none cursor-zoom-out"
                    : "mx-auto max-h-[52vh] max-w-full cursor-zoom-in object-contain"
                }
              />
            </div>
          )}

          {card.front && (
            <p className="whitespace-pre-wrap break-words text-base font-medium text-slate-800 dark:text-slate-100">
              {card.front}
            </p>
          )}

          {revealed ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Answer
              </p>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-100">
                {card.back}
              </p>
            </div>
          ) : (
            <button
              onClick={() => setRevealed(true)}
              className="w-full rounded-xl border border-dashed border-indigo-300 py-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
            >
              Show answer <span className="text-xs text-slate-400">(Space)</span>
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onIndexChange((safeIndex - 1 + cards.length) % cards.length)}
              disabled={cards.length < 2}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              ← Previous
            </button>
            <button
              onClick={() => onIndexChange((safeIndex + 1) % cards.length)}
              disabled={cards.length < 2}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              Next →
            </button>
          </div>

          <label className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-slate-500">
            <input
              type="checkbox"
              checked={autoReveal}
              onChange={(e) => toggleAuto(e.target.checked)}
              className="cursor-pointer rounded border-slate-300"
            />
            Show answer automatically
          </label>

          <div className="flex items-center gap-3 text-xs">
            {card.source && (
              <Link
                href={`/notes?pdf=${card.source.pdfId}&page=${card.source.page}`}
                className="text-indigo-600 hover:underline dark:text-indigo-400"
                title={card.source.pdfName}
              >
                📄 Source p.{card.source.page}
              </Link>
            )}
            <button
              onClick={() => onEdit(card)}
              className="text-slate-500 hover:text-indigo-600"
            >
              Edit
            </button>
            <button onClick={() => onDelete(card)} className="text-slate-400 hover:text-red-600">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
