"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { GATE_SYLLABUS } from "@/lib/syllabus";

interface ChapterResource {
  id: string;
  subject: string;
  chapter: string;
  title: string;
  locationType: "Online" | "File Manager";
  pathOrUrl: string;
  type: string;
}

export default function ChapterWiseLibraryPage() {
  const [resources, setResources] = useState<ChapterResource[]>([]);
  const [selectedSubject, setSelectedSubject] = useState(GATE_SYLLABUS[0]?.subject || "");
  const [selectedChapter, setSelectedChapter] = useState(GATE_SYLLABUS[0]?.topics[0] || "");
  
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [locationType, setLocationType] = useState<"Online" | "File Manager">("Online");
  const [pathOrUrl, setPathOrUrl] = useState("");
  const [type, setType] = useState("PDF");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const currentSubjectObj = GATE_SYLLABUS.find((s) => s.subject === selectedSubject);
  const chaptersList = currentSubjectObj ? currentSubjectObj.topics : [];

  // Database se chapter resources fetch karne ke liye
  const fetchResources = async () => {
    try {
      const res = await fetch("/api/chapter-wise");
      const data = await res.json();
      if (Array.isArray(data)) {
        setResources(data);
      }
    } catch (e) {
      console.error("Failed to fetch chapter-wise resources", e);
    }
  };

  useEffect(() => {
    fetchResources();
  }, []);

  const handleSubjectChange = (subj: string) => {
    setSelectedSubject(subj);
    const found = GATE_SYLLABUS.find((s) => s.subject === subj);
    if (found && found.topics.length > 0) {
      setSelectedChapter(found.topics[0]);
    } else {
      setSelectedChapter("");
    }
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setTitle("");
    setLocationType("File Manager");
    setPathOrUrl("");
    setType("PDF");
    setShowModal(true);
  };

  const handleOpenEdit = (item: ChapterResource) => {
    setEditingId(item.id);
    setSelectedSubject(item.subject);
    setSelectedChapter(item.chapter);
    setTitle(item.title);
    setLocationType(item.locationType);
    setPathOrUrl(item.pathOrUrl);
    setType(item.type);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !pathOrUrl.trim() || !selectedSubject || !selectedChapter) return;

    const id = editingId || `ch_${Date.now()}`;
    const payload = {
      id,
      subject: selectedSubject,
      chapter: selectedChapter,
      title: title.trim(),
      locationType,
      pathOrUrl: pathOrUrl.trim(),
      type,
    };

    try {
      const res = await fetch("/api/chapter-wise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowModal(false);
        setEditingId(null);
        setTitle("");
        setPathOrUrl("");
        fetchResources(); // Database se fresh data reload karega
      }
    } catch (e) {
      console.error("Failed to save chapter resource", e);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Kya aap is chapter resource ko delete karna chahte hain?")) {
      try {
        const res = await fetch(`/api/chapter-wise?id=${id}`, {
          method: "DELETE",
        });
        if (res.ok) {
          fetchResources();
        }
      } catch (e) {
        console.error("Failed to delete chapter resource", e);
      }
    }
  };

  const handleCopyPath = (id: string, path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredResources = resources.filter(
    (r) => r.subject === selectedSubject && r.chapter === selectedChapter
  );

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
            📖 Chapter-Wise Resources (SQLite Synced)
          </h1>
          <p className="text-xs text-slate-500">
            Target specific chapters and sub-topics for precise revisions and problem-solving notes.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow transition cursor-pointer"
        >
          + Add Chapter Resource
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Select Subject</label>
          <select
            value={selectedSubject}
            onChange={(e) => handleSubjectChange(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-white outline-none"
          >
            {GATE_SYLLABUS.map((s) => (
              <option key={s.subject} value={s.subject}>{s.subject}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Select Chapter / Topic</label>
          <select
            value={selectedChapter}
            onChange={(e) => setSelectedChapter(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-white outline-none"
          >
            {chaptersList.map((ch) => (
              <option key={ch} value={ch}>{ch}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-white">
            Chapter: <span className="text-indigo-600 dark:text-indigo-400">{selectedChapter || "Select a chapter"}</span>
          </h3>
          <p className="text-xs text-slate-400">Subject: {selectedSubject}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs bg-slate-50 dark:bg-slate-950/50">
                <th className="p-3">Resource Title</th>
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
                    No resources found for this chapter in the database.
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
              {editingId ? "Edit Chapter Resource" : "Add Chapter Resource"}
            </h4>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Subject</label>
                <select
                  value={selectedSubject}
                  onChange={(e) => handleSubjectChange(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none"
                >
                  {GATE_SYLLABUS.map((s) => (
                    <option key={s.subject} value={s.subject}>{s.subject}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Chapter</label>
                <select
                  value={selectedChapter}
                  onChange={(e) => setSelectedChapter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none"
                >
                  {chaptersList.map((ch) => (
                    <option key={ch} value={ch}>{ch}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Short Notes / PYQs"
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
                  {locationType === "Online" ? "Web URL (https://...)" : "Path"}
                </label>
                <input
                  type="text"
                  required
                  placeholder={locationType === "Online" ? "https://..." : "D:\\Folder\\file.pdf"}
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