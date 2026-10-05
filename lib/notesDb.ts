/**
 * SQLite & Filesystem storage bridge for Notes Viewer + Flashcards.
 * Replaces IndexedDB with backend API calls communicating with local SQLite (local.db).
 *
 * Stores:
 *  - pdfs          : metadata + relative paths in SQLite, files in physical filesystem
 *  - annotations   : stored in SQLite (pdf_annotations table)
 *  - bookmarks     : stored in SQLite (pdf_bookmarks table)
 *  - cards         : stored in SQLite (cards table)
 *  - reviews       : stored in SQLite (reviews table)
 */

import { apiGet, apiSend, ApiError } from "@/lib/apiClient";

// IMPORTANT: every function below THROWS when the server or the network fails.
// Callers must catch and show the problem. Returning [] / {} after an error made a broken server look
// like "you have no data", and ignoring a failed write made a lost save look like "Saved".

/* --------------------------------- Types ---------------------------------- */

export type StrokeItem = {
  id: string;
  type: "pen" | "highlight";
  color: string;
  width: number; // fraction of page width
  points: [number, number][]; // normalized 0..1
};

export type RectItem = {
  id: string;
  type: "rect";
  color: string;
  x: number;
  y: number;
  w: number;
  h: number; // all normalized 0..1
};

export type TextItem = {
  id: string;
  type: "text";
  color: string;
  x: number;
  y: number; // normalized 0..1
  size: number; // font size as a fraction of page width
  text: string;
};

export type Annotation = StrokeItem | RectItem | TextItem;

export type StoredPdf = {
  id: string;
  name: string;
  originalName: string;
  relativePath: string;
  subject: string;
  chapter: string;
  size: number;
  addedAt: string;
  lastPage: number;
  // Backward compatibility for components expecting blob or url
  url?: string;
  blob?: Blob;
};

export type PageAnnotations = {
  key: string; // `${pdfId}:${page}`
  pdfId: string;
  page: number;
  items: Annotation[];
};

export type Bookmark = {
  id: string;
  pdfId: string;
  page: number;
  label: string;
  createdAt: string;
};

export type CardSource = { pdfId: string; pdfName: string; page: number };

export type Card = {
  id: string;
  front: string;
  back: string;
  frontImage: string; // data URL or path of cropped region ("" if none)
  subject: string;
  topic: string;
  source: CardSource | null;
  ease: number;
  interval: number; // days
  reps: number;
  lapses: number;
  due: string; // YYYY-MM-DD (local date)
  createdAt: string;
  lastReviewed: string; // YYYY-MM-DD or ""
};

export type ReviewDay = { date: string; count: number };

/* -------------------------------- Helpers --------------------------------- */

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/* ---------------------------------- PDFs ---------------------------------- */

export async function listPdfs(): Promise<StoredPdf[]> {
  const data = await apiGet("/api/pdfs");
  return data.pdfs || [];
}

/** undefined = the PDF really does not exist (404). Any other failure throws. */
export async function getPdf(id: string): Promise<StoredPdf | undefined> {
  try {
    const data = await apiGet(`/api/pdfs/${encodeURIComponent(id)}`);
    return data.pdf;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return undefined;
    throw err;
  }
}

/** 
 * Uploads a PDF file along with Subject and Chapter metadata.
 * Saves physical file to filesystem and metadata to SQLite.
 */
export async function uploadPdfWithMetadata(
  file: File,
  subject: string,
  chapter: string,
  title?: string
): Promise<StoredPdf> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("subject", subject);
  formData.append("chapter", chapter);
  if (title) formData.append("title", title);

  const res = await fetch("/api/pdfs/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to upload PDF");
  }

  const data = await res.json();
  return data.pdf;
}

// Keep putPdf as a wrapper or fallback if needed by older code
export async function putPdf(pdf: StoredPdf): Promise<void> {
  // If needed, can update metadata via API
  await updatePdf(pdf.id, {
    name: pdf.name,
    subject: pdf.subject,
    chapter: pdf.chapter,
    lastPage: pdf.lastPage,
  });
}

export async function updatePdf(
  id: string,
  patch: Partial<Omit<StoredPdf, "id" | "blob">>
): Promise<void> {
  await apiSend(`/api/pdfs/${encodeURIComponent(id)}`, "PATCH", patch);
}

/** Deletes the PDF together with its physical file, annotations, and bookmarks. */
export async function deletePdf(id: string): Promise<void> {
  try {
    await apiSend(`/api/pdfs/${encodeURIComponent(id)}`, "DELETE");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return; // already gone
    throw err;
  }
}

/* ------------------------------- Annotations ------------------------------ */

export async function getAnnotationsForPdf(
  pdfId: string
): Promise<Record<number, Annotation[]>> {
  // Must throw on failure: if this returned {} the viewer would show a blank page and the next
  // autosave could overwrite the real annotations of that page.
  const data = await apiGet(`/api/annotations?pdfId=${encodeURIComponent(pdfId)}`);
  return data.annotations || {};
}

export async function saveAnnotations(
  pdfId: string,
  page: number,
  items: Annotation[]
): Promise<void> {
  await apiSend("/api/annotations", "POST", { pdfId, page, items });
}

/* -------------------------------- Bookmarks ------------------------------- */

export async function listBookmarks(pdfId: string): Promise<Bookmark[]> {
  const data = await apiGet(`/api/bookmarks?pdfId=${encodeURIComponent(pdfId)}`);
  return data.bookmarks || [];
}

export async function putBookmark(bookmark: Bookmark): Promise<void> {
  await apiSend("/api/bookmarks", "POST", bookmark);
}

export async function deleteBookmark(id: string): Promise<void> {
  await apiSend(`/api/bookmarks?id=${encodeURIComponent(id)}`, "DELETE");
}

/* ---------------------------------- Cards --------------------------------- */

// Throws when the server cannot answer. It used to return [] here, which made a broken API look like
// "you have no flashcards". The callers already catch and show a message.
export async function listCards(): Promise<Card[]> {
  let res: Response;
  try {
    res = await fetch("/api/cards", { cache: "no-store" });
  } catch (err) {
    console.error("listCards error:", err);
    throw new Error("could not reach the app server");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ? `server said: ${body.error}` : `server error ${res.status}`);
  }
  const data = await res.json();
  return data.cards || [];
}

// Throws when the server did not store the card. It used to ignore the response, so a rejected card
// (HTTP 400/500) still looked "saved" in the dialog and was silently lost.
export async function putCard(card: Card): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });
  } catch (err) {
    console.error("putCard error:", err);
    throw new Error("could not reach the app server");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ? String(body.error) : `server error ${res.status}`);
  }
}

export async function deleteCard(id: string): Promise<void> {
  await apiSend(`/api/cards?id=${encodeURIComponent(id)}`, "DELETE");
}

/* --------------------------------- Reviews -------------------------------- */

export async function listReviewDays(): Promise<ReviewDay[]> {
  const data = await apiGet("/api/reviews");
  return data.reviews || [];
}

export async function recordReview(date: string): Promise<void> {
  await apiSend("/api/reviews", "POST", { date });
}

// Backup / restore now lives in lib/backupClient.ts + app/api/backup/route.ts
