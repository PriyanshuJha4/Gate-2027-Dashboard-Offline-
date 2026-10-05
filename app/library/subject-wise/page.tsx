"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { GATE_SYLLABUS } from "@/lib/syllabus";

interface SubjectResource {
  id: string;
  subject: string;
  title: string;
  locationType: "Online" | "File Manager";
  pathOrUrl: string;
  type: string;
}

export default function SubjectWiseLibraryPage() {
  const [resources, setResources] = useState<SubjectResource[]>([]);
  const [selectedSubject, setSelectedSubject] = useState(GATE_SYLLABUS[0]?.subject || "Engineering Mathematics");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [locationType, setLocationType] = useState<"Online" | "File Manager">("Online");
  const [pathOrUrl, setPathOrUrl] = useState("");
  const [type, setType] = useState("PDF");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Database se resources fetch karne ke liye
  const fetchResources = async () => {
    try {
      const res = await fetch("/api/subject-wise");
      const data = await res.json();
      if (Array.isArray(data)) {
        setResources(data);
      }
    } catch (e) {
      console.error("Failed to fetch subject resources", e);
    }
  };

  useEffect(() => {
    fetchResources();
  }, []);

  const handleOpenAdd = () => {
    setEditingId(null);
    setTitle("");
    setLocationType("File Manager");
    setPathOrUrl("");
    setType("PPT");
    setShowModal(true);
  };

  const handleOpenEdit = (item: SubjectResource) => {
    setEditingId(item.id);
    setSelectedSubject(item.subject);
    setTitle(item.title);
    setLocationType(item.locationType);
    setPathOrUrl(item.pathOrUrl);
    setType(item.type);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !pathOrUrl.trim() || !selectedSubject) return;

    const id = editingId || `ds_${Date.now()}`;
    const payload = {
      id,
      subject: selectedSubject,
      title: title.trim(),
      locationType,
      pathOrUrl: pathOrUrl.trim(),
      type,
    };

    try {
      const res = await fetch("/api/subject-wise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowModal(false);
        setEditingId(null);
        setTitle("");
        setPathOrUrl("");
        fetchResources(); // Fresh data reload karega database se
      }
    } catch (e) {
      console.error("Failed to save resource", e);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Kya aap is resource ko delete karna chahte hain?")) {
      try {
        const res = await fetch(`/api/subject-wise?id=${id}`, {
          method: "DELETE",
        });
        if (res.ok) {
          fetchResources();
        }
      } catch (e) {
        console.error("Failed to delete resource", e);
      }
    }
  };

  const handleCopyPath = (id: string, path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredResources = resources.filter((r) => r.subject === selectedSubject);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/library" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
              &larr; Back to Library
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            📑 Subject-Wise Resources (SQLite Synced)
          </h1>
          <p className="text-xs text-slate-500">
            Browse notes, lectures, and practice links categorized by specific GATE subjects.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow transition cursor-pointer"
        >
          + Add Subject Resource
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {GATE_SYLLABUS.map((s) => (
          <button
            key={s.subject}
            onClick={() => setSelectedSubject(s.subject)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              selectedSubject === s.subject
                ? "bg-indigo-600 text-white shadow"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50"
            }`}
          >
            {s.subject}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-slate-800 dark:text-white">
          Resources for: <span className="text-indigo-600 dark:text-indigo-400">{selectedSubject}</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs bg-slate-50 dark:bg-slate-950/50">
                <th className="p-3">Title / File Name</th>
                <th className="p-3">Location / Path</th>
                <th className="p-3">Type</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredResources.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                  <td className="p-3 font-medium text-slate-800 dark:text-slate-200">{item.title}</td>
                  <td className="p-3">
                    {item.locationType === "File Manager" ? (
                      <div className="flex items-center gap-2">
                        <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded text-xs font-mono max-w-[200px] truncate" title={item.pathOrUrl}>
                          {item.pathOrUrl}
                        </span>
                        <button
                          onClick={() => handleCopyPath(item.id, item.pathOrUrl)}
                          className="text-[11px] bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-200 px-2 py-1 rounded transition cursor-pointer shrink-0"
                        >
                          {copiedId === item.id ? "Copied! ✓" : "Copy Path"}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Online Link</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900">
                      {item.type}
                    </span>
                  </td>
                  <td className="p-3 text-right space-x-2 whitespace-nowrap">
                    {item.locationType === "Online" && (
                      <a
                        href={item.pathOrUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-xs text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900 px-2.5 py-1 rounded-lg transition hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
                      >
                        Open ↗
                      </a>
                    )}
                    <button
                      onClick={() => handleOpenEdit(item)}
                      className="text-xs text-slate-600 dark:text-slate-300 hover:text-indigo-600 border dark:border-slate-700 px-2.5 py-1 rounded-lg transition cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-xs text-red-500 hover:text-red-700 border border-red-200 dark:border-red-900/50 px-2.5 py-1 rounded-lg transition cursor-pointer"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filteredResources.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-400 text-xs">
                    No resources added for this subject in the database yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl text-slate-100">
            <h4 className="font-bold text-slate-900 dark:text-white">
              {editingId ? "Edit Subject Resource" : "Add Subject Resource"}
            </h4>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Select Subject</label>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none"
                >
                  {GATE_SYLLABUS.map((s) => (
                    <option key={s.subject} value={s.subject}>{s.subject}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Resource Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Arrays Presentation"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Location Type</label>
                <select
                  value={locationType}
                  onChange={(e) => setLocationType(e.target.value as "Online" | "File Manager")}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none"
                >
                  <option value="Online">Online Link</option>
                  <option value="File Manager">File Manager (Local Path)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  {locationType === "Online" ? "Web URL (https://...)" : "File Path"}
                </label>
                <input
                  type="text"
                  required
                  placeholder={locationType === "Online" ? "https://..." : "D:\\Folder\\file.pptx"}
                  value={pathOrUrl}
                  onChange={(e) => setPathOrUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none"
                >
                  <option value="PDF">PDF</option>
                  <option value="PPT">PPT</option>
                  <option value="Video">Video</option>
                  <option value="Audio">Audio</option>
                  <option value="Link">Link</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-xs rounded-xl border border-slate-700 text-slate-300 cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 text-xs rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer">
                {editingId ? "Update" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}