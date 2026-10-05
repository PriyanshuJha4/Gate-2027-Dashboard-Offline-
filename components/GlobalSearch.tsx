"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

type Item = { id: string; title: string; subtitle: string; href: string };
type Group = { key: string; label: string; more: boolean; items: Item[] };
type Payload = { q: string; tooShort: boolean; min: number; failed: string[]; groups: Group[] };

const MIN_CHARS = 2; // same as the API
const DEBOUNCE_MS = 200;

const GROUP_ICON: Record<string, string> = {
  errors: "❌",
  cards: "🃏",
  links: "🔗",
  pdfs: "📝",
  library: "📚",
  subject: "📘",
  chapter: "📑",
};

/**
 * Header search box + search modal.
 *  - Ctrl+K (Cmd+K on Mac) opens it. preventDefault() stops the browser from using the shortcut itself
 *    (Chrome/Firefox would jump to their address/search bar).
 *  - Esc closes. Up/Down move, Enter opens the highlighted result.
 *  - Typing waits 200 ms after the last key before asking the server; older answers are dropped.
 * Mounted once, inside the header (components/Sidebar.tsx), so it exists on every page.
 */
export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false); // portal needs document.body, so wait for the browser
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  useEffect(() => setMounted(true), []);

  /* ------------------------- keyboard shortcut ------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault(); // keep the browser's own Ctrl+K (address/search bar) from running
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // Esc closes (only while open)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // focus the box on open, reset on close, keep the page behind from scrolling
  useEffect(() => {
    if (!open) {
      reqId.current++; // ignore any answer still on its way
      setQuery("");
      setData(null);
      setError("");
      setLoading(false);
      setActive(0);
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* ----------------------- debounced search ----------------------- */
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if ([...q].length < MIN_CHARS) {
      reqId.current++;
      setData(null);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    const my = ++reqId.current;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal, cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (my !== reqId.current) return; // a newer search started: drop this answer
        if (!res.ok || !json || json.error) throw new Error(json?.error || `Search failed (${res.status})`);
        setData(json as Payload);
        setError("");
        setActive(0);
      } catch (e: any) {
        if (e?.name === "AbortError" || my !== reqId.current) return;
        console.error("search failed", e);
        setData(null);
        setError(e?.message || "Search failed.");
      } finally {
        if (my === reqId.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, open]);

  /* ----------------------- results as one flat list ----------------------- */
  const flat = useMemo(() => (data ? data.groups.flatMap((g) => g.items) : []), [data]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(item: Item) {
    close();
    // NotesViewer reads ?pdf= only when the page loads. Already on /notes, a soft navigation would change
    // the URL but not open the PDF, so reload the page in that one case.
    if (window.location.pathname.startsWith("/notes") && item.href.startsWith("/notes")) {
      window.location.assign(item.href);
    } else {
      router.push(item.href);
    }
  }

  function onInputKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flat.length) setActive((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length) setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flat[active]) go(flat[active]);
    }
  }

  const trimmed = query.trim();
  const short = [...trimmed].length < MIN_CHARS;
  let idx = -1;

  /* ------------------------------- UI ------------------------------- */
  return (
    <>
      {/* The search box in the header (a button that looks like an input) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search everything (Ctrl+K)"
        className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 hover:border-indigo-300 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:border-indigo-700 sm:w-56 md:w-72 cursor-pointer"
      >
        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
        </svg>
        <span className="hidden flex-1 truncate text-left sm:inline">Search…</span>
        <kbd className="hidden shrink-0 rounded border border-slate-300 px-1.5 text-[10px] font-medium text-slate-400 dark:border-slate-600 md:inline">
          Ctrl K
        </kbd>
      </button>

      {/* Modal. Rendered into <body>: the header has backdrop-blur, which would trap a `fixed` child inside it. */}
      {open &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-4 pt-[10vh]"
            onMouseDown={(e) => e.target === e.currentTarget && close()}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Search"
              className="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <svg className="h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
                </svg>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKey}
                  placeholder="Search errors, flashcards, links, PDFs, library…"
                  aria-label="Search"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={100}
                  className="min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
                />
                {loading && <span className="text-xs text-slate-400">Searching…</span>}
                <kbd className="shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-400 dark:border-slate-600">
                  Esc
                </kbd>
              </div>

              <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
                {error && (
                  <p className="m-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                    {error}
                  </p>
                )}

                {!error && short && (
                  <p className="px-3 py-8 text-center text-sm text-slate-400">
                    {trimmed.length === 0
                      ? "Type at least 2 characters to search."
                      : "Keep typing… at least 2 characters."}
                  </p>
                )}

                {!error && !short && data && data.groups.length === 0 && !loading && (
                  <p className="px-3 py-8 text-center text-sm text-slate-400">
                    Nothing found for “{data.q}”.
                  </p>
                )}

                {data?.failed && data.failed.length > 0 && (
                  <p className="m-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                    Could not search: {data.failed.join(", ")}.
                  </p>
                )}

                {!error &&
                  data?.groups.map((g) => (
                    <section key={g.key} className="mb-2">
                      <h3 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {GROUP_ICON[g.key] ?? "•"} {g.label}
                        {g.more && <span className="ml-1 normal-case tracking-normal">(top {g.items.length}, more exist — refine your search)</span>}
                      </h3>
                      <ul>
                        {g.items.map((it) => {
                          idx++;
                          const i = idx;
                          const isActive = i === active;
                          return (
                            <li key={`${g.key}-${it.id}`}>
                              <button
                                type="button"
                                data-idx={i}
                                onClick={() => go(it)}
                                onMouseMove={() => active !== i && setActive(i)}
                                className={`flex w-full flex-col rounded-lg px-3 py-2 text-left cursor-pointer ${
                                  isActive ? "bg-indigo-50 dark:bg-indigo-950/50" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                }`}
                              >
                                <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{it.title}</span>
                                {it.subtitle && (
                                  <span className="truncate text-xs text-slate-500 dark:text-slate-400">{it.subtitle}</span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-800">
                <span>↑ ↓ to move · Enter to open · Esc to close</span>
                <span>PDFs open directly; other results open their page</span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
