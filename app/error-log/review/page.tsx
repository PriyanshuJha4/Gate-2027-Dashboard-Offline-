import type { Metadata } from "next";
import ErrorReviewList from "@/components/ErrorReviewList";

export const metadata: Metadata = {
  title: "GATE Error Review",
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function ErrorReviewPage() {
  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      <ErrorReviewList />
    </div>
  );
}
