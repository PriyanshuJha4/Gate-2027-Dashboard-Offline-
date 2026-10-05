"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { topicIdByName, progressKey } from "@/lib/topics";
import ApiStatusBanner from "@/components/ApiStatusBanner";
import { apiGet, errText } from "@/lib/apiClient";

// Ticks are stored per stable topic id; any old spelling of the name resolves to the same id.
function keyFor(item: { subject: string; topic: string }, cat: string) {
  const id = topicIdByName(item.topic, item.subject);
  return id ? progressKey(id, cat) : `${item.topic}::${cat}`;
}

const GATE_WEEKS_SCHEDULE = [
  // --- PHASE 1 ---
  {
    id: "w1",
    phase: "Phase 1 — Syllabus Completion (1 Oct – 30 Nov)",
    title: "Week 1 (1–7 Oct): C + Digital Logic + Discrete Mathematics",
    topics: [
      { subject: "C Programming", topic: "Data Types & Operators" },
      { subject: "C Programming", topic: "Control Flow Statements" },
      { subject: "C Programming", topic: "Functions & Storage" },
      { subject: "Digital Logic", topic: "Logic Gates" },
      { subject: "Digital Logic", topic: "Minimization of Boolean Function" },
      { subject: "Discrete Mathematics", topic: "Set Theory" },
      { subject: "Discrete Mathematics", topic: "Mathematical Logic" },
      { subject: "Aptitude", topic: "Percentages & Profit/Loss" },
    ],
  },
  {
    id: "w2",
    phase: "Phase 1 — Syllabus Completion (1 Oct – 30 Nov)",
    title: "Week 2 (8–14 Oct): C + Data Structures + Digital Logic",
    topics: [
      { subject: "C Programming", topic: "Arrays & Pointers" },
      { subject: "C Programming", topic: "String in C Programming" },
      { subject: "C Programming", topic: "Structure & Union" },
      { subject: "C Programming", topic: "Miscellaneous Topics" },
      { subject: "Data Structures", topic: "Introduction to DSA" },
      { subject: "Data Structures", topic: "Arrays" },
      { subject: "Data Structures", topic: "Linked List" },
      { subject: "Digital Logic", topic: "Combinational Circuits" },
      { subject: "Digital Logic", topic: "Number System" },
      { subject: "Aptitude", topic: "Numbers & Counting Theory" },
    ],
  },
  {
    id: "w3",
    phase: "Phase 1 — Syllabus Completion (1 Oct – 30 Nov)",
    title: "Week 3 (15–21 Oct): DSA + Algorithms + COA",
    topics: [
      { subject: "Data Structures", topic: "Stack & Queues" },
      { subject: "Data Structures", topic: "Tree" },
      { subject: "Data Structures", topic: "Graphs" },
      { subject: "Data Structures", topic: "Hashing" },
      { subject: "Algorithms", topic: "Analysis of Algorithm" },
      { subject: "Algorithms", topic: "Design Strategies" },
      { subject: "Algorithms", topic: "Greedy Method" },
      { subject: "COA", topic: "Introduction of COA" },
      { subject: "COA", topic: "Machine Instruction & Addressing Modes" },
      { subject: "Aptitude", topic: "Time & Work" },
    ],
  },
  {
    id: "w4",
    phase: "Phase 1 — Syllabus Completion (1 Oct – 30 Nov)",
    title: "Week 4 (22–28 Oct): Algorithms + COA + Engineering Mathematics",
    topics: [
      { subject: "Algorithms", topic: "Dynamic Programming" },
      { subject: "Algorithms", topic: "Graph Algorithms" },
      { subject: "Algorithms", topic: "Heap Algorithms" },
      { subject: "Algorithms", topic: "Backtracking & Branch & Bound" },
      { subject: "COA", topic: "Floating Point" },
      { subject: "COA", topic: "ALU & Control Unit" },
      { subject: "COA", topic: "Instruction Pipelining" },
      { subject: "Engineering Mathematics", topic: "Single Variable Calculus" },
      { subject: "Engineering Mathematics", topic: "Linear Algebra" },
      { subject: "Aptitude", topic: "Time & Distance" },
    ],
  },
  {
    id: "w5",
    phase: "Phase 1 — Syllabus Completion (1 Oct – 30 Nov)",
    title: "Week 5 (29 Oct–4 Nov): COA + TOC + Mathematics",
    topics: [
      { subject: "COA", topic: "Cache Memory" },
      { subject: "COA", topic: "Secondary Memory & I/O Interface" },
      { subject: "TOC", topic: "Finite Automata" },
      { subject: "TOC", topic: "Push Down Automata" },
      { subject: "Engineering Mathematics", topic: "Probability & Statistics" },
      { subject: "Discrete Mathematics", topic: "Graph Theory" },
      { subject: "Aptitude", topic: "Quantitative Aptitude — Clocks & Calendars" },
    ],
  },
  {
    id: "w6",
    phase: "Phase 1 — Syllabus Completion (1 Oct – 30 Nov)",
    title: "Week 6 (5–11 Nov): TOC + DBMS",
    topics: [
      { subject: "TOC", topic: "Turing Machine" },
      { subject: "TOC", topic: "Decidability" },
      { subject: "DBMS", topic: "ER Model" },
      { subject: "DBMS", topic: "FD's & Normalization" },
      { subject: "DBMS", topic: "Query Language" },
      { subject: "Aptitude", topic: "Data Interpretation" },
      { subject: "Aptitude", topic: "Verbal Aptitude" },
    ],
  },
  {
    id: "w7",
    phase: "Phase 1 — Syllabus Completion (1 Oct – 30 Nov)",
    title: "Week 7 (12–18 Nov): DBMS + Computer Networks",
    topics: [
      { subject: "DBMS", topic: "Transaction & Concurrency Control" },
      { subject: "DBMS", topic: "File Organization & Indexing" },
      { subject: "Computer Networks", topic: "IPv4 Addressing" },
      { subject: "Computer Networks", topic: "Error Control" },
      { subject: "Computer Networks", topic: "Flow Control" },
      { subject: "Computer Networks", topic: "IPv4 Header & Fragmentation" },
      { subject: "Aptitude", topic: "Spatial Aptitude — Formation of Image" },
      { subject: "Aptitude", topic: "Analytical Aptitude — Directions & Blood Relations" },
    ],
  },
  {
    id: "w8",
    phase: "Phase 1 — Syllabus Completion (1 Oct – 30 Nov)",
    title: "Week 8 (19–25 Nov): Computer Networks + Compiler Design + OS",
    topics: [
      { subject: "Computer Networks", topic: "TCP & UDP" },
      { subject: "Computer Networks", topic: "Medium Access Control" },
      { subject: "Computer Networks", topic: "Switching" },
      { subject: "Computer Networks", topic: "Application Layer Protocol" },
      { subject: "Compiler Design", topic: "Lexical Analysis & Syntax Analysis" },
      { subject: "Compiler Design", topic: "Syntax Directed Translation" },
      { subject: "Operating Systems", topic: "Introduction & Background" },
      { subject: "Operating Systems", topic: "Process Management" },
      { subject: "Operating Systems", topic: "CPU Scheduling" },
      { subject: "Aptitude", topic: "Analytical Aptitude — Venn Diagrams & Syllogism" },
    ],
  },
  {
    id: "w9",
    phase: "Phase 1 — Syllabus Completion (1 Oct – 30 Nov)",
    title: "Week 9 (26–30 Nov): Finish remaining syllabus + consolidation",
    topics: [
      { subject: "Computer Networks", topic: "IP Support Protocol" },
      { subject: "Computer Networks", topic: "OSI & TCP/IP Protocol" },
      { subject: "Compiler Design", topic: "Intermediate Code & Code Optimization" },
      { subject: "Operating Systems", topic: "Process Synchronization" },
      { subject: "Operating Systems", topic: "Deadlock" },
      { subject: "Operating Systems", topic: "Memory Management" },
      { subject: "Operating Systems", topic: "File System & Device Management" },
      { subject: "Operating Systems", topic: "System Calls & Threads" },
      { subject: "Revision", topic: "Revision" },
      { subject: "Aptitude", topic: "Analytical Aptitude — Arrangement & Problem Solving" },
    ],
  },

  // --- PHASE 2 ---
  {
    id: "w10",
    phase: "Phase 2 — Revision + Mocks (1 Dec – 31 Jan)",
    title: "Week 10 (1–7 Dec): C + Data Structures + Algorithms Revision",
    topics: [
      { subject: "C Programming", topic: "Data Types & Operators" },
      { subject: "C Programming", topic: "Arrays & Pointers" },
      { subject: "Data Structures", topic: "Arrays" },
      { subject: "Data Structures", topic: "Linked List" },
      { subject: "Data Structures", topic: "Stack & Queues" },
      { subject: "Data Structures", topic: "Tree" },
      { subject: "Data Structures", topic: "Graphs" },
      { subject: "Algorithms", topic: "Analysis of Algorithm" },
    ],
  },
  {
    id: "w11",
    phase: "Phase 2 — Revision + Mocks (1 Dec – 31 Jan)",
    title: "Week 11 (8–14 Dec): Algorithms + Digital Logic + COA Revision",
    topics: [
      { subject: "Algorithms", topic: "Greedy Method" },
      { subject: "Algorithms", topic: "Dynamic Programming" },
      { subject: "Digital Logic", topic: "Minimization of Boolean Function" },
      { subject: "Digital Logic", topic: "Combinational Circuits" },
      { subject: "COA", topic: "Machine Instruction & Addressing Modes" },
      { subject: "COA", topic: "ALU & Control Unit" },
      { subject: "COA", topic: "Cache Memory" },
    ],
  },
  {
    id: "w12",
    phase: "Phase 2 — Revision + Mocks (1 Dec – 31 Jan)",
    title: "Week 12 (15–21 Dec): Discrete Math + Engineering Math + Aptitude Revision",
    topics: [
      { subject: "Discrete Mathematics", topic: "Graph Theory" },
      { subject: "Discrete Mathematics", topic: "Mathematical Logic" },
      { subject: "Engineering Mathematics", topic: "Probability & Statistics" },
      { subject: "Engineering Mathematics", topic: "Linear Algebra" },
      { subject: "Aptitude", topic: "Verbal Aptitude" },
      { subject: "Aptitude", topic: "Quantitative Aptitude — Time & Work" },
    ],
  },
  {
    id: "w13",
    phase: "Phase 2 — Revision + Mocks (1 Dec – 31 Jan)",
    title: "Week 13 (22–28 Dec): TOC + DBMS Revision",
    topics: [
      { subject: "TOC", topic: "Finite Automata" },
      { subject: "TOC", topic: "Push Down Automata" },
      { subject: "TOC", topic: "Turing Machine" },
      { subject: "DBMS", topic: "FD's & Normalization" },
      { subject: "DBMS", topic: "Transaction & Concurrency Control" },
      { subject: "DBMS", topic: "ER Model" },
    ],
  },
  {
    id: "w14",
    phase: "Phase 2 — Revision + Mocks (1 Dec – 31 Jan)",
    title: "Week 14 (29 Dec–4 Jan): Computer Networks + Compiler Revision",
    topics: [
      { subject: "Computer Networks", topic: "IPv4 Addressing" },
      { subject: "Computer Networks", topic: "TCP & UDP" },
      { subject: "Computer Networks", topic: "Medium Access Control" },
      { subject: "Compiler Design", topic: "Lexical Analysis & Syntax Analysis" },
      { subject: "Compiler Design", topic: "Syntax Directed Translation" },
    ],
  },
  {
    id: "w15",
    phase: "Phase 2 — Revision + Mocks (1 Dec – 31 Jan)",
    title: "Week 15 (5–11 Jan): Operating Systems + Core Revision",
    topics: [
      { subject: "Operating Systems", topic: "Process Management" },
      { subject: "Operating Systems", topic: "CPU Scheduling" },
      { subject: "Operating Systems", topic: "Process Synchronization" },
      { subject: "Operating Systems", topic: "Deadlock" },
      { subject: "Operating Systems", topic: "Memory Management" },
    ],
  },
  {
    id: "w16",
    phase: "Phase 2 — Revision + Mocks (1 Dec – 31 Jan)",
    title: "Week 16 (12–18 Jan): Revision Cycle 2 — High-Weight Core",
    topics: [
      { subject: "Data Structures", topic: "Tree" },
      { subject: "Algorithms", topic: "Dynamic Programming" },
      { subject: "COA", topic: "Cache Memory" },
      { subject: "DBMS", topic: "Transaction & Concurrency Control" },
      { subject: "Operating Systems", topic: "Deadlock" },
      { subject: "Computer Networks", topic: "IPv4 Addressing" },
    ],
  },
  {
    id: "w17",
    phase: "Phase 2 — Revision + Mocks (1 Dec – 31 Jan)",
    title: "Week 17 (19–25 Jan): Revision Cycle 2 — Math + Digital + C + Aptitude",
    topics: [
      { subject: "C Programming", topic: "Arrays & Pointers" },
      { subject: "Digital Logic", topic: "Logic Gates" },
      { subject: "Discrete Mathematics", topic: "Graph Theory" },
      { subject: "Engineering Mathematics", topic: "Linear Algebra" },
      { subject: "Aptitude", topic: "Quantitative Aptitude — Percentages & Profit/Loss" },
    ],
  },
  {
    id: "w18",
    phase: "Phase 2 — Revision + Mocks (1 Dec – 31 Jan)",
    title: "Week 18 (26–31 Jan): Final Revision + Full Mocks",
    topics: [
      { subject: "Revision", topic: "Revision" },
      { subject: "C Programming", topic: "Structure & Union" },
      { subject: "Data Structures", topic: "Graphs" },
      { subject: "Algorithms", topic: "Greedy Method" },
      { subject: "Operating Systems", topic: "System Calls & Threads" },
    ],
  },
];

const CATEGORIES = ["class_notes", "practice_q", "pyqs", "short_notes"];

export default function WeeklyMatrix() {
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const fetchProgress = useCallback(async () => {
    try {
      const data = await apiGet("/api/syllabus-progress?userId=default_user");
      if (!data || typeof data !== "object") throw new Error("The server sent unexpected data.");
      setCompletedMap(data);
      setLoadError("");
    } catch (e) {
      console.error("Failed to load progress for weekly matrix", e);
      setLoadError(`Progress could not be loaded (${errText(e, "unknown error")}). The bars below are NOT real until it loads.`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  return (
    <div className="space-y-6 pb-16">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            GATE 2027 Weekly Matrix & Study Plan
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Track your weekly goal completions linked directly with your local SQLite Syllabus progress.
          </p>
        </div>
        <Link
          href="/syllabus"
          className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-500 transition text-center shadow-sm"
        >
          Go to Syllabus Tracker &rarr;
        </Link>
      </div>

      <ApiStatusBanner message={loadError} onRetry={fetchProgress} />

      {loading && (
        <p className="text-sm text-slate-400 text-center py-4">
          Loading matrix progress from local database...
        </p>
      )}

      <div className="grid grid-cols-1 gap-6">
        {GATE_WEEKS_SCHEDULE.map((week) => {
          const totalCheckpoints = week.topics.length * CATEGORIES.length;
          let completedCheckpoints = 0;

          week.topics.forEach((item) => {
            CATEGORIES.forEach((cat) => {
              const key = keyFor(item, cat);
              if (completedMap[key]) {
                completedCheckpoints += 1;
              }
            });
          });

          const weekPercent =
            totalCheckpoints > 0
              ? Math.round((completedCheckpoints / totalCheckpoints) * 100)
              : 0;

          return (
            <div
              key={week.id}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    {week.phase}
                  </span>
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 mt-1">
                    {week.title}
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full ${
                      weekPercent === 100
                        ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                        : "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900"
                    }`}
                  >
                    {weekPercent}% Completed ({completedCheckpoints}/{totalCheckpoints})
                  </span>
                </div>
              </div>

              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    weekPercent === 100 ? "bg-emerald-500" : "bg-indigo-600"
                  }`}
                  style={{ width: `${weekPercent}%` }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                {week.topics.map((item, idx) => {
                  const isTopicFullyDone = CATEGORIES.every(
                    (cat) => completedMap[keyFor(item, cat)]
                  );

                  return (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                        isTopicFullyDone
                          ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300"
                          : "bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <div className="truncate mr-2">
                        <span className="font-semibold block text-[10px] text-slate-400">
                          {item.subject}
                        </span>
                        <span className="font-medium truncate">{item.topic}</span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                          isTopicFullyDone
                            ? "bg-emerald-200 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300"
                            : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {isTopicFullyDone ? "Done ✓" : "Pending"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}