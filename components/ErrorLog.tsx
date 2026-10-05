"use client";

import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import Link from "next/link";
import { GATE_SYLLABUS } from "@/lib/syllabus";

const REASON_OPTIONS = [
  "Conceptual gap",
  "Silly mistake",
  "Misread question",
  "Time pressure",
  "Formula error",
  "Not revised recently",
];

type ImageAttachment = {
  id: string;
  name: string;
  dataUrl: string;
};

type ErrorLogForm = {
  log_date: string;
  subject: string;
  topic: string;
  question: string;
  reason: string;
  images: ImageAttachment[];
  source_url: string;
  my_answer: string;
  correct_answer: string;
  what_went_wrong: string;
  solution: string;
};

function todayLocal() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function readApiError(res: Response) {
  try {
    const data = await res.json();
    return data?.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

const EMPTY_FORM = (): ErrorLogForm => ({
  log_date: todayLocal(),
  subject: "",
  topic: "",
  question: "",
  reason: REASON_OPTIONS[0],
  images: [],
  source_url: "",
  my_answer: "",
  correct_answer: "",
  what_went_wrong: "",
  solution: "",
});

function makeImageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fileToDataUrl(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve({
        id: makeImageId(),
        name: file.name || "pasted-image.png",
        dataUrl: String(reader.result),
      });
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function normalizeImages(value: unknown): ImageAttachment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item: any) => {
      if (typeof item === "string") {
        return {
          id: makeImageId(),
          name: "image",
          dataUrl: item,
        };
      }

      if (item && typeof item.dataUrl === "string") {
        return {
          id: String(item.id || makeImageId()),
          name: String(item.name || "image"),
          dataUrl: item.dataUrl,
        };
      }

      return null;
    })
    .filter(Boolean) as ImageAttachment[];
}

export default function ErrorLog() {
  const [entries, setEntries] = useState<any[]>([]);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const [isEditMode, setIsEditMode] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const [form, setForm] = useState<ErrorLogForm>(EMPTY_FORM);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<ErrorLogForm>(EMPTY_FORM);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageError, setImageError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [editError, setEditError] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/error-logs");
      const data = await res.json();

      if (Array.isArray(data)) {
        setEntries(data);
        setLoadError("");
      } else {
        setEntries([]);
        setLoadError(data?.error || "Could not load error logs.");
      }
    } catch (e) {
      console.error("Failed to load error logs from SQLite", e);
      setLoadError("Could not load error logs.");
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const availableFormTopics = useMemo(() => {
    if (!form.subject) return [];
    const found = GATE_SYLLABUS.find((s) => s.subject === form.subject);
    return found ? found.topics : [];
  }, [form.subject]);

  const availableFilterTopics = useMemo(() => {
    if (!subjectFilter) return [];
    const found = GATE_SYLLABUS.find((s) => s.subject === subjectFilter);
    return found ? found.topics : [];
  }, [subjectFilter]);

  const availableEditTopics = useMemo(() => {
    if (!editForm.subject) return [];
    const found = GATE_SYLLABUS.find((s) => s.subject === editForm.subject);
    return found ? found.topics : [];
  }, [editForm.subject]);

  const addImagesToForm = useCallback(
    async (
      files: FileList | File[],
      target: "new" | "edit" = "new",
    ) => {
      const imageFiles = Array.from(files).filter((file) =>
        file.type.startsWith("image/"),
      );

      if (imageFiles.length === 0) {
        setImageError("Please paste, drop, or select image files only.");
        return;
      }

      setImageError("");

      try {
        const newImages = await Promise.all(imageFiles.map(fileToDataUrl));

        if (target === "new") {
          setForm((prev) => ({
            ...prev,
            images: [...prev.images, ...newImages],
          }));
        } else {
          setEditForm((prev) => ({
            ...prev,
            images: [...prev.images, ...newImages],
          }));
        }
      } catch (error) {
        console.error("Failed to read image", error);
        setImageError("Could not read one or more images.");
      }
    },
    [],
  );

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));

    if (imageItems.length === 0) return;

    e.preventDefault();

    const files = imageItems
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];

    addImagesToForm(files, "new");
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files?.length) {
      addImagesToForm(e.dataTransfer.files, "new");
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      addImagesToForm(e.target.files, "new");
      e.target.value = "";
    }
  }

  function removeImage(id: string, target: "new" | "edit" = "new") {
    if (target === "new") {
      setForm((prev) => ({
        ...prev,
        images: prev.images.filter((image) => image.id !== id),
      }));
    } else {
      setEditForm((prev) => ({
        ...prev,
        images: prev.images.filter((image) => image.id !== id),
      }));
    }
  }

  async function addEntry() {
    if (!form.subject.trim()) return;

    const newItem = {
      id: Date.now().toString(),
      ...form,
    };

    setIsSaving(true);
    setSaveError("");

    try {
      const res = await fetch("/api/error-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newItem),
      });

      if (res.ok) {
        await loadEntries();
        setForm(EMPTY_FORM());
        setImageError("");
      } else {
        const msg = await readApiError(res);
        console.error("Failed to save error log:", msg);
        setSaveError(msg);
      }
    } catch (e) {
      console.error("Failed to save error log", e);
      setSaveError("Network error while saving. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSingle(id: string) {
    if (!window.confirm("Ye error entry delete karni hai?")) return;

    try {
      const res = await fetch(`/api/error-logs?id=${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await loadEntries();
        setDeletingId(null);
        setSelectedIds((prev) => prev.filter((item) => item !== id));
      }
    } catch (e) {
      console.error("Failed to delete error log", e);
    }
  }

  async function deleteSelected() {
    if (!window.confirm("Kya aap selected error entries delete karna chahte hain?")) return;
    if (selectedIds.length === 0) return;

    try {
      await Promise.all(
        selectedIds.map((id) =>
          fetch(`/api/error-logs?id=${id}`, { method: "DELETE" }),
        ),
      );

      await loadEntries();
      setSelectedIds([]);
      setShowBulkConfirm(false);
    } catch (e) {
      console.error("Failed to delete selected logs", e);
    }
  }

  function openEditModal(entry: any) {
    setEditingEntry(entry);
    setEditError("");

    setEditForm({
      log_date: entry.log_date || "",
      subject: entry.subject || "",
      topic: entry.topic || "",
      question: entry.question || "",
      reason: entry.reason || REASON_OPTIONS[0],
      images: normalizeImages(entry.images),
      source_url: entry.source_url || "",
      my_answer: entry.my_answer || "",
      correct_answer: entry.correct_answer || "",
      what_went_wrong: entry.what_went_wrong || "",
      solution: entry.solution || "",
    });
  }

  async function saveEditedEntry() {
    if (!editingEntry || !editForm.subject.trim()) return;

    const updated = {
      id: editingEntry.id,
      ...editForm,
    };

    setIsUpdating(true);
    setEditError("");

    try {
      const res = await fetch("/api/error-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });

      if (res.ok) {
        await loadEntries();
        setEditingEntry(null);
      } else {
        const msg = await readApiError(res);
        console.error("Failed to update error log:", msg);
        setEditError(msg);
      }
    } catch (e) {
      console.error("Failed to update error log", e);
      setEditError("Network error while saving. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  }

  const filtered = entries.filter((e) => {
    if (subjectFilter && e.subject !== subjectFilter) return false;
    if (topicFilter && e.topic !== topicFilter) return false;
    if (dateFilter && e.log_date !== dateFilter) return false;
    return true;
  });

  const allFilteredSelected =
    filtered.length > 0 &&
    filtered.every((e) => selectedIds.includes(String(e.id)));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filtered.map((e) => String(e.id)));
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.has(id)));
    } else {
      const newIds = Array.from(
        new Set([
          ...selectedIds,
          ...filtered.map((e) => String(e.id)),
        ]),
      );
      setSelectedIds(newIds);
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id],
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* New Error Log */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <h3 className="font-semibold mb-4 text-slate-800 dark:text-slate-100">
          Log a New Mistake (SQLite Synced)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Date
            </label>
            <input
              type="date"
              className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
              value={form.log_date}
              onChange={(e) =>
                setForm({ ...form, log_date: e.target.value })
              }
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Subject
            </label>
            <select
              className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
              value={form.subject}
              onChange={(e) =>
                setForm({
                  ...form,
                  subject: e.target.value,
                  topic: "",
                })
              }
            >
              <option value="">-- Select Subject --</option>
              {GATE_SYLLABUS.map((s) => (
                <option key={s.subject} value={s.subject}>
                  {s.subject}
                </option>
              ))}
            </select>
          </div>

          {/* Topic */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Chapter / Topic
            </label>
            <select
              className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:bg-slate-100"
              value={form.topic}
              disabled={!form.subject}
              onChange={(e) =>
                setForm({ ...form, topic: e.target.value })
              }
            >
              <option value="">
                {form.subject
                  ? "-- Select Chapter/Topic --"
                  : "Select Subject First"}
              </option>
              {availableFormTopics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Reason for Mistake
            </label>
            <select
              className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
              value={form.reason}
              onChange={(e) =>
                setForm({ ...form, reason: e.target.value })
              }
            >
              {REASON_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Question text */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Question
            </label>
            <textarea
              placeholder="Paste the question text here. Normal Ctrl+V works."
              className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
              rows={4}
              value={form.question}
              onChange={(e) =>
                setForm({ ...form, question: e.target.value })
              }
            />
          </div>

          {/* Image uploader */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Question Images
            </label>

            <div
              tabIndex={0}
              onPaste={handlePaste}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors outline-none ${
                isDragging
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                  : "border-slate-300 dark:border-slate-700 hover:border-indigo-400"
              }`}
            >
              <div className="text-2xl mb-2">📋</div>

              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Paste screenshot with Ctrl + V
              </p>

              <p className="text-xs text-slate-400 my-1">or</p>

              <p className="text-sm text-slate-500 dark:text-slate-400">
                Drag & Drop images here
              </p>

              <p className="text-xs text-slate-400 my-2">or</p>

              <label className="inline-flex items-center px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700">
                📁 Browse Images
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </label>

              <p className="text-[11px] text-slate-400 mt-3">
                You can add multiple images to the same question.
              </p>
            </div>

            {imageError && (
              <p className="text-xs text-red-600 mt-2">{imageError}</p>
            )}

            {form.images.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-slate-500 mb-2">
                  Attached Images ({form.images.length})
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {form.images.map((image) => (
                    <div
                      key={image.id}
                      className="relative group rounded-lg border dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-950"
                    >
                      <img
                        src={image.dataUrl}
                        alt={image.name}
                        className="w-full h-32 object-contain"
                      />

                      <button
                        type="button"
                        onClick={() => removeImage(image.id)}
                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-red-600 text-white text-xs opacity-90 hover:opacity-100"
                        title="Remove image"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Source link */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Source / Reference Link
            </label>
            <input
              type="url"
              placeholder="https://..."
              className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
              value={form.source_url}
              onChange={(e) =>
                setForm({ ...form, source_url: e.target.value })
              }
            />
          </div>

          {/* My answer */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              My Answer
            </label>
            <input
              type="text"
              placeholder="What did you answer?"
              className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
              value={form.my_answer}
              onChange={(e) =>
                setForm({ ...form, my_answer: e.target.value })
              }
            />
          </div>

          {/* Correct answer */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Correct Answer
            </label>
            <input
              type="text"
              placeholder="Correct answer"
              className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
              value={form.correct_answer}
              onChange={(e) =>
                setForm({
                  ...form,
                  correct_answer: e.target.value,
                })
              }
            />
          </div>

          {/* What went wrong */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              What Went Wrong
            </label>
            <textarea
              placeholder="Explain why you got this question wrong..."
              className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
              rows={3}
              value={form.what_went_wrong}
              onChange={(e) =>
                setForm({
                  ...form,
                  what_went_wrong: e.target.value,
                })
              }
            />
          </div>

          {/* Solution */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Solution / Explanation
            </label>
            <textarea
              placeholder="Add the correct solution or explanation..."
              className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
              rows={3}
              value={form.solution}
              onChange={(e) =>
                setForm({ ...form, solution: e.target.value })
              }
            />
          </div>
        </div>

        <button
          onClick={addEntry}
          disabled={!form.subject || isSaving}
          className="mt-4 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-opacity cursor-pointer"
        >
          {isSaving ? "Saving..." : "Save Entry"}
        </button>

        {saveError && (
          <p className="text-xs text-red-600 mt-2">
            Could not save: {saveError}
          </p>
        )}
      </div>

      {/* Listing & Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b dark:border-slate-800 pb-3">
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">
              Recorded Mistakes
            </h3>
            <p className="text-xs text-slate-400">
              Filter or manage your SQLite error logs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/error-log/review"
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-colors"
            >
              🎯 Review Mode
            </Link>

            {isEditMode && selectedIds.length > 0 && (
              <>
                {!showBulkConfirm ? (
                  <button
                    onClick={() => setShowBulkConfirm(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                  >
                    Delete Selected ({selectedIds.length})
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 bg-red-50 p-1 rounded-lg border border-red-200">
                    <button
                      onClick={deleteSelected}
                      className="px-2.5 py-1 text-xs bg-red-600 text-white rounded-md font-medium"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setShowBulkConfirm(false)}
                      className="px-2.5 py-1 text-xs bg-white text-gray-700 rounded-md border"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </>
            )}

            <button
              onClick={() => {
                setIsEditMode(!isEditMode);
                setDeletingId(null);
                setShowBulkConfirm(false);
                if (isEditMode) setSelectedIds([]);
              }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                isEditMode
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              }`}
            >
              {isEditMode ? "Done" : "Edit Logs"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <select
            className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none"
            value={subjectFilter}
            onChange={(e) => {
              setSubjectFilter(e.target.value);
              setTopicFilter("");
            }}
          >
            <option value="">All Subjects</option>
            {GATE_SYLLABUS.map((s) => (
              <option key={s.subject} value={s.subject}>
                {s.subject}
              </option>
            ))}
          </select>

          <select
            className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none disabled:bg-slate-100"
            value={topicFilter}
            disabled={!subjectFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
          >
            <option value="">
              {subjectFilter
                ? "All Chapters / Topics"
                : "Select Subject First"}
            </option>
            {availableFilterTopics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <input
            type="date"
            className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />
        </div>

        {loadError && (
          <p className="text-xs text-red-600 mb-3">{loadError}</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b dark:border-slate-800 text-slate-500 bg-slate-50 dark:bg-slate-950/50">
                {isEditMode && (
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 cursor-pointer"
                    />
                  </th>
                )}
                <th className="p-3">Date</th>
                <th className="p-3">Subject</th>
                <th className="p-3">Chapter / Topic</th>
                <th className="p-3">Reason</th>
                <th className="p-3">Question</th>
                <th className="p-3">Images</th>
                {isEditMode && <th className="p-3 text-right">Actions</th>}
              </tr>
            </thead>

            <tbody>
              {filtered.map((e) => {
                const images = normalizeImages(e.images);

                return (
                  <tr
                    key={e.id}
                    className="border-b dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/50"
                  >
                    {isEditMode && (
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(String(e.id))}
                          onChange={() =>
                            toggleSelectRow(String(e.id))
                          }
                          className="rounded border-slate-300 cursor-pointer"
                        />
                      </td>
                    )}

                    <td className="p-3 whitespace-nowrap text-slate-500">
                      {e.log_date}
                    </td>

                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                      {e.subject}
                    </td>

                    <td className="p-3 text-indigo-600 dark:text-indigo-400">
                      {e.topic || "—"}
                    </td>

                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-100">
                        {e.reason}
                      </span>
                    </td>

                    <td className="p-3 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                      {e.question || e.what_went_wrong || "—"}
                    </td>

                    <td className="p-3 text-slate-500">
                      {images.length > 0 ? `🖼 ${images.length}` : "—"}
                    </td>

                    {isEditMode && (
                      <td className="p-3 text-right">
                        {deletingId === String(e.id) ? (
                          <div className="inline-flex items-center gap-1.5 bg-red-50 p-1 rounded-lg border border-red-200">
                            <button
                              onClick={() => deleteSingle(String(e.id))}
                              className="px-2.5 py-1 text-xs bg-red-600 text-white rounded-md font-medium"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="px-2.5 py-1 text-xs bg-white text-gray-700 rounded-md border"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => openEditModal(e)}
                              className="text-xs px-2.5 py-1 text-slate-600 dark:text-slate-300 border dark:border-slate-700 rounded-md hover:bg-white"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() =>
                                setDeletingId(String(e.id))
                              }
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 hover:bg-red-200 font-bold"
                            >
                              &minus;
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={isEditMode ? 8 : 6}
                    className="p-6 text-center text-slate-400"
                  >
                    No mistakes logged for this selection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingEntry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4 shadow-xl">
            <h4 className="font-semibold text-slate-800 dark:text-white">
              Edit Mistake Entry
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">
                  Date
                </label>
                <input
                  type="date"
                  className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none"
                  value={editForm.log_date}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      log_date: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">
                  Subject
                </label>
                <select
                  className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none"
                  value={editForm.subject}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      subject: e.target.value,
                      topic: "",
                    })
                  }
                >
                  <option value="">-- Select Subject --</option>
                  {GATE_SYLLABUS.map((s) => (
                    <option key={s.subject} value={s.subject}>
                      {s.subject}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">
                  Chapter / Topic
                </label>
                <select
                  className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none"
                  value={editForm.topic}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      topic: e.target.value,
                    })
                  }
                >
                  <option value="">-- Select Chapter/Topic --</option>
                  {availableEditTopics.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">
                  Reason
                </label>
                <select
                  className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none"
                  value={editForm.reason}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      reason: e.target.value,
                    })
                  }
                >
                  {REASON_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-500 block mb-1">
                  Question
                </label>
                <textarea
                  className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none"
                  rows={4}
                  value={editForm.question}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      question: e.target.value,
                    })
                  }
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-500 block mb-1">
                  Source / Reference Link
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none"
                  value={editForm.source_url}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      source_url: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">
                  My Answer
                </label>
                <input
                  type="text"
                  className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none"
                  value={editForm.my_answer}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      my_answer: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">
                  Correct Answer
                </label>
                <input
                  type="text"
                  className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none"
                  value={editForm.correct_answer}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      correct_answer: e.target.value,
                    })
                  }
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-500 block mb-1">
                  What Went Wrong
                </label>
                <textarea
                  className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none"
                  rows={3}
                  value={editForm.what_went_wrong}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      what_went_wrong: e.target.value,
                    })
                  }
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-500 block mb-1">
                  Solution / Explanation
                </label>
                <textarea
                  className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none"
                  rows={3}
                  value={editForm.solution}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      solution: e.target.value,
                    })
                  }
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-500 block mb-1">
                  Question Images
                </label>

                <div
                  onPaste={(e) => {
                    const items = Array.from(e.clipboardData.items);
                    const files = items
                      .filter((item) =>
                        item.type.startsWith("image/"),
                      )
                      .map((item) => item.getAsFile())
                      .filter(Boolean) as File[];

                    if (files.length > 0) {
                      e.preventDefault();
                      addImagesToForm(files, "edit");
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = e.dataTransfer.files;
                    if (files.length > 0) {
                      addImagesToForm(files, "edit");
                    }
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  tabIndex={0}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4 text-center"
                >
                  <p className="text-xs text-slate-500 mb-2">
                    Ctrl + V, Drag & Drop, or Browse
                  </p>

                  <label className="inline-flex px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs cursor-pointer">
                    📁 Browse Images
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.length) {
                          addImagesToForm(e.target.files, "edit");
                          e.target.value = "";
                        }
                      }}
                    />
                  </label>
                </div>

                {editForm.images.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                    {editForm.images.map((image) => (
                      <div
                        key={image.id}
                        className="relative rounded-lg border dark:border-slate-700 overflow-hidden"
                      >
                        <img
                          src={image.dataUrl}
                          alt={image.name}
                          className="w-full h-28 object-contain"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            removeImage(image.id, "edit")
                          }
                          className="absolute top-1 right-1 h-6 w-6 rounded-full bg-red-600 text-white text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {editError && (
              <p className="text-xs text-red-600">
                Could not save: {editError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingEntry(null)}
                className="px-3.5 py-1.5 text-sm rounded-lg border dark:border-slate-700 text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>

              <button
                onClick={saveEditedEntry}
                disabled={isUpdating || !editForm.subject}
                className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-50"
              >
                {isUpdating ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}