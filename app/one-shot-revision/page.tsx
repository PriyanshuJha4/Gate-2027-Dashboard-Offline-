"use client";

import { useEffect, useMemo, useState } from "react";

type Scope = "all" | "subject" | "chapter";

type FilterChapter = {
  subject: string;
  value: string;
};

type Annotation = {
  type: "text" | "highlight" | "rect";
  page: number;
  text?: string;
  color?: string | null;
};

type Document = {
  id: string;
  title: string;
  originalName: string;
  relativePath: string;
  subject: string;
  chapter: string;
  annotations: Annotation[];
};

type Flashcard = {
  id: string;
  front: string;
  back: string;
  frontImage: string;
  subject: string;
  topic: string;
  source: any;
  due: string;
  createdAt: string;
  lastReviewed: string;
};

type ErrorLog = {
  id: string;
  logDate: string;
  subject: string;
  topic: string;
  question: string;
  reason: string;
  mistake: string;
  correctConcept: string;
  sourceUrl: string;
  myAnswer: string;
  correctAnswer: string;
  whatWentWrong: string;
  solution: string;
  images: any[];
  mastered: boolean;
  reviewCount: number;
  lastReviewed: string;
  nextReview: string;
  createdAt: string;
};

type RevisionData = {
  filters: {
    scope: Scope;
    subject: string | null;
    chapter: string | null;
  };
  summary: {
    pdfs: number;
    annotations: number;
    writtenNotes: number;
    highlights: number;
    flashcards: number;
    errorLogs: number;
    masteredErrors: number;
    pendingErrors: number;
  };
  documents: Document[];
  flashcards: Flashcard[];
  errorLogs: ErrorLog[];
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeMarkdown(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("#", "\\#")
    .replaceAll("*", "\\*")
    .replaceAll("_", "\\_")
    .replaceAll("`", "\\`");
}


function getImageSrc(value: any): string {
  if (!value) return "";

  if (typeof value === "string") {
    const src = value.trim();
    if (!src) return "";
    if (/^(data:image\/|blob:|https?:\/\/)/i.test(src)) return src;
    if (src.startsWith("/api/screenshots/file?")) return src;
    if (src.startsWith("/")) return src;

    // Stored dashboard/error-log image path, e.g. screenshots/<id>/<file>.png
    const normalized = src.replace(/^\.\//, "").replace(/^\/+/, "");
    if (normalized.toLowerCase().startsWith("screenshots/")) {
      return `/api/screenshots/file?p=${encodeURIComponent(normalized)}`;
    }

    return src;
  }

  if (typeof value === "object") {
    // Prefer an already resolved browser URL/data URL over the stored path.
    return getImageSrc(value.dataUrl || value.url || value.path || "");
  }

  return "";
}

function getErrorImageSrc(image: any): string {
  return getImageSrc(image);
}

async function imageUrlToDataUrl(src: string): Promise<string> {
  if (!src || src.startsWith("data:")) return src;

  try {
    const response = await fetch(src, { cache: "no-store" });
    if (!response.ok) return src;

    const blob = await response.blob();

    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === "string" ? reader.result : src);
      reader.onerror = () => resolve(src);
      reader.readAsDataURL(blob);
    });
  } catch {
    return src;
  }
}

async function prepareExportData(data: RevisionData): Promise<RevisionData> {
  const copy: RevisionData = JSON.parse(JSON.stringify(data));

  await Promise.all(
    copy.flashcards.map(async (card) => {
      if (card.frontImage) {
        card.frontImage = await imageUrlToDataUrl(
          getImageSrc(card.frontImage)
        );
      }
    })
  );

  await Promise.all(
    copy.errorLogs.map(async (error) => {
      error.images = await Promise.all(
        (error.images || []).map(async (image: any) => {
          const src = getErrorImageSrc(image);
          const embedded = await imageUrlToDataUrl(src);

          return {
            ...(typeof image === "object" ? image : {}),
            dataUrl: embedded,
          };
        })
      );
    })
  );

  return copy;
}

async function waitForRevisionImages() {
  const images = Array.from(
    document.querySelectorAll<HTMLImageElement>(
      ".one-shot-revision-print-root img"
    )
  );

  await Promise.all(
    images.map(
      (image) =>
        image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            })
    )
  );
}

function getRevisionTitle(data: RevisionData | null): string {
  if (!data) return "GATE 2027 — One-Shot Revision";

  if (data.filters.scope === "chapter") {
    return `${data.filters.subject} — ${data.filters.chapter}`;
  }

  if (data.filters.scope === "subject") {
    return `${data.filters.subject} — Complete Revision`;
  }

  return "GATE 2027 — Complete Syllabus Revision";
}

function buildMarkdown(data: RevisionData): string {
  const title = getRevisionTitle(data);

  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push("");

  lines.push("## Revision Summary");
  lines.push("");
  lines.push(`- PDFs: ${data.summary.pdfs}`);
  lines.push(`- Written Notes: ${data.summary.writtenNotes}`);
  lines.push(`- Highlights: ${data.summary.highlights}`);
  lines.push(`- Flashcards: ${data.summary.flashcards}`);
  lines.push(`- Error Logs: ${data.summary.errorLogs}`);
  lines.push(`- Pending Errors: ${data.summary.pendingErrors}`);
  lines.push("");

  // ---------------------------------------------------------
  // ANNOTATIONS
  // ---------------------------------------------------------

  lines.push("## 1. Key Concepts & Annotations");
  lines.push("");

  if (data.documents.length === 0) {
    lines.push("No PDF annotations found.");
    lines.push("");
  }

  for (const document of data.documents) {
    const notes = document.annotations.filter(
      (annotation) => annotation.type === "text" && annotation.text
    );

    const highlights = document.annotations.filter(
      (annotation) => annotation.type === "highlight"
    );

    if (notes.length === 0 && highlights.length === 0) {
      continue;
    }

    lines.push(`### ${escapeMarkdown(document.title)}`);
    lines.push("");

    if (notes.length > 0) {
      lines.push("#### Written Notes");
      lines.push("");

      for (const note of notes) {
        lines.push(
          `- **Page ${note.page}:** ${escapeMarkdown(note.text || "")}`
        );
      }

      lines.push("");
    }

    if (highlights.length > 0) {
      lines.push("#### Highlights");
      lines.push("");

      for (const highlight of highlights) {
        lines.push(`- Highlighted area on page ${highlight.page}`);
      }

      lines.push("");
    }
  }

  // ---------------------------------------------------------
  // FLASHCARDS
  // ---------------------------------------------------------

  lines.push("## 2. Important Flashcards");
  lines.push("");

  if (data.flashcards.length === 0) {
    lines.push("No flashcards found.");
    lines.push("");
  }

  data.flashcards.forEach((card, index) => {
    lines.push(`### Q${index + 1}. ${escapeMarkdown(card.front || "Image-based question")}`);
    lines.push("");

    if (card.frontImage) {
      const imageSrc = getImageSrc(card.frontImage);
      if (imageSrc) {
        lines.push(`![Flashcard question image](${imageSrc})`);
      } else {
        lines.push("[Image-based question]");
      }
      lines.push("");
    }

    lines.push(`**Answer:** ${escapeMarkdown(card.back)}`);
    lines.push("");

    if (card.topic) {
      lines.push(`**Topic:** ${escapeMarkdown(card.topic)}`);
      lines.push("");
    }
  });

  // ---------------------------------------------------------
  // ERROR LOGS
  // ---------------------------------------------------------

  lines.push("## 3. Mistakes & Error Logs");
  lines.push("");

  if (data.errorLogs.length === 0) {
    lines.push("No error logs found.");
    lines.push("");
  }

  data.errorLogs.forEach((error, index) => {
    lines.push(
      `### Mistake ${index + 1}${error.topic ? ` — ${escapeMarkdown(error.topic)}` : ""}`
    );
    lines.push("");

    if (error.question) {
      lines.push(`**Question:** ${escapeMarkdown(error.question)}`);
      lines.push("");
    }

    if (error.reason) {
      lines.push(`**Reason:** ${escapeMarkdown(error.reason)}`);
      lines.push("");
    }

    if (error.myAnswer) {
      lines.push(`**My Answer:** ${escapeMarkdown(error.myAnswer)}`);
      lines.push("");
    }

    if (error.correctAnswer) {
      lines.push(
        `**Correct Answer:** ${escapeMarkdown(error.correctAnswer)}`
      );
      lines.push("");
    }

    if (error.whatWentWrong) {
      lines.push(
        `**What Went Wrong:** ${escapeMarkdown(error.whatWentWrong)}`
      );
      lines.push("");
    }

    if (error.solution) {
      lines.push(`**Solution:** ${escapeMarkdown(error.solution)}`);
      lines.push("");
    }

    if (error.correctConcept) {
      lines.push(
        `**Correct Concept:** ${escapeMarkdown(error.correctConcept)}`
      );
      lines.push("");
    }

    if (error.images?.length) {
      for (const image of error.images) {
        const imageSrc = getErrorImageSrc(image);
        if (imageSrc) {
          lines.push(`![${escapeMarkdown(image?.name || "Error screenshot")}](${imageSrc})`);
          lines.push("");
        }
      }
    }

    lines.push(
      `**Status:** ${error.mastered ? "Mastered" : "Needs Revision"}`
    );
    lines.push("");

    if (error.reviewCount > 0) {
      lines.push(`**Reviews:** ${error.reviewCount}`);
      lines.push("");
    }
  });

  lines.push("---");
  lines.push("");
  lines.push("Generated by GATE 2027 Dashboard.");

  return lines.join("\n");
}

function buildHtml(data: RevisionData): string {
  const title = escapeHtml(getRevisionTitle(data));

  const noteSections = data.documents
    .map((document) => {
      const notes = document.annotations.filter(
        (annotation) => annotation.type === "text" && annotation.text
      );

      const highlights = document.annotations.filter(
        (annotation) => annotation.type === "highlight"
      );

      if (notes.length === 0 && highlights.length === 0) {
        return "";
      }

      return `
        <section>
          <h3>${escapeHtml(document.title)}</h3>

          ${
            notes.length
              ? `
                <h4>Written Notes</h4>
                <ul>
                  ${notes
                    .map(
                      (note) =>
                        `<li><strong>Page ${note.page}:</strong> ${escapeHtml(
                          note.text || ""
                        )}</li>`
                    )
                    .join("")}
                </ul>
              `
              : ""
          }

          ${
            highlights.length
              ? `
                <h4>Highlights</h4>
                <ul>
                  ${highlights
                    .map(
                      (highlight) =>
                        `<li>Highlighted area on page ${highlight.page}</li>`
                    )
                    .join("")}
                </ul>
              `
              : ""
          }
        </section>
      `;
    })
    .join("");

  const flashcards = data.flashcards
    .map(
      (card, index) => `
        <article class="flashcard">
          <h3>Q${index + 1}. ${escapeHtml(
            card.front || "Image-based question"
          )}</h3>

          ${
            card.frontImage && getImageSrc(card.frontImage)
              ? `<figure class="revision-image"><img src="${escapeHtml(getImageSrc(card.frontImage))}" alt="Flashcard question image ${index + 1}"><figcaption>Image-based flashcard question</figcaption></figure>`
              : ""
          }

          <p>
            <strong>Answer:</strong><br>
            ${escapeHtml(card.back)}
          </p>

          ${
            card.topic
              ? `<p><strong>Topic:</strong> ${escapeHtml(card.topic)}</p>`
              : ""
          }
        </article>
      `
    )
    .join("");

  const errors = data.errorLogs
    .map(
      (error, index) => `
        <article class="error-log">
          <h3>
            Mistake ${index + 1}
            ${error.topic ? `— ${escapeHtml(error.topic)}` : ""}
          </h3>

          ${
            error.question
              ? `<p><strong>Question:</strong><br>${escapeHtml(
                  error.question
                )}</p>`
              : ""
          }

          ${
            error.reason
              ? `<p><strong>Reason:</strong><br>${escapeHtml(
                  error.reason
                )}</p>`
              : ""
          }

          ${
            error.myAnswer
              ? `<p><strong>My Answer:</strong><br>${escapeHtml(
                  error.myAnswer
                )}</p>`
              : ""
          }

          ${
            error.correctAnswer
              ? `<p><strong>Correct Answer:</strong><br>${escapeHtml(
                  error.correctAnswer
                )}</p>`
              : ""
          }

          ${
            error.whatWentWrong
              ? `<p><strong>What Went Wrong:</strong><br>${escapeHtml(
                  error.whatWentWrong
                )}</p>`
              : ""
          }

          ${
            error.solution
              ? `<p><strong>Solution:</strong><br>${escapeHtml(
                  error.solution
                )}</p>`
              : ""
          }

          ${
            error.correctConcept
              ? `<p><strong>Correct Concept:</strong><br>${escapeHtml(
                  error.correctConcept
                )}</p>`
              : ""
          }

          ${
            (error.images || [])
              .map((image: any, imageIndex: number) => {
                const src = getErrorImageSrc(image);
                return src
                  ? `<figure class="revision-image"><img src="${escapeHtml(src)}" alt="Error screenshot ${imageIndex + 1}"><figcaption>${escapeHtml(image?.name || `Screenshot ${imageIndex + 1}`)}</figcaption></figure>`
                  : "";
              })
              .join("")
          }

          <p>
            <strong>Status:</strong>
            ${error.mastered ? "Mastered" : "Needs Revision"}
          </p>
        </article>
      `
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
body {
  font-family: Arial, Helvetica, sans-serif;
  max-width: 900px;
  margin: 40px auto;
  padding: 0 30px;
  color: #111827;
  line-height: 1.6;
}

h1 {
  font-size: 28px;
  border-bottom: 2px solid #111827;
  padding-bottom: 12px;
}

h2 {
  margin-top: 35px;
  border-bottom: 1px solid #d1d5db;
  padding-bottom: 6px;
}

h3 {
  margin-top: 24px;
}

section,
.flashcard,
.error-log {
  page-break-inside: avoid;
  margin-bottom: 22px;
}

.flashcard,
.error-log {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 16px;
}

.summary {
  background: #f3f4f6;
  padding: 16px;
  border-radius: 8px;
}

.revision-image {
  margin: 14px 0;
  padding: 8px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #f9fafb;
  text-align: center;
}

.revision-image img {
  display: block;
  width: 100%;
  max-height: 560px;
  object-fit: contain;
  margin: 0 auto;
}

.revision-image figcaption {
  margin-top: 6px;
  font-size: 12px;
  color: #6b7280;
}

@media print {
  body {
    max-width: none;
    margin: 0;
    padding: 0;
  }

  .flashcard,
  .error-log,
  section {
    break-inside: avoid;
  }

  @page {
    margin: 16mm;
  }
}
</style>
</head>

<body>

<h1>${title}</h1>

<p>
Generated: ${escapeHtml(new Date().toLocaleString())}
</p>

<div class="summary">
<strong>Revision Summary</strong>
<ul>
<li>PDFs: ${data.summary.pdfs}</li>
<li>Written Notes: ${data.summary.writtenNotes}</li>
<li>Highlights: ${data.summary.highlights}</li>
<li>Flashcards: ${data.summary.flashcards}</li>
<li>Error Logs: ${data.summary.errorLogs}</li>
<li>Pending Errors: ${data.summary.pendingErrors}</li>
</ul>
</div>

<h2>1. Key Concepts & Annotations</h2>

${
  noteSections ||
  "<p>No PDF annotations found.</p>"
}

<h2>2. Important Flashcards</h2>

${
  flashcards ||
  "<p>No flashcards found.</p>"
}

<h2>3. Mistakes & Error Logs</h2>

${
  errors ||
  "<p>No error logs found.</p>"
}

</body>
</html>`;
}

function downloadFile(
  content: string,
  filename: string,
  mimeType: string
) {
  const blob = new Blob([content], {
    type: `${mimeType};charset=utf-8`,
  });

  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

export default function OneShotRevisionPage() {
  const [scope, setScope] = useState<Scope>("all");
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");

  const [subjects, setSubjects] = useState<string[]>([]);
  const [chapters, setChapters] = useState<FilterChapter[]>([]);

  const [data, setData] = useState<RevisionData | null>(null);

  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingRevision, setLoadingRevision] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadFilters() {
      try {
        setLoadingFilters(true);

        const response = await fetch(
          "/api/one-shot-revision?mode=filters",
          {
            cache: "no-store",
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to load filters");
        }

        setSubjects(result.subjects || []);
        setChapters(result.chapters || []);
      } catch (err: any) {
        setError(err.message || "Failed to load filters");
      } finally {
        setLoadingFilters(false);
      }
    }

    loadFilters();
  }, []);

  const availableChapters = useMemo(() => {
    if (!subject) return [];

    return chapters
      .filter(
        (item) =>
          item.subject.toLowerCase() === subject.toLowerCase()
      )
      .map((item) => item.value)
      .filter(
        (value, index, array) =>
          array.findIndex(
            (x) => x.toLowerCase() === value.toLowerCase()
          ) === index
      );
  }, [chapters, subject]);

  async function generateRevision() {
    try {
      setError("");
      setLoadingRevision(true);

      const params = new URLSearchParams();

      params.set("scope", scope);

      if (scope === "subject" || scope === "chapter") {
        params.set("subject", subject);
      }

      if (scope === "chapter") {
        params.set("chapter", chapter);
      }

      const response = await fetch(
        `/api/one-shot-revision?${params.toString()}`,
        {
          cache: "no-store",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Failed to generate revision"
        );
      }

      setData(result);
    } catch (err: any) {
      setData(null);
      setError(err.message || "Failed to generate revision");
    } finally {
      setLoadingRevision(false);
    }
  }

  async function printRevision() {
    if (!data) return;

    document.body.classList.add("one-shot-printing");
    await waitForRevisionImages();

    setTimeout(() => {
      window.print();

      setTimeout(() => {
        document.body.classList.remove("one-shot-printing");
      }, 700);
    }, 150);
  }

  async function downloadMarkdown() {
    if (!data) return;

    const exportData = await prepareExportData(data);
    const markdown = buildMarkdown(exportData);

    downloadFile(
      markdown,
      `GATE-One-Shot-Revision-${Date.now()}.md`,
      "text/markdown"
    );
  }

  async function downloadHtml() {
    if (!data) return;

    const exportData = await prepareExportData(data);
    const html = buildHtml(exportData);

    downloadFile(
      html,
      `GATE-One-Shot-Revision-${Date.now()}.html`,
      "text/html"
    );
  }

  function handleScopeChange(value: Scope) {
    setScope(value);
    setData(null);
    setError("");

    if (value === "all") {
      setSubject("");
      setChapter("");
    }

    if (value === "subject") {
      setChapter("");
    }
  }

  const title = getRevisionTitle(data);

  return (
    <main className="one-shot-revision-page min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="one-shot-revision-print-root mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">

        {/* -------------------------------------------------- */}
        {/* HEADER */}
        {/* -------------------------------------------------- */}

        <div className="no-print mb-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="mb-1 text-sm font-medium text-blue-600 dark:text-blue-400">
                GATE 2027
              </p>

              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                One-Shot Revision
              </h1>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Combine annotations, flashcards and error logs into one revision sheet.
              </p>
            </div>

            {data && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={printRevision}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Export PDF
                </button>

                <button
                  onClick={downloadMarkdown}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Export Markdown
                </button>

                <button
                  onClick={downloadHtml}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Export HTML
                </button>
              </div>
            )}
          </div>
        </div>

        {/* -------------------------------------------------- */}
        {/* FILTERS */}
        {/* -------------------------------------------------- */}

        <div className="no-print mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">

          <div className="grid gap-4 md:grid-cols-3">

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Revision Scope
              </label>

              <select
                value={scope}
                onChange={(e) =>
                  handleScopeChange(e.target.value as Scope)
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="all">
                  Complete Syllabus
                </option>

                <option value="subject">
                  Specific Subject
                </option>

                <option value="chapter">
                  Specific Chapter / Topic
                </option>
              </select>
            </div>

            {scope !== "all" && (
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Subject
                </label>

                <select
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    setChapter("");
                    setData(null);
                  }}
                  disabled={loadingFilters}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">
                    Select Subject
                  </option>

                  {subjects.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {scope === "chapter" && (
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Chapter / Topic
                </label>

                <select
                  value={chapter}
                  onChange={(e) => {
                    setChapter(e.target.value);
                    setData(null);
                  }}
                  disabled={!subject}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">
                    Select Chapter / Topic
                  </option>

                  {availableChapters.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between gap-4">

            <div className="text-sm text-slate-500 dark:text-slate-400">
              {scope === "all" &&
                "All subjects, chapters, flashcards and error logs will be included."}

              {scope === "subject" &&
                (subject
                  ? `Generating revision for ${subject}.`
                  : "Select a subject.")}

              {scope === "chapter" &&
                (subject && chapter
                  ? `${subject} → ${chapter}`
                  : "Select subject and chapter.")}
            </div>

            <button
              onClick={generateRevision}
              disabled={
                loadingRevision ||
                (scope !== "all" && !subject) ||
                (scope === "chapter" && !chapter)
              }
              className="shrink-0 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {loadingRevision
                ? "Generating..."
                : "Generate Revision"}
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* -------------------------------------------------- */}
        {/* REVISION DOCUMENT */}
        {/* -------------------------------------------------- */}

        {data && (
          <article className="one-shot-document rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">

            {/* Document Header */}

            <header className="border-b border-slate-200 pb-6 dark:border-slate-700">

              <p className="text-sm font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                GATE 2027
              </p>

              <h2 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                {title}
              </h2>

              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                One-Shot Revision Sheet
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">

                <SummaryBox
                  label="PDFs"
                  value={data.summary.pdfs}
                />

                <SummaryBox
                  label="Notes"
                  value={data.summary.writtenNotes}
                />

                <SummaryBox
                  label="Highlights"
                  value={data.summary.highlights}
                />

                <SummaryBox
                  label="Flashcards"
                  value={data.summary.flashcards}
                />

                <SummaryBox
                  label="Errors"
                  value={data.summary.errorLogs}
                />

                <SummaryBox
                  label="Pending"
                  value={data.summary.pendingErrors}
                />

                <SummaryBox
                  label="Mastered"
                  value={data.summary.masteredErrors}
                />

              </div>
            </header>

            {/* ------------------------------------------------ */}
            {/* SECTION 1 */}
            {/* ------------------------------------------------ */}

            <section className="revision-section mt-8">

              <SectionHeading
                number="01"
                title="Key Concepts & Annotations"
                description="Your saved PDF notes and annotation activity."
              />

              {data.documents.length === 0 ? (
                <EmptyState text="No PDF annotations found for this selection." />
              ) : (
                <div className="mt-5 space-y-5">

                  {data.documents.map((document) => {

                    const notes = document.annotations.filter(
                      (annotation) =>
                        annotation.type === "text" &&
                        annotation.text
                    );

                    const highlights =
                      document.annotations.filter(
                        (annotation) =>
                          annotation.type === "highlight"
                      );

                    const rectangles =
                      document.annotations.filter(
                        (annotation) =>
                          annotation.type === "rect"
                      );

                    if (
                      notes.length === 0 &&
                      highlights.length === 0 &&
                      rectangles.length === 0
                    ) {
                      return null;
                    }

                    return (
                      <div
                        key={document.id}
                        className="rounded-xl border border-slate-200 p-5 dark:border-slate-700"
                      >

                        <h3 className="font-bold text-slate-900 dark:text-white">
                          {document.title}
                        </h3>

                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {document.subject}
                          {document.chapter
                            ? ` → ${document.chapter}`
                            : ""}
                        </p>

                        {notes.length > 0 && (
                          <div className="mt-5">

                            <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                              Written Notes
                            </h4>

                            <div className="space-y-3">
                              {notes.map((note, index) => (
                                <div
                                  key={`${document.id}-note-${index}`}
                                  className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/60"
                                >
                                  <div className="mb-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                                    Page {note.page}
                                  </div>

                                  <p className="whitespace-pre-wrap text-sm leading-6">
                                    {note.text}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {highlights.length > 0 && (
                          <div className="mt-5">

                            <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                              Highlights
                            </h4>

                            <div className="flex flex-wrap gap-2">
                              {highlights.map((highlight, index) => (
                                <span
                                  key={`${document.id}-highlight-${index}`}
                                  className="rounded-full border border-yellow-300 bg-yellow-50 px-3 py-1 text-xs font-medium text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300"
                                >
                                  Highlight · Page {highlight.page}
                                </span>
                              ))}
                            </div>

                            <p className="mt-2 text-xs text-slate-500">
                              Highlighted PDF text is not stored as text in the current annotation database; only its drawing coordinates are stored.
                            </p>
                          </div>
                        )}

                        {rectangles.length > 0 && (
                          <div className="mt-5">

                            <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                              Marked Areas
                            </h4>

                            <div className="flex flex-wrap gap-2">
                              {rectangles.map((rectangle, index) => (
                                <span
                                  key={`${document.id}-rect-${index}`}
                                  className="rounded-full border border-slate-300 px-3 py-1 text-xs dark:border-slate-600"
                                >
                                  Marked Area · Page {rectangle.page}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>
                    );
                  })}

                </div>
              )}
            </section>

            {/* ------------------------------------------------ */}
            {/* SECTION 2 */}
            {/* ------------------------------------------------ */}

            <section className="revision-section mt-10">

              <SectionHeading
                number="02"
                title="Important Flashcards Q&A"
                description="Questions and answers saved for active recall."
              />

              {data.flashcards.length === 0 ? (
                <EmptyState text="No flashcards found for this selection." />
              ) : (
                <div className="mt-5 space-y-4">

                  {data.flashcards.map((card, index) => (
                    <div
                      key={card.id}
                      className="flashcard-item rounded-xl border border-slate-200 p-5 dark:border-slate-700"
                    >

                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                          Q{index + 1}
                        </span>

                        {card.topic && (
                          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {card.topic}
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-bold leading-6 text-slate-900 dark:text-white">
                        {card.front || "Image-based question"}
                      </h3>

                      {card.frontImage && (() => {
                        const src = getImageSrc(card.frontImage);
                        return src ? (
                          <figure className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/40">
                            <img
                              src={src}
                              alt={`Flashcard question image ${index + 1}`}
                              className="max-h-[520px] w-full rounded-lg object-contain"
                              loading="lazy"
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                            />
                            <figcaption className="mt-2 text-xs text-slate-500">
                              Image-based flashcard question
                            </figcaption>
                          </figure>
                        ) : null;
                      })()}

                      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-green-600 dark:text-green-400">
                          Answer
                        </p>

                        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">
                          {card.back}
                        </p>
                      </div>

                    </div>
                  ))}

                </div>
              )}
            </section>

            {/* ------------------------------------------------ */}
            {/* SECTION 3 */}
            {/* ------------------------------------------------ */}

            <section className="revision-section mt-10">

              <SectionHeading
                number="03"
                title="Mistakes & Error Log Summary"
                description="Mistakes, corrections and revision status."
              />

              {data.errorLogs.length === 0 ? (
                <EmptyState text="No error logs found for this selection." />
              ) : (
                <div className="mt-5 space-y-5">

                  {data.errorLogs.map((error, index) => (
                    <div
                      key={error.id}
                      className="error-log-item rounded-xl border border-slate-200 p-5 dark:border-slate-700"
                    >

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">

                        <div>
                          <div className="mb-2 flex flex-wrap gap-2">
                            <span className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                              Mistake {index + 1}
                            </span>

                            {error.topic && (
                              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {error.topic}
                              </span>
                            )}
                          </div>

                          {error.question && (
                            <h3 className="text-base font-bold leading-6">
                              {error.question}
                            </h3>
                          )}
                        </div>

                        <span
                          className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                            error.mastered
                              ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                              : "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300"
                          }`}
                        >
                          {error.mastered
                            ? "Mastered"
                            : "Needs Revision"}
                        </span>

                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">

                        {error.reason && (
                          <InfoBlock
                            label="Reason"
                            value={error.reason}
                          />
                        )}

                        {error.myAnswer && (
                          <InfoBlock
                            label="My Answer"
                            value={error.myAnswer}
                          />
                        )}

                        {error.correctAnswer && (
                          <InfoBlock
                            label="Correct Answer"
                            value={error.correctAnswer}
                            emphasis="success"
                          />
                        )}

                        {error.whatWentWrong && (
                          <InfoBlock
                            label="What Went Wrong"
                            value={error.whatWentWrong}
                          />
                        )}

                        {error.solution && (
                          <InfoBlock
                            label="Solution"
                            value={error.solution}
                            emphasis="success"
                          />
                        )}

                        {error.correctConcept && (
                          <InfoBlock
                            label="Correct Concept"
                            value={error.correctConcept}
                            emphasis="success"
                          />
                        )}

                      </div>

                      {error.images?.length > 0 && (
                        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
                          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                            Screenshots / Snippets
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            {error.images.map((image: any, imageIndex: number) => {
                              const src = getErrorImageSrc(image);
                              if (!src) return null;

                              return (
                                <figure
                                  key={`${error.id}-image-${imageIndex}`}
                                  className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/40"
                                >
                                  <img
                                    src={src}
                                    alt={`Error screenshot ${imageIndex + 1}`}
                                    className="max-h-[520px] w-full rounded-lg object-contain"
                                    loading="lazy"
                                    onError={(event) => {
                                      event.currentTarget.style.display = "none";
                                    }}
                                  />
                                  {image?.name && (
                                    <figcaption className="mt-2 truncate px-1 text-xs text-slate-500">
                                      {image.name}
                                    </figcaption>
                                  )}
                                </figure>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {error.reviewCount > 0 && (
                        <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700">
                          Reviewed {error.reviewCount} time
                          {error.reviewCount === 1 ? "" : "s"}
                          {error.lastReviewed
                            ? ` · Last reviewed ${error.lastReviewed}`
                            : ""}
                        </div>
                      )}

                    </div>
                  ))}

                </div>
              )}
            </section>

            {/* Footer */}

            <footer className="mt-10 border-t border-slate-200 pt-5 text-center text-xs text-slate-400 dark:border-slate-700">
              GATE 2027 Dashboard · One-Shot Revision
            </footer>

          </article>
        )}

        {!data && !loadingRevision && (
          <div className="no-print rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-bold">
              Generate your One-Shot Revision
            </h2>

            <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500 dark:text-slate-400">
              Select the complete syllabus, a subject, or a specific chapter and combine your saved notes, flashcards and mistakes into one revision sheet.
            </p>
          </div>
        )}

      </div>
    </main>
  );
}

function SummaryBox({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">
        {label}
      </div>
    </div>
  );
}

function SectionHeading({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="border-l-4 border-blue-600 pl-4">
      <div className="text-xs font-bold tracking-widest text-blue-600 dark:text-blue-400">
        {number}
      </div>

      <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
        {title}
      </h2>

      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}

function InfoBlock({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: "success";
}) {
  return (
    <div
      className={`rounded-lg p-4 ${
        emphasis === "success"
          ? "bg-green-50 dark:bg-green-950/20"
          : "bg-slate-50 dark:bg-slate-800/60"
      }`}
    >
      <div
        className={`mb-1 text-xs font-bold uppercase tracking-wide ${
          emphasis === "success"
            ? "text-green-700 dark:text-green-400"
            : "text-slate-500 dark:text-slate-400"
        }`}
      >
        {label}
      </div>

      <p className="whitespace-pre-wrap text-sm leading-6">
        {value}
      </p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {text}
    </div>
  );
}