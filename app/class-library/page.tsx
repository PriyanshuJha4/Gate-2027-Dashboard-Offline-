"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type Category = "class" | "dpp";
type Video = {
  id: string;
  title: string;
  pathOrUrl: string;
  category: Category;
  position: number;
  completed: boolean;
};
type PdfResource = { id: string; title: string; filename: string; path: string; size: number };
type Playlist = {
  id?: string;
  subject: string;
  chapter: string;
  videoRootPath: string;
  classVideoPath: string;
  dppVideoPath: string;
  videos: Video[];
  resources: { all: PdfResource[] };
};

const CATEGORY_META: Record<Category, { label: string; icon: string }> = {
  class: { label: "Class Videos", icon: "🎥" },
  dpp: { label: "DPP Videos", icon: "📝" },
};

function normalize(value: string) {
  return String(value || "").trim().toLowerCase();
}
function normalizeChapterName(value: string) {
  return normalize(String(value || "").replace(/^\s*\d+\s*[_.)-]\s*/, ""));
}

function pdfSrc(pathValue: string) {
  return `/api/pdf-file?path=${encodeURIComponent(pathValue)}`;
}

export default function ClassLibraryPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [category, setCategory] = useState<Category>("class");
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [rootPath, setRootPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const restoredChapterRef = useRef(false);
  const LAST_CHAPTER_KEY = "gate-class-dpp-library:last-chapter";

  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of playlists) {
      const key = normalize(item.subject);
      if (!map.has(key)) map.set(key, item.subject.trim());
    }
    return [...map.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [playlists]);

  const chapters = useMemo(() => {
    const map = new Map<string, Playlist>();
    for (const item of playlists) {
      if (normalize(item.subject) !== normalize(subject)) continue;
      const key = normalizeChapterName(item.chapter);
      if (!map.has(key)) map.set(key, item);
    }
    return [...map.values()].sort((a, b) => a.chapter.localeCompare(b.chapter, undefined, { numeric: true, sensitivity: "base" }));
  }, [playlists, subject]);

  const videos = useMemo(
    () => (playlist?.videos || []).filter((video) => video.category === category).sort((a, b) => a.position - b.position),
    [playlist, category],
  );

  const completed = videos.filter((video) => video.completed).length;
  const progress = videos.length ? Math.round((completed / videos.length) * 100) : 0;

  // Library-wide progress for the active Class/DPP category. The widget below
  // reads from the same in-memory playlist state that the chapter list uses,
  // so marking a video complete updates it immediately without a reload.
  const libraryVideoStats = useMemo(() => {
    const categoryVideos = playlists.flatMap((item) =>
      (item.videos || []).filter((video) => video.category === category),
    );
    const total = categoryVideos.length;
    const completedCount = categoryVideos.filter((video) => video.completed).length;
    return {
      total,
      completed: completedCount,
      progress: total ? Math.round((completedCount / total) * 100) : 0,
    };
  }, [playlists, category]);

  async function loadSettings() {
    const response = await fetch("/api/resource-sync", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setRootPath(data.rootPath || "");
  }

  async function loadList() {
    const response = await fetch("/api/chapter-playlists", { cache: "no-store" });
    const data = await response.json();
    const value = Array.isArray(data) ? data : [];
    setPlaylists(value);
    return value;
  }

  async function loadChapter(nextSubject = subject, nextChapter = chapter) {
    if (!nextSubject || !nextChapter) {
      setPlaylist(null);
      return;
    }
    const response = await fetch(
      `/api/chapter-playlists?subject=${encodeURIComponent(nextSubject)}&chapter=${encodeURIComponent(nextChapter)}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    const nextPlaylist = data?.subject ? data as Playlist : null;
    setPlaylist(nextPlaylist);
    if (nextPlaylist) {
      setPlaylists((current) => {
        const exists = current.some(
          (item) => normalize(item.subject) === normalize(nextPlaylist.subject) && normalizeChapterName(item.chapter) === normalizeChapterName(nextPlaylist.chapter),
        );
        if (!exists) return [...current, nextPlaylist];
        return current.map((item) =>
          normalize(item.subject) === normalize(nextPlaylist.subject) && normalizeChapterName(item.chapter) === normalizeChapterName(nextPlaylist.chapter)
            ? nextPlaylist
            : item,
        );
      });
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const [, fresh] = await Promise.all([loadSettings(), loadList()]);
        if (!restoredChapterRef.current && fresh.length) {
          let saved: { subject?: string; chapter?: string } = {};
          try { saved = JSON.parse(localStorage.getItem(LAST_CHAPTER_KEY) || "{}"); } catch { saved = {}; }
          const savedPlaylist = fresh.find((p: Playlist) => normalize(p.subject) === normalize(saved.subject || "") && normalize(p.chapter) === normalize(saved.chapter || ""));
          const fallbackSubject = fresh[0]?.subject || "";
          const subjectToUse = savedPlaylist?.subject || fallbackSubject;
          const subjectRows = fresh.filter((p: Playlist) => normalize(p.subject) === normalize(subjectToUse));
          const chapterToUse = savedPlaylist?.chapter || subjectRows[0]?.chapter || "";
          restoredChapterRef.current = true;
          setSubject(subjectToUse);
          setChapter(chapterToUse);
          if (subjectToUse && chapterToUse) await loadChapter(subjectToUse, chapterToUse);
        }
      } catch (error: any) {
        setMsg(error?.message || "Could not load library");
      }
    })();
  }, []);

  useEffect(() => {
    if (!restoredChapterRef.current) return;
    const matchedSubject = subjects.find((value) => normalize(value) === normalize(subject));
    if (!matchedSubject && subjects.length) {
      setSubject(subjects[0]);
      return;
    }
    if (matchedSubject && matchedSubject !== subject) setSubject(matchedSubject);
  }, [subjects, subject]);

  useEffect(() => {
    if (!restoredChapterRef.current) return;
    const matchedChapter = chapters.find((value) => normalizeChapterName(value.chapter) === normalizeChapterName(chapter));
    if (!matchedChapter && chapters.length) setChapter(chapters[0].chapter);
    else if (!matchedChapter) setChapter("");
    else if (matchedChapter.chapter !== chapter) setChapter(matchedChapter.chapter);
  }, [chapters, chapter]);

  useEffect(() => {
    loadChapter().catch((error) => setMsg(error?.message || "Could not load chapter"));
  }, [subject, chapter]);

  useEffect(() => {
    if (!subject || !chapter) return;
    try {
      localStorage.setItem(LAST_CHAPTER_KEY, JSON.stringify({ subject, chapter }));
    } catch { /* localStorage can be unavailable in private/restricted contexts */ }
  }, [subject, chapter]);

  async function changeRoot() {
    const next = window.prompt("Resource Root folder path:", rootPath);
    if (next === null || !next.trim()) return;
    setLoading(true);
    try {
      const response = await fetch("/api/resource-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-root", rootPath: next.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not change root");
      setRootPath(data.rootPath || next.trim());
      setMsg("Root changed ✓. Run Sync Library or Sync Chapter to refresh it.");
    } catch (error: any) {
      setMsg(error?.message || "Could not change root");
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(""), 3500);
    }
  }

  async function syncChapter() {
    if (!subject || !chapter) return;
    setLoading(true);
    try {
      const response = await fetch("/api/resource-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", subject, chapter }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sync failed");
      await loadSettings();
      const fresh = await loadList();
      const selectedSubject = fresh.find((p: Playlist) => normalize(p.subject) === normalize(subject))?.subject || subject;
      const selectedChapter = fresh.find((p: Playlist) => normalize(p.subject) === normalize(subject) && normalize(p.chapter) === normalize(chapter))?.chapter || chapter;
      setSubject(selectedSubject);
      setChapter(selectedChapter);
      await loadChapter(selectedSubject, selectedChapter);
      setMsg(`Chapter synced ✓. ${data.results?.[0]?.videos?.class?.found || 0} Class + ${data.results?.[0]?.videos?.dpp?.found || 0} DPP videos found.`);
    } catch (error: any) {
      setMsg(error?.message || "Sync failed");
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(""), 4000);
    }
  }

  async function syncAll() {
    setLoading(true);
    try {
      const response = await fetch("/api/resource-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sync failed");
      const fresh = await loadList();
      await loadSettings();
      if (fresh.length) {
        const keptSubject = fresh.find((p: Playlist) => normalize(p.subject) === normalize(subject))?.subject || fresh[0].subject;
        const keptChapters = fresh.filter((p: Playlist) => normalize(p.subject) === normalize(keptSubject));
        const keptChapter = keptChapters.find((p: Playlist) => normalize(p.chapter) === normalize(chapter))?.chapter || keptChapters[0]?.chapter || "";
        setSubject(keptSubject);
        setChapter(keptChapter);
        if (keptChapter) await loadChapter(keptSubject, keptChapter);
      }
      const syncTotals = (data.results || []).reduce((acc: { classCount: number; dppCount: number }, item: any) => ({
        classCount: acc.classCount + Number(item?.videos?.class?.found || 0),
        dppCount: acc.dppCount + Number(item?.videos?.dpp?.found || 0),
      }), { classCount: 0, dppCount: 0 });
      setMsg(`Library synced ✓. ${data.syncedChapters || 0} chapters scanned · ${syncTotals.classCount} Class + ${syncTotals.dppCount} DPP videos found.`);
    } catch (error: any) {
      setMsg(error?.message || "Sync failed");
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(""), 4000);
    }
  }

  async function toggleCompleted(video: Video) {
    const next = !video.completed;
    const response = await fetch("/api/chapter-playlists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId: video.id, completed: next }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMsg(data.error || "Could not update completion");
      return;
    }
    setPlaylist((current) => current ? {
      ...current,
      videos: current.videos.map((item) => item.id === video.id ? { ...item, completed: next } : item),
    } : current);
    setPlaylists((current) => current.map((item) => ({
      ...item,
      videos: item.videos.map((itemVideo) => itemVideo.id === video.id ? { ...itemVideo, completed: next } : itemVideo),
    })));
  }

  async function openInVlc(video: Video) {
    const response = await fetch("/api/open-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId: video.id }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setMsg(data.error || "Could not open video in VLC");
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-6">
      {/* Fixed library progress widget: remains visible while browsing Class/DPP videos. */}
      <aside className="fixed right-5 top-5 z-40 hidden w-64 rounded-2xl border border-indigo-100 bg-white/95 p-4 shadow-xl backdrop-blur-md dark:border-indigo-900/60 dark:bg-slate-900/95 sm:block" aria-label={`${CATEGORY_META[category].label} library progress`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Video Progress</p>
            <h2 className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">{CATEGORY_META[category].icon} {CATEGORY_META[category].label}</h2>
          </div>
          <span className="text-lg font-extrabold text-indigo-600">{libraryVideoStats.progress}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={libraryVideoStats.progress} aria-label={`${libraryVideoStats.progress}% complete`}>
          <div className="h-full rounded-full bg-indigo-600 transition-all duration-300" style={{ width: `${libraryVideoStats.progress}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-slate-500">
          <span>{libraryVideoStats.completed} completed</span>
          <span>{libraryVideoStats.total} total</span>
        </div>
      </aside>

      <header className="rounded-3xl border bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:pr-72">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Chapter Study Library</p>
            <h1 className="mt-1 text-3xl font-extrabold">🎥 Class & DPP Library</h1>
            <p className="mt-2 text-sm text-slate-500">Click video → VLC. Completion only by manual checkbox.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={changeRoot} disabled={loading} className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">📂 Change Root</button>
            <button onClick={syncAll} disabled={loading || !rootPath} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Working…" : "🔄 Sync Library"}</button>
            <Link href="/resource-library" className="rounded-xl border px-4 py-2 text-sm font-semibold">📦 Resource Manager</Link>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs font-mono text-slate-500 break-all dark:bg-slate-950">Root: {rootPath || "Not configured"}</div>
      </header>

      <section className="grid gap-3 rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-2">
        <select value={subject} onChange={(e) => { setSubject(e.target.value); setChapter(""); }} className="rounded-xl border bg-transparent px-3 py-3 text-sm">
          <option value="">Select Subject</option>
          {subjects.map((item) => <option key={normalize(item)} value={item}>{item}</option>)}
        </select>
        <select value={chapter} onChange={(e) => setChapter(e.target.value)} className="rounded-xl border bg-transparent px-3 py-3 text-sm" disabled={!subject}>
          <option value="">Select Chapter</option>
          {chapters.map((item) => <option key={item.id || `${item.subject}-${item.chapter}`} value={item.chapter}>{item.chapter}</option>)}
        </select>
      </section>

      {playlist && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-xl font-bold">{playlist.subject} / {playlist.chapter}</h2><p className="text-xs text-slate-500 break-all">{playlist.videoRootPath}</p></div>
            <button onClick={syncChapter} disabled={loading} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">{loading ? "Syncing…" : "🔄 Sync Chapter"}</button>
          </div>

          <div className="flex rounded-2xl border bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950">
            {(["class", "dpp"] as Category[]).map((item) => (
              <button key={item} onClick={() => setCategory(item)} className={`flex-1 rounded-xl px-3 py-3 text-xs font-semibold ${category === item ? "bg-white text-indigo-600 shadow dark:bg-slate-800" : "text-slate-500"}`}>
                {CATEGORY_META[item].icon} {CATEGORY_META[item].label}
              </button>
            ))}
          </div>

          <section className="grid gap-3 md:grid-cols-4">
            <Stat label="Total Videos" value={videos.length} />
            <Stat label="Completed" value={completed} />
            <Stat label="Remaining" value={videos.length - completed} />
            <Stat label="Progress" value={`${progress}%`} />
          </section>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full bg-indigo-600" style={{ width: `${progress}%` }} /></div>

          <section className="rounded-2xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h2 className="font-bold">{CATEGORY_META[category].icon} {CATEGORY_META[category].label}</h2><p className="text-xs text-slate-500">All files from the synced playlist.</p></div>
              <span className="text-xs font-semibold text-slate-500">{completed}/{videos.length} complete</span>
            </div>
            {videos.length ? (
              <div className="space-y-2">
                {videos.map((video, index) => (
                  <div key={video.id} className="flex items-center gap-3 rounded-xl border p-3 hover:border-indigo-400 dark:border-slate-800">
                    <span className="w-7 shrink-0 text-center text-xs text-slate-400">{index + 1}</span>
                    <button onClick={() => openInVlc(video)} className="min-w-0 flex-1 text-left" title="Play in VLC">
                      <span className="block truncate text-sm font-semibold hover:text-indigo-600">▶ {video.title}</span>
                      <span className="block truncate text-[11px] text-slate-500">{video.completed ? "Completed" : "Not completed"}</span>
                    </button>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300" title="Mark completed manually">
                      <input type="checkbox" checked={video.completed} onChange={() => toggleCompleted(video)} className="h-4 w-4 rounded" />
                      Done
                    </label>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-slate-400">No videos found. Check the chapter folder and run Sync Chapter.</div>
            )}
          </section>

          <section className="rounded-2xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h2 className="font-bold">📚 Chapter Notes</h2><p className="text-xs text-slate-500">All PDFs linked to this chapter. Notes Viewer remains the canonical PDF store.</p></div>
              <Link href="/notes" className="text-xs font-semibold text-indigo-600">Open Notes Viewer →</Link>
            </div>
            {playlist.resources?.all?.length ? (
              <div className="space-y-2">
                {playlist.resources.all.map((pdf) => (
                  <a key={pdf.id} href={pdfSrc(pdf.path)} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border p-3 hover:border-indigo-400 dark:border-slate-800">
                    <span>📄</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{pdf.title}</span><span className="block truncate text-[10px] text-slate-500">{pdf.filename}</span></span>
                    <span className="text-xs font-semibold text-indigo-600">Open ↗</span>
                  </a>
                ))}
              </div>
            ) : <p className="py-8 text-center text-xs text-slate-400">No PDFs linked to this chapter.</p>}
          </section>
        </>
      )}

      {!playlist && <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-slate-400">Resource Manager se library sync karo, phir subject aur chapter select karo.</div>}
      {msg && <div className="fixed bottom-5 right-5 z-50 rounded-xl bg-slate-900 px-4 py-3 text-xs text-white shadow-2xl">{msg}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></div>;
}
