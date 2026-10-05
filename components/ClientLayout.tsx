"use client";

import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import { TimerToast } from "./timer/MiniTimer";
import { TimerProvider } from "@/lib/timerContext";

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    // TimerProvider lives here (root layout) so the Pomodoro timer keeps running across page changes.
    <TimerProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
        <Sidebar />
        <main className="flex-1 w-full px-4 py-6 sm:px-6 md:px-8 max-w-7xl mx-auto">
          {children}
        </main>
        <TimerToast />
      </div>
    </TimerProvider>
  );
}
