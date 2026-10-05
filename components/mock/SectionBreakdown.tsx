"use client";

import { fmtMarks, sectionNet, summarizeSections, accuracyPct, type MockSection } from "@/lib/mockScoring";

interface Props {
  sections: MockSection[];
  /** Total test duration; when given, each section also shows its share of the time. */
  durationMin?: number | null;
}

const TH = "px-2 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap";
const TD = "px-2 py-2 text-sm text-slate-700 dark:text-slate-200 whitespace-nowrap";

function accColor(p: number | null) {
  if (p === null) return "bg-slate-300 dark:bg-slate-700";
  if (p >= 75) return "bg-emerald-500";
  if (p >= 50) return "bg-amber-500";
  return "bg-red-500";
}

export default function SectionBreakdown({ sections, durationMin }: Props) {
  if (!sections || sections.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-4 text-center">
        No section-wise breakdown was logged for this test.
      </p>
    );
  }

  const total = summarizeSections(sections);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full text-left border-collapse min-w-[560px]">
        <thead className="bg-slate-50 dark:bg-slate-950">
          <tr>
            <th className={TH}>Section</th>
            <th className={`${TH} text-right`}>Attempted</th>
            <th className={`${TH} text-right`}>Correct</th>
            <th className={`${TH} text-right`}>Wrong</th>
            <th className={TH}>Accuracy</th>
            <th className={`${TH} text-right`}>Marks</th>
            <th className={`${TH} text-right`}>Negative</th>
            <th className={`${TH} text-right`}>Net</th>
            <th className={`${TH} text-right`}>Time</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => {
            const acc = accuracyPct(s.correct, s.attempted);
            const share =
              durationMin && durationMin > 0 && s.time_min > 0 ? Math.round((s.time_min / durationMin) * 100) : null;
            return (
              <tr key={s.name} className="border-t border-slate-100 dark:border-slate-800">
                <td className={`${TD} font-medium`}>{s.name}</td>
                <td className={`${TD} text-right`}>{s.attempted}</td>
                <td className={`${TD} text-right text-emerald-600 dark:text-emerald-400`}>{s.correct}</td>
                <td className={`${TD} text-right text-red-600 dark:text-red-400`}>{s.wrong}</td>
                <td className={TD}>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className={`h-full ${accColor(acc)}`} style={{ width: `${acc ?? 0}%` }} />
                    </div>
                    <span className="text-xs text-slate-500">{acc === null ? "—" : `${acc}%`}</span>
                  </div>
                </td>
                <td className={`${TD} text-right`}>{fmtMarks(s.marks)}</td>
                <td className={`${TD} text-right text-red-600 dark:text-red-400`}>
                  {s.neg_marks > 0 ? `−${fmtMarks(s.neg_marks)}` : "0"}
                </td>
                <td className={`${TD} text-right font-semibold`}>{fmtMarks(sectionNet(s))}</td>
                <td className={`${TD} text-right`}>
                  {s.time_min > 0 ? `${s.time_min} min` : "—"}
                  {share !== null && <span className="ml-1 text-xs text-slate-400">({share}%)</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
          <tr>
            <td className={`${TD} font-semibold`}>Total</td>
            <td className={`${TD} text-right font-semibold`}>{total.attempted}</td>
            <td className={`${TD} text-right font-semibold`}>{total.correct}</td>
            <td className={`${TD} text-right font-semibold`}>{total.wrong}</td>
            <td className={`${TD} font-semibold`}>{total.accuracy === null ? "—" : `${total.accuracy}%`}</td>
            <td className={`${TD} text-right font-semibold`}>{fmtMarks(total.marks)}</td>
            <td className={`${TD} text-right font-semibold text-red-600 dark:text-red-400`}>
              {total.neg_marks > 0 ? `−${fmtMarks(total.neg_marks)}` : "0"}
            </td>
            <td className={`${TD} text-right font-semibold`}>{fmtMarks(total.net)}</td>
            <td className={`${TD} text-right font-semibold`}>{total.time_min > 0 ? `${total.time_min} min` : "—"}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
