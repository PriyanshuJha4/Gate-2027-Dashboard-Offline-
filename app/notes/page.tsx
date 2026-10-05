import type { Metadata } from "next";
import NotesViewer from "@/components/notes/NotesViewer";

export const metadata: Metadata = {
  title: "Notes Viewer",
  other: { "mobile-web-app-capable": "yes" },
};

export default function NotesPage() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">📝 Notes Viewer</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Open your PDF notes, annotate them, and turn any part of a page into a flashcard.
        </p>
      </div>
      <NotesViewer />
    </div>
  );
}
