"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface ResourceItem {
  id: string;
  title: string;
  category: string;
  locationType: "Online" | "File Manager";
  pathOrUrl: string;
  type: string;
}

export default function LibraryPage() {
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [locationType, setLocationType] = useState<"Online" | "File Manager">("Online");
  const [pathOrUrl, setPathOrUrl] = useState("");
  const [newType, setNewType] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Database se data fetch karne ke liye function
  const fetchResources = async () => {
    try {
      const res = await fetch("/api/library");
      const data = await res.json();
      if (Array.isArray(data)) {
        setResources(data);
      }
    } catch (e) {
      console.error("Failed to fetch resources", e);
    }
  };

  useEffect(() => {
    fetchResources();
  }, []);

  const handleOpenAddModal = () => {
    setEditingId(null);
    setNewTitle("");
    setLocationType("Online");
    setPathOrUrl("");
    setNewType("");
    setShowAddModal(true);
  };

  const handleOpenEditModal = (item: ResourceItem) => {
    setEditingId(item.id);
    setNewTitle(item.title);
    setLocationType(item.locationType);
    setPathOrUrl(item.pathOrUrl);
    setNewType(item.type);
    setShowAddModal(true);
  };

  const handleSaveResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !pathOrUrl.trim() || !newType.trim()) return;

    const id = editingId || Date.now().toString();
    const payload = {
      id,
      title: newTitle.trim(),
      category: "Custom",
      locationType,
      pathOrUrl: pathOrUrl.trim(),
      type: newType.trim(),
    };

    try {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowAddModal(false);
        setEditingId(null);
        setNewTitle("");
        setPathOrUrl("");
        setNewType("");
        fetchResources(); // Database se fresh data load karega
      }
    } catch (e) {
      console.error("Failed to save resource", e);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Kya aap sach mein is resource ko delete karna chahte hain?")) {
      try {
        const res = await fetch(`/api/library?id=${id}`, {
          method: "DELETE",
        });
        if (res.ok) {
          fetchResources(); // Database se delete hone ke baad list refresh hogi
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

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            📚 GATE Study Library & Resources
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Access subject-wise, chapter-wise notes, and complete revision packages.
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow transition cursor-pointer"
        >
          + Add New Resource
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          href="/library/subject-wise"
          className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-500/50 shadow-sm transition group cursor-pointer block"
        >
          <div className="text-2xl mb-2">📑</div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors">
            Subject Wise Resources
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Explore notes, video lectures, and modules categorized subject by subject.
          </p>
        </Link>

        <Link
          href="/library/chapter-wise"
          className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-500/50 shadow-sm transition group cursor-pointer block"
        >
          <div className="text-2xl mb-2">📖</div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors">
            Chapter Wise Resources
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Dive deep into specific chapters, formulas, and topic-wise practice sheets.
          </p>
        </Link>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="font-semibold text-slate-800 dark:text-white">
            Complete GATE Revision Resources
          </h3>
          <span className="text-xs text-slate-400">Synced with SQLite Database</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs bg-slate-50 dark:bg-slate-950/50">
                <th className="p-3">Resource Name</th>
                <th className="p-3">Location / Path</th>
                <th className="p-3">Type</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
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
                      onClick={() => handleOpenEditModal(item)}
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
              {resources.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-400 text-xs">
                    No resources found in database. Add via query or UI!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSaveResource} className="bg-white dark:bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl text-slate-100">
            <h4 className="font-bold text-slate-900 dark:text-white">
              {editingId ? "Edit Resource" : "Add New Library Resource"}
            </h4>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Resource Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Algorithms Short Notes"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
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
                  {locationType === "Online" ? "Web URL (https://...)" : "Relative Path (/resources/...)"}
                </label>
                <input
                  type="text"
                  required
                  placeholder={locationType === "Online" ? "https://..." : "/resources/subject/file.pdf"}
                  value={pathOrUrl}
                  onChange={(e) => setPathOrUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Resource Type</label>
                <input
                  type="text"
                  required
                  placeholder="Type resource type (e.g. PDF, Video, Cheat Sheet...)"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-xs rounded-xl border border-slate-700 text-slate-300 cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 text-xs rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer">
                {editingId ? "Update Resource" : "Save Resource"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}