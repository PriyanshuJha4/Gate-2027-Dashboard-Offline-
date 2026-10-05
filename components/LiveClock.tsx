"use client";

import { useEffect, useState } from "react";

export default function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!now) return null; // avoids server/client mismatch on first render

  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeLabel = now.toLocaleTimeString();

  return (
    <div className="text-sm text-gray-500 dark:text-slate-400">
      <div>{dateLabel}</div>
      <div className="font-mono text-lg text-brand">{timeLabel}</div>
    </div>
  );
}