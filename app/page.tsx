"use client";

import Link from "next/link";
import DashboardHeader from "../components/DashboardHeader";
import ReverseCalendar from "../components/ReverseCalendar";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header / Banner */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            GATE 2027 Offline Dashboard
          </h1>
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold rounded-full border border-emerald-500/20">
            🟢 Local SQLite Active
          </span>
        </div>

        {/* Shortcut to the daily focus page */}
        <Link
          href="/today"
          className="flex items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-3 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70"
        >
          <span>📅 Today: your task, due cards and errors in one place</span>
          <span aria-hidden>&rarr;</span>
        </Link>

        {/* Main Dashboard Content */}
        <DashboardHeader />
        <ReverseCalendar />
      </div>
    </div>
  );
}