import type { Metadata } from "next";
import TodayView from "@/components/today/TodayView";

export const metadata: Metadata = {
  title: "Today",
  other: { "mobile-web-app-capable": "yes" },
};

export default function TodayPage() {
  return <TodayView />;
}
