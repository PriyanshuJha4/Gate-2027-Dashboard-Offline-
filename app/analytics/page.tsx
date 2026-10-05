import ScoreTrendChart from "@/components/ScoreTrendChart";
import WeakTopics from "@/components/WeakTopics";

export default function AnalyticssPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Test Analytics</h1>
      <ScoreTrendChart />
      <div className="mt-6">
        <WeakTopics />
      </div>
    </div>
  );
}