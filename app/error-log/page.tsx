import type { Metadata } from "next";
import ErrorLog from "@/components/ErrorLog";

export const metadata: Metadata = {
  title: "GATE Error Log",
  // Fixes: <meta name="apple-mobile-web-app-capable"> is deprecated
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function ErrorLogsPage() {
  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          📝 GATE Error Book & Error Log (SQLite Synced)
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Record every wrong question or conceptual mistake with image attachments and detailed breakdowns to prevent repeating them in the GATE exam.
        </p>
      </div>
      <ErrorLog />
    </div>
  );
}
