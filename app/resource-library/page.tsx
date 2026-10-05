"use client";

import { useEffect, useState } from "react";

type Node = { name: string; path: string; type: "folder" | "file"; fileType?: "pdf" | "video"; children?: Node[] };

export default function ResourceLibraryPage() {
  const [root, setRoot] = useState("");
  const [tree, setTree] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/resource-manager", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load resource tree");
      setRoot(data.rootPath || "");
      setTree(data.tree || []);
    } catch (error: any) {
      setMsg(error?.message || "Could not load resource tree");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function changeRoot() {
    const next = window.prompt("Resource Root folder path:", root);
    if (next === null || !next.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/resource-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-root", rootPath: next.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not change root");
      setMsg("Root changed ✓. PDFs are now managed only through Resource Root + Sync.");
      await load();
    } catch (error: any) {
      setMsg(error?.message || "Could not change root");
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(""), 3500);
    }
  }

  async function syncAll() {
    setBusy(true);
    try {
      const res = await fetch("/api/resource-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync" }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setMsg(`Sync complete ✓ ${data.syncedChapters || 0} chapters scanned. PDFs are imported/updated from Resource Root only.`);
      await load();
    } catch (error: any) {
      setMsg(error?.message || "Sync failed");
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(""), 4500);
    }
  }

  async function rename(node: Node) {
    const next = window.prompt("New name:", node.name);
    if (next === null || !next.trim() || next.trim() === node.name) return;
    setBusy(true);
    try {
      const res = await fetch("/api/resource-manager", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rename", path: node.path, name: next.trim() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rename failed");
      setMsg("Renamed ✓");
      await load();
    } catch (error: any) {
      setMsg(error?.message || "Rename failed");
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(""), 2500);
    }
  }

  async function remove(node: Node) {
    const isPdf = node.type === "file" && node.fileType === "pdf";
    const warning = isPdf
      ? `Delete source PDF "${node.name}" from this resource root?\n\nYour Notes Viewer PDF, annotations, bookmarks and flashcard data will NOT be deleted.`
      : node.type === "folder"
        ? `Delete folder "${node.name}" and everything inside it?\n\nNotes Viewer canonical PDFs are protected and will remain.`
        : `Delete "${node.name}"?`;
    if (!window.confirm(warning)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/resource-manager", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", path: node.path }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setMsg("Deleted source resource ✓. Protected PDF data remains in Notes Viewer.");
      await load();
    } catch (error: any) {
      setMsg(error?.message || "Delete failed");
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(""), 3500);
    }
  }

  return (
    <div className="mx-auto max-w-[1550px] space-y-5 px-4 py-6">
      <header className="rounded-3xl border bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Resource Manager</p>
            <h1 className="mt-1 text-3xl font-extrabold">📂 Subject-wise Resource Tree</h1>
            <p className="mt-2 text-sm text-slate-500">Tumhare actual folder structure ko yahin manage karo. Rename/Delete source filesystem par apply hota hai.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={changeRoot} disabled={busy} className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">📂 Change Root</button>
            <button onClick={syncAll} disabled={busy || !root} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Working…" : "🔄 Sync Library"}</button>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs font-mono text-slate-500 break-all">Root: {root || "Not configured"}</div>
        <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-800 dark:border-indigo-900/50 dark:bg-indigo-950/20 dark:text-indigo-200">🔒 Single source of truth: PDFs और videos सिर्फ Resource Root से Sync होते हैं. Notes Viewer केवल view/annotate/bookmark/flashcard के लिए है; वहाँ PDF upload/delete नहीं है.</div>
      </header>

      <section className="rounded-3xl border bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4">
          <h2 className="text-lg font-bold">Subjects → Chapters → Resources</h2>
          <p className="text-xs text-slate-500">📁 Folder · 📄 PDF · 🎥 Video. Other Videos category is not used.</p>
        </div>
        {loading ? <div className="py-12 text-center text-sm text-slate-400">Loading resource tree…</div> : tree.length ? <div className="space-y-1">{tree.map(node => <TreeNode key={node.path} node={node} level={0} onRename={rename} onDelete={remove} />)}</div> : <div className="py-12 text-center text-sm text-slate-400">Resource root set nahi hai ya folder empty hai.</div>}
      </section>

      {msg && <div className="fixed bottom-5 right-5 z-50 max-w-[min(90vw,560px)] rounded-2xl bg-slate-900 px-5 py-3 text-sm text-white shadow-2xl">{msg}</div>}
    </div>
  );
}

function TreeNode({ node, level, onRename, onDelete }: { node: Node; level: number; onRename: (node: Node) => void; onDelete: (node: Node) => void }) {
  const folder = node.type === "folder";
  const [open, setOpen] = useState(level < 2);
  return (
    <div>
      <div className="group flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60" style={{ paddingLeft: 12 + level * 24 }}>
        <button onClick={() => folder && setOpen(v => !v)} className="w-5 text-left text-xs text-slate-400">{folder ? (open ? "▼" : "▶") : ""}</button>
        <span>{folder ? "📁" : node.fileType === "pdf" ? "📄" : "🎥"}</span>
        <span className={`min-w-0 flex-1 truncate ${level === 0 ? "font-bold" : "text-sm"}`}>{node.name}</span>
        <button onClick={() => onRename(node)} className="rounded-lg border px-2 py-1 text-[10px] font-semibold opacity-0 group-hover:opacity-100">Rename</button>
        <button onClick={() => onDelete(node)} className="rounded-lg border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-600 opacity-0 group-hover:opacity-100">Delete</button>
      </div>
      {folder && open && node.children?.map(child => <TreeNode key={child.path} node={child} level={level + 1} onRename={onRename} onDelete={onDelete} />)}
    </div>
  );
}
