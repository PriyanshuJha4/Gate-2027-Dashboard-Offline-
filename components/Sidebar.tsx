"use client";

import { useState } from "react";
import Link from "next/link";
import MiniTimer from "./timer/MiniTimer";
import GlobalSearch from "./GlobalSearch";
import ThemeToggle from "./ThemeToggle";

const NAV_ITEMS = [
  { label: "📅 Today", href: "/today" },
  { label: "⏱️ Pomodoro Timer", href: "/timer" },
  { label: "Dashboard", href: "/" },
  { label: "To Do List", href: "/todo-list" },
  { label: "Syllabus Tracker", href: "/syllabus" },
  { label: "Weekly Matrix", href: "/weekly-matrix" },
  { label: "📚 Library", href: "/library" },
  { label: "Error Log", href: "/error-log" },
  { label: "🎯 Error Review Mode", href: "/error-log/review" },
  { label: "📝 Notes Viewer", href: "/notes" },
  { label: "🎥 Class & DPP Library", href: "/class-library" },
  { label: "📂 Resource Manager", href: "/resource-library" },
  { label: "📖 One-Shot Revision", href: "/one-shot-revision" },
  { label: "🃏 Flashcards", href: "/flashcards" },
  { label: "Frequently Used Links", href: "/study-links" },
  { label: "Subject Weightage", href: "/subject-weightage" },
  { label: "Mock Test Performance", href: "/analytics" },
  { label: "💾 Backup & Restore", href: "/settings" },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* 1. Sticky Top Header Bar (Full Width) */}
      <header className="sticky top-0 z-30 gap-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between shadow-xs w-full">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex items-center justify-center border border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="truncate font-extrabold text-slate-800 dark:text-white text-base tracking-tight">
            GATE 2027 Offline Dashboard
          </span>
        </div>

        {/* Right side of the header: search box (Ctrl+K) + mini Pomodoro timer.
            Both live in this header, which is on every page, so they are available everywhere.
            Timer state lives in TimerProvider (ClientLayout), so it follows you across pages. */}
        <div className="flex shrink-0 items-center gap-2">
          <GlobalSearch />
          <MiniTimer />
          <ThemeToggle />
        </div>
      </header>

      {/* 2. Backdrop Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity duration-300"
          onClick={() => setOpen(false)}
        />
      )}

      {/* 3. Slide-in Drawer Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen w-72 sm:w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-5 z-50 transition-transform duration-300 ease-in-out overflow-y-auto flex flex-col justify-between shadow-2xl ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div>
          <div className="flex items-center justify-between mb-5 border-b dark:border-slate-800 pb-3">
            <h1 className="font-extrabold text-indigo-600 dark:text-indigo-400 text-xl tracking-wide">
              GATE 2027
            </h1>
            <button
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav className="mt-5 space-y-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="pt-4 mt-6 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-400">
          Local SQLite & Storage Active
        </div>
      </aside>
    </>
  );
}
