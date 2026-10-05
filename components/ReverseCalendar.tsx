"use client";

import { daysRemaining, formatCountdownLabel } from "@/lib/countdown";

// Milestones data yahi safe fallback ke sath define kar diya gaya hai
interface MilestoneItem {
  label: string;
  date: string;
}

const FALLBACK_MILESTONES: MilestoneItem[] = [
  { label: "Syllabus Completion Target", date: "2026-11-30" },
  { label: "Final Revision Ends", date: "2027-01-30" },
  { label: "Exam Window Opens", date: "2027-02-06" },
];

export default function ReverseCalendar() {
  const milestonesList = FALLBACK_MILESTONES;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border p-5 mb-6 shadow-sm">
      <h3 className="font-semibold text-gray-800 dark:text-slate-100 mb-3">
        Reverse Calendar — Key Milestones
      </h3>
      <div className="space-y-2">
        {milestonesList.map((m) => {
          const days = daysRemaining(m.date);
          const overdue = days < 0;
          return (
            <div
              key={m.label}
              className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 last:border-0 py-2.5"
            >
              <div>
                <div className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {m.label}
                </div>
                <div className="text-xs text-gray-400">{m.date}</div>
              </div>
              <div
                className={`text-sm font-semibold ${
                  overdue ? "text-red-600 dark:text-red-400" : "text-brand"
                }`}
              >
                {formatCountdownLabel(days)}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mt-4 border-t pt-3">
        Syllabus target is set for November 30, 2026 and final revision concludes on January 30, 2027.
      </p>
    </div>
  );
}