"use client";

import { useEffect, useState } from "react";

// Light/dark toggle. Theme <html class="dark"> se chalti hai; initial class layout.tsx ka inline script lagata hai.
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);

    // Agar user ne kabhi manually choose nahi kiya, to OS theme badalne par saath chalo
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("theme");
    } catch {}
    if (saved) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      let s: string | null = null;
      try {
        s = localStorage.getItem("theme");
      } catch {}
      if (s) return;
      document.documentElement.classList.toggle("dark", e.matches);
      setDark(e.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex items-center justify-center border border-slate-200 dark:border-slate-700 cursor-pointer"
    >
      {/* mounted se pehle fixed icon, taaki hydration mismatch na ho */}
      <span className="w-5 h-5 flex items-center justify-center text-base leading-none" suppressHydrationWarning>
        {mounted && dark ? "☀️" : "🌙"}
      </span>
    </button>
  );
}
