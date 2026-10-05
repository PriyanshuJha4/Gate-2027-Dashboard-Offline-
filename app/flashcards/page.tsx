"use client";

import { useEffect, useState } from "react";
import FlashcardsApp from "@/components/flashcards/FlashcardsApp";
import CardBrowser from "@/components/flashcards/CardBrowser";
import { TOPIC_BY_ID } from "@/lib/topics";

type TabId = "review" | "browser";

export default function FlashcardTabs() {
  const [activeTab, setActiveTab] = useState<TabId>("review");
  // ?topic=<topicId>  limits both tabs to one syllabus topic   ?tab=browser  opens the browser tab
  const [topicId, setTopicId] = useState<string | null>(null);
  // wait until the URL has been read, otherwise the wrong tab would mount (and fetch) for one frame
  const [ready, setReady] = useState(false);

  // Read the query on the client (same approach as NotesViewer). useSearchParams would need <Suspense> in Next 14.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("topic");
    if (t && TOPIC_BY_ID.has(t)) setTopicId(t); // unknown id: ignore, show everything
    if (params.get("tab") === "browser") setActiveTab("browser");
    setReady(true);
  }, []);

  const clearTopic = () => {
    setTopicId(null);
    const params = new URLSearchParams(window.location.search);
    params.delete("topic");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
  };

  const topic = topicId ? TOPIC_BY_ID.get(topicId) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">🃏 Flashcards & Spaced Repetition</h1>
          <p className="mt-1 text-xs text-slate-500">
            Spaced repetition (SM-2): cards you remember come back later, cards you forget come back sooner.
          </p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("review")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === "review"
                ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Today's Review
          </button>
          <button
            onClick={() => setActiveTab("browser")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === "browser"
                ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            All Cards Browser
          </button>
        </div>
      </div>

      {topic && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-200">
          <span>
            Only cards of <strong>{topic.name}</strong> <span className="opacity-70">({topic.subject})</span>
          </span>
          <button
            type="button"
            onClick={clearTopic}
            className="cursor-pointer rounded-lg px-2 py-1 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
          >
            Show all cards ✕
          </button>
        </div>
      )}

      {!ready ? null : activeTab === "review" ? (
        <FlashcardsApp topicId={topicId} />
      ) : (
        <CardBrowser topicId={topicId} />
      )}
    </div>
  );
}
