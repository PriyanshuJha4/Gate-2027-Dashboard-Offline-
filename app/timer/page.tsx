import type { Metadata } from "next";
import TimerView from "@/components/timer/TimerView";

export const metadata: Metadata = {
  title: "Pomodoro Timer",
  other: { "mobile-web-app-capable": "yes" },
};

export default function TimerPage() {
  return <TimerView />;
}
