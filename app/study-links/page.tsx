"use client";

import { useState, useEffect, useCallback } from "react";

interface StudyLink {
  id: string;
  title: string;
  url: string;
  category: string;
}

export default function StudyLinksManager() {
  const [links, setLinks] = useState<StudyLink[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form states
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("General");
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/study-links");
      const data = await res.json();
      if (Array.isArray(data)) {
        setLinks(data);
      }
    } catch (e) {
      console.error("Failed to fetch study links", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;

    const payload = {
      id: editingId || undefined,
      title: title.trim(),
      url: url.trim(),
      category: category.trim() || "General",
    };

    try {
      const res = await fetch("/api/study-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setTitle("");
        setUrl("");
        setCategory("General");
        setEditingId(null);
        fetchLinks();
      }
    } catch (e) {
      console.error("Failed to save study link", e);
    }
  };

  const handleEdit = (link: StudyLink) => {
    setEditingId(link.id);
    setTitle(link.title);
    setUrl(link.url);
    setCategory(link.category || "General");
  };

  const handleDelete = async (id: string) => {
    if (confirm("Kya aap is link ko delete karna chahte hain?")) {
      try {
        const res = await fetch(`/api/study-links?id=${id}`, {
          method: "DELETE",
        });
        if (res.ok) {
          fetchLinks();
        }
      } catch (e) {
        console.error("Failed to delete study link", e);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Add / Edit Form */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">
          {editingId ? "Edit Study Link" : "Add New Study Link (SQLite Synced)"}
        </h3>
        <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Title</label>
            <input
              type="text"
              required
              placeholder="e.g. NPTEL Graph Theory"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">URL (https://...)</label>
            <input
              type="url"
              required
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
            <input
              type="text"
              placeholder="e.g. Lectures, Notes"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none"
            />
          </div>
          <div className="sm:col-span-3 flex justify-end gap-2 mt-2">
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setTitle("");
                  setUrl("");
                  setCategory("General");
                }}
                className="px-4 py-2 text-xs rounded-lg border border-slate-700 text-slate-300"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="bg-indigo-600 text-white text-xs font-medium px-4 py-2 rounded-lg hover:bg-indigo-500 cursor-pointer"
            >
              {editingId ? "Update Link" : "Add Link"}
            </button>
          </div>
        </form>
      </div>

      {/* Links List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Saved Quick Links</h3>
        {loading ? (
          <p className="text-sm text-slate-400 py-4 text-center">Loading links from database...</p>
        ) : links.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No study links added yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {links.map((link) => (
              <div key={link.id} className="flex items-center justify-between p-3 rounded-xl border dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                <div className="overflow-hidden mr-2">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {link.category}
                  </span>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate mt-1">{link.title}</h4>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline truncate block"
                  >
                    {link.url}
                  </a>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleEdit(link)}
                    className="text-xs px-2 py-1 border rounded-md dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(link.id)}
                    className="text-xs px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded-md hover:bg-red-100"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}