import fs from "fs";
import path from "path";
import { DATA_DIR, SHOT_DIR, resolveShotPath } from "@/lib/paths";

export type StoredImage = { id: string; name: string; path: string };

const MAX_BYTES = 15 * 1024 * 1024;
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
export const MIME_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

const safe = (s: string) => String(s).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "x";

/** URL the browser uses to display a stored screenshot. */
export function shotUrl(relPath: string) {
  return `/api/screenshots/file?p=${encodeURIComponent(relPath)}`;
}

/** Reverse of shotUrl(): "/api/screenshots/file?p=screenshots%2Fa%2Fb.png" -> "screenshots/a/b.png" */
export function pathFromShotUrl(url: string): string | null {
  const m = /^\/api\/screenshots\/file\?p=([^&]+)/.exec(url);
  if (!m) return null;
  try {
    const p = decodeURIComponent(m[1]);
    return resolveShotPath(p) ? p : null;
  } catch {
    return null;
  }
}

/** Write a data: URL to screenshots/<errorId>/<imageId>.<ext>. Returns the stored descriptor, or null if invalid. */
export function saveDataUrl(errorId: string, imageId: string, name: string, dataUrl: string): StoredImage | null {
  const m = /^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!m) return null;
  const ext = EXT_BY_MIME[m[1].toLowerCase()];
  if (!ext) return null; // only real image types, never svg/html
  const buf = Buffer.from(m[2], "base64");
  if (buf.length === 0 || buf.length > MAX_BYTES) return null;
  const dir = path.join(SHOT_DIR, safe(errorId));
  fs.mkdirSync(dir, { recursive: true });
  const file = `${safe(imageId)}.${ext}`;
  fs.writeFileSync(path.join(dir, file), buf);
  return { id: imageId, name, path: `screenshots/${safe(errorId)}/${file}` };
}

/** Remove screenshot files of an entry that are no longer referenced (keepPaths = still in use). */
export function pruneEntryShots(errorId: string, keepPaths: string[]) {
  try {
    const dir = path.join(SHOT_DIR, safe(errorId));
    if (!fs.existsSync(dir)) return;
    const keep = new Set(keepPaths.map((p) => path.resolve(DATA_DIR, p)));
    for (const f of fs.readdirSync(dir)) {
      const abs = path.resolve(dir, f);
      if (!keep.has(abs)) fs.rmSync(abs, { force: true });
    }
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch (e) {
    console.warn("pruneEntryShots:", (e as Error).message);
  }
}

export function removeEntryShots(errorId: string) {
  try {
    fs.rmSync(path.join(SHOT_DIR, safe(errorId)), { recursive: true, force: true });
  } catch {}
}

/** Normalise whatever the browser/old rows contain into what we keep in the DB. */
export function toStoredImages(errorId: string, input: unknown): StoredImage[] {
  if (!Array.isArray(input)) return [];
  const out: StoredImage[] = [];
  input.forEach((raw: any, i: number) => {
    const item = typeof raw === "string" ? { dataUrl: raw } : raw;
    if (!item || typeof item !== "object") return;
    const id = String(item.id || `${Date.now()}-${i}`);
    const name = String(item.name || "image");
    if (typeof item.path === "string" && resolveShotPath(item.path)) {
      out.push({ id, name, path: item.path });
      return;
    }
    const url = typeof item.dataUrl === "string" ? item.dataUrl : "";
    if (url.startsWith("data:")) {
      const saved = saveDataUrl(errorId, id, name, url);
      if (saved) out.push(saved);
      return;
    }
    const p = pathFromShotUrl(url);
    if (p) out.push({ id, name, path: p });
  });
  return out;
}

/** What GET sends to the browser: the client keeps using `dataUrl` as <img src>. */
export function toClientImages(stored: unknown): any[] {
  if (!Array.isArray(stored)) return [];
  return stored.map((it: any) => {
    if (it && typeof it === "object" && typeof it.path === "string") {
      return { id: it.id, name: it.name, path: it.path, dataUrl: shotUrl(it.path) };
    }
    return it; // not migrated yet (old base64) - still displays
  });
}

/* ------------------------- flashcard (cropped) images ------------------------- */
// screenshots/_cards/<cardId>_<timestamp>.<ext>   (new name on every change, so the browser never shows a stale image)

const CARD_DIR = "_cards";

function cardFiles(cardId: string): string[] {
  const dir = path.join(SHOT_DIR, CARD_DIR);
  if (!fs.existsSync(dir)) return [];
  const prefix = `${safe(cardId)}_`;
  return fs.readdirSync(dir).filter((f) => f.startsWith(prefix)).map((f) => path.join(dir, f));
}

/** What cards.front_image should hold: "" or a stored path ("screenshots/_cards/..."). Accepts data: URL, our file URL or a path. */
export function storeCardImage(cardId: string, value: unknown): string {
  const v = typeof value === "string" ? value : "";
  if (!v) return "";
  if (resolveShotPath(v)) return v; // already a stored path
  const fromUrl = pathFromShotUrl(v);
  if (fromUrl) return fromUrl;
  if (v.startsWith("data:")) {
    const saved = saveDataUrl(CARD_DIR, `${safe(cardId)}_${Date.now()}`, "card", v);
    return saved ? saved.path : "";
  }
  return "";
}

/** Delete this card's image files except `keepPath`. */
export function pruneCardImages(cardId: string, keepPath: string) {
  const keep = keepPath ? path.resolve(DATA_DIR, keepPath) : "";
  for (const f of cardFiles(cardId)) if (path.resolve(f) !== keep) fs.rmSync(f, { force: true });
}

/** GET: stored path -> URL the <img> can load. Old base64 (not migrated yet) is returned unchanged. */
export function cardImageForClient(value: unknown): string {
  const v = typeof value === "string" ? value : "";
  return v && resolveShotPath(v) ? shotUrl(v) : v;
}
