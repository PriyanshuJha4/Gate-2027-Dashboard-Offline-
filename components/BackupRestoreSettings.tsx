"use client";
import React, { useState } from "react";
import { downloadFullBackup, uploadBackup, summarize, type RestoreSummary } from "@/lib/backupClient";

export default function BackupRestoreSettings() {
  const [busy, setBusy] = useState<"" | "export" | "import">("");
  const [withPdfs, setWithPdfs] = useState(false);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [last, setLast] = useState<RestoreSummary | null>(null);

  const handleExport = async () => {
    setBusy("export");
    setMsg(null);
    try {
      await downloadFullBackup(withPdfs);
      setMsg({ ok: true, text: "Backup downloaded." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Backup failed." });
    } finally {
      setBusy("");
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (
      mode === "replace" &&
      !window.confirm("Replace mode: everything currently in the app is deleted and replaced by this backup. (A safety copy is saved first.) Continue?")
    )
      return;
    setBusy("import");
    setMsg(null);
    try {
      const r = await uploadBackup(file, mode);
      setLast(r);
      setMsg({ ok: true, text: `Restore finished. ${summarize(r)}. Refresh the page to see everything.` });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Restore failed." });
    } finally {
      setBusy("");
    }
  };

  const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900";
  return (
    <div className="space-y-5">
      <div className={`${card} space-y-4`}>
        <div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Full backup</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            One .zip with the whole database (error log, to-do, syllabus progress, mock tests, links, library, cards, bookmarks,
            annotations, roadmap...) and all error-log screenshots.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={withPdfs} onChange={(e) => setWithPdfs(e.target.checked)} />
          Also include the PDF files (file can get very big)
        </label>
        <button
          onClick={handleExport}
          disabled={busy !== ""}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy === "export" ? "Preparing..." : "Download full backup"}
        </button>
      </div>

      <div className={`${card} space-y-4`}>
        <div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Restore</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Choose a .zip made here. Old .json backups from the flashcards page also work.
          </p>
        </div>
        <div className="space-y-1 text-sm text-slate-700 dark:text-slate-200">
          <label className="flex items-start gap-2">
            <input type="radio" name="mode" checked={mode === "merge"} onChange={() => setMode("merge")} className="mt-1" />
            <span><b>Merge</b> (safe): adds / updates items from the backup, keeps everything else.</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} className="mt-1" />
            <span><b>Replace</b>: makes the app exactly like the backup (new PC, or after data loss).</span>
          </label>
        </div>
        <label className="inline-block cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          {busy === "import" ? "Restoring..." : "Choose backup file"}
          <input type="file" accept=".zip,.json,application/zip,application/json" onChange={handleImport} disabled={busy !== ""} className="hidden" />
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Before every restore a safety copy of your current database is saved in the backups folder (db/pre-restore-...).
        </p>
      </div>

      {msg && (
        <p className={`rounded-lg p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200"}`}>
          {msg.text}
        </p>
      )}
      {last?.skippedTables && last.skippedTables.length > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300">Not known to this app version, skipped: {last.skippedTables.join(", ")}</p>
      )}
    </div>
  );
}
