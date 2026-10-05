"use client";

const DEFAULT_SUBJECTS = [
  { id: "1", subject: "Engineering Mathematics", avg_marks: 13 },
  { id: "2", subject: "Discrete Mathematics", avg_marks: 8 },
  { id: "3", subject: "Data Structures & Algorithms", avg_marks: 10 },
  { id: "4", subject: "Operating Systems", avg_marks: 9 },
  { id: "5", subject: "Computer Networks", avg_marks: 8 },
  { id: "6", subject: "Database Management Systems", avg_marks: 8 },
  { id: "7", subject: "Computer Organization & Architecture", avg_marks: 8 },
  { id: "8", subject: "Theory of Computation", avg_marks: 8 },
  { id: "9", subject: "Compiler Design", avg_marks: 5 },
  { id: "10", subject: "Digital Logic", avg_marks: 6 },
  { id: "11", subject: "General Aptitude", avg_marks: 15 },
];

export default function SubjectWeightageChart() {
  const subjects = DEFAULT_SUBJECTS;
  const maxMarks = Math.max(...subjects.map((s) => s.avg_marks), 1);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
      <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">Subject-Wise Weightage (avg. marks)</h3>
      <div className="space-y-3">
        {subjects.map((s) => (
          <div key={s.id}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-700 dark:text-slate-300">{s.subject}</span>
              <span className="text-slate-500">{s.avg_marks} marks</span>
            </div>
            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full"
                style={{ width: `${(s.avg_marks / maxMarks) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-4 border-t dark:border-slate-800 pt-3">
        Based on standard GATE paper analysis distributions.
      </p>
    </div>
  );
}