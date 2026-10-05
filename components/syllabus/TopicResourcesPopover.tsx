"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/** Where the clicked checkbox is on screen (viewport coordinates from getBoundingClientRect). */
export type PopoverAnchor = { top: number; bottom: number; left: number; width: number };

interface Resources {
  topicId: string;
  name: string;
  subject: string;
  pdfs: { id: string; title: string; subject: string; chapter: string; lastPage: number }[];
  cards: { total: number; due: number; new: number };
}

const WIDTH = 304;
const EST_HEIGHT = 280; // only used to decide "open below" or "open above"

export default function TopicResourcesPopover({
  topicId,
  anchor,
  onClose,
}: {
  topicId: string;
  anchor: PopoverAnchor;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Resources | null>(null);
  const [error, setError] = useState("");

  // load PDFs + card counts of this topic
  useEffect(() => {
    const ctrl = new AbortController();
    setData(null);
    setError("");
    (async () => {
      try {
        const res = await fetch(`/api/topics/${encodeURIComponent(topicId)}/resources`, { signal: ctrl.signal });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || `Request failed (${res.status})`);
        setData(json);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(e instanceof Error ? e.message : "Could not load resources.");
      }
    })();
    return () => ctrl.abort();
  }, [topicId]);

  // close: Esc, click outside, scroll/resize (a fixed popover would float away from its checkbox)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  // position: centred under the checkbox, kept inside the screen; flips above when there is no room below
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - WIDTH / 2), Math.max(8, vw - WIDTH - 8));
  const below = anchor.bottom + 8 + EST_HEIGHT <= vh || anchor.top < EST_HEIGHT;
  const style: React.CSSProperties = below
    ? { top: anchor.bottom + 8, left, width: WIDTH }
    : { bottom: vh - anchor.top + 8, left, width: WIDTH };

  const cardsBrowse = `/flashcards?tab=browser&topic=${encodeURIComponent(topicId)}`;
  const cardsReview = `/flashcards?topic=${encodeURIComponent(topicId)}`;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="PDFs and flashcards for this topic"
      style={style}
      className="fixed z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-2xl dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{data?.name ?? "Short notes"}</p>
          {data && <p className="text-[11px] text-slate-400">{data.subject}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
          ✕
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      {!data && !error && <p className="py-4 text-center text-slate-400">Loading…</p>}

      {data && (
        <div className="space-y-4">
          <section>
            <h3 className="mb-1.5 font-semibold uppercase tracking-wide text-slate-400">📄 PDFs ({data.pdfs.length})</h3>
            {data.pdfs.length === 0 ? (
              <p className="text-slate-500">
                No PDF yet. Upload one in the Notes Viewer with the chapter set to “{data.name}”.
              </p>
            ) : (
              <ul className="space-y-1">
                {data.pdfs.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/notes?pdf=${encodeURIComponent(p.id)}`}
                      className="block truncate rounded-lg px-2 py-1.5 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                      title={p.title}
                    >
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-1.5 font-semibold uppercase tracking-wide text-slate-400">🃏 Flashcards</h3>
            {data.cards.total === 0 ? (
              <p className="text-slate-500">No flashcards for this topic yet.</p>
            ) : (
              <>
                <p className="mb-2 text-slate-600 dark:text-slate-300">
                  <b>{data.cards.total}</b> total · <b className={data.cards.due > 0 ? "text-amber-600" : ""}>{data.cards.due}</b> due ·{" "}
                  <b>{data.cards.new}</b> new
                </p>
                <div className="flex gap-2">
                  <Link href={cardsBrowse} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-center font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    View cards
                  </Link>
                  <Link
                    href={cardsReview}
                    aria-disabled={data.cards.due === 0}
                    className={`flex-1 rounded-lg px-3 py-2 text-center font-medium text-white ${
                      data.cards.due === 0 ? "pointer-events-none bg-slate-300 dark:bg-slate-700" : "bg-indigo-600 hover:bg-indigo-500"
                    }`}
                  >
                    Review due
                  </Link>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
