// Browser-side helpers for the full backup (see app/api/backup/route.ts)

export type RestoreSummary = {
  legacy?: boolean;
  mode?: "merge" | "replace";
  tables: Record<string, number>;
  skippedRows?: number;
  skippedTables?: string[];
  screenshotsRestored?: number;
  pdfFilesRestored?: number;
  safetySnapshot?: string | null;
};

export async function downloadFullBackup(includePdfs: boolean): Promise<void> {
  const res = await fetch(`/api/backup${includePdfs ? "?pdfs=1" : ""}`);
  if (!res.ok) {
    let msg = "Backup failed.";
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] || "gate-2027-backup.zip";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** .zip = full backup, .json = old flashcards/v2 backup. */
export async function uploadBackup(file: File, mode: "merge" | "replace"): Promise<RestoreSummary> {
  const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip";
  const res = await fetch(isZip ? `/api/backup?mode=${mode}` : "/api/backup", {
    method: "POST",
    headers: { "Content-Type": isZip ? "application/zip" : "application/json" },
    body: isZip ? file : await file.text(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Restore failed.");
  return data as RestoreSummary;
}

export function summarize(r: RestoreSummary): string {
  const t = Object.entries(r.tables).filter(([, n]) => n > 0).map(([k, n]) => `${k}: ${n}`).join(", ");
  return `${t || "nothing to restore"}${r.skippedRows ? ` | ${r.skippedRows} rows skipped (usually bookmarks/notes of PDFs that are not uploaded yet)` : ""}`;
}
