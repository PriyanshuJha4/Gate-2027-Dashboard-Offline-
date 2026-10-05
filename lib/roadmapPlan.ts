import { PLAN_START, PLAN_END, SYLLABUS_END, REVISION_END, isoToLocalDate } from "@/lib/milestones";
export interface DayPlan {
  date: string; // YYYY-MM-DD
  displayDate: string;
  dayName: string;
  subject: string;
  topic: string;
  phase: "SYLLABUS" | "REVISION" | "BLANK";
  tasks: {
    classNotes: boolean;
    dpp: boolean;
    pyqs: boolean;
    mockTest: boolean;
    errorLog: boolean;
    shortNotes: boolean;
  };
}

export const ALL_SYLLABUS_TOPICS: { subject: string; topic: string }[] = [
  // C Programming
  { subject: "C Programming", topic: "Data Types & Operators" },
  { subject: "C Programming", topic: "Control Flow Statements" },
  { subject: "C Programming", topic: "Functions & Storage" },
  { subject: "C Programming", topic: "Arrays and Pointers" },
  { subject: "C Programming", topic: "String in C Programming" },
  { subject: "C Programming", topic: "Structure and Union" },
  { subject: "C Programming", topic: "Miscellaneous Topics" },

  // Data Structures
  { subject: "Data Structures", topic: "Introduction to DSA & Arrays" },
  { subject: "Data Structures", topic: "Linked List" },
  { subject: "Data Structures", topic: "Stack and Queues" },
  { subject: "Data Structures", topic: "Trees (Binary, BST, AVL)" },
  { subject: "Data Structures", topic: "Graphs Traversals" },
  { subject: "Data Structures", topic: "Hashing Techniques" },

  // Algorithms
  { subject: "Algorithms", topic: "Asymptotic Analysis & Recurrences" },
  { subject: "Algorithms", topic: "Divide & Conquer, Design Strategies" },
  { subject: "Algorithms", topic: "Greedy Method" },
  { subject: "Algorithms", topic: "Dynamic Programming" },
  { subject: "Algorithms", topic: "Graph Algorithms (MST, Shortest Path)" },
  { subject: "Algorithms", topic: "Heap & Sorting Algorithms" },
  { subject: "Algorithms", topic: "Backtracking & Branch and Bound" },

  // COA
  { subject: "COA", topic: "Machine Instructions & Addressing Modes" },
  { subject: "COA", topic: "Floating Point Representation (IEEE 754)" },
  { subject: "COA", topic: "ALU & Hardwired/Microprogrammed Control" },
  { subject: "COA", topic: "Instruction Pipelining & Hazards" },
  { subject: "COA", topic: "Cache Memory & Mapping Techniques" },
  { subject: "COA", topic: "Secondary Memory & IO Interface" },

  // Digital Logic
  { subject: "Digital Logic", topic: "Logic Gates & Minimization (K-Map)" },
  { subject: "Digital Logic", topic: "Combinational Circuits (Mux, Decoders)" },
  { subject: "Digital Logic", topic: "Sequential Logic (Flip-Flops, Counters)" },
  { subject: "Digital Logic", topic: "Number Systems & Base Conversions" },

  // Discrete Mathematics
  { subject: "Discrete Mathematics", topic: "Mathematical Logic & Proofs" },
  { subject: "Discrete Mathematics", topic: "Set Theory, Relations & Functions" },
  { subject: "Discrete Mathematics", topic: "Combinatorics & Generating Functions" },
  { subject: "Discrete Mathematics", topic: "Graph Theory (Coloring, Matching, Trees)" },

  // Engineering Mathematics
  { subject: "Engineering Mathematics", topic: "Linear Algebra (Matrices, Eigenvalues)" },
  { subject: "Engineering Mathematics", topic: "Single Variable Calculus & Limits" },
  { subject: "Engineering Mathematics", topic: "Probability, Random Variables & Distributions" },

  // Aptitude
  { subject: "Aptitude", topic: "Quantitative: Percentages, Profit-Loss & Ratio" },
  { subject: "Aptitude", topic: "Quantitative: Numbers & Counting Theory" },
  { subject: "Aptitude", topic: "Quantitative: Time, Work & Distance" },
  { subject: "Aptitude", topic: "Quantitative: Clocks, Calendars & Data Interpretation" },
  { subject: "Aptitude", topic: "Analytical: Deductive Logic & Syllogism" },
  { subject: "Aptitude", topic: "Spatial & Verbal Aptitude" },

  // TOC
  { subject: "TOC", topic: "DFA, NFA & Regular Expressions" },
  { subject: "TOC", topic: "Context Free Grammars & Push Down Automata" },
  { subject: "TOC", topic: "Turing Machine Models" },
  { subject: "TOC", topic: "Decidability & Reducibility" },

  // DBMS
  { subject: "DBMS", topic: "ER Model & Relational Algebra" },
  { subject: "DBMS", topic: "SQL Queries & Views" },
  { subject: "DBMS", topic: "Functional Dependencies & Normalization" },
  { subject: "DBMS", topic: "Transactions, Concurrency & Locking" },
  { subject: "DBMS", topic: "File Organization & B/B+ Trees Indexing" },

  // Operating Systems
  { subject: "Operating Systems", topic: "Processes, Threads & System Calls" },
  { subject: "Operating Systems", topic: "CPU Scheduling Algorithms" },
  { subject: "Operating Systems", topic: "Process Synchronization & Semaphores" },
  { subject: "Operating Systems", topic: "Deadlocks Detection & Prevention" },
  { subject: "Operating Systems", topic: "Memory Management & Virtual Memory" },
  { subject: "Operating Systems", topic: "File Systems & Disk Scheduling" },

  // Computer Networks
  { subject: "Computer Networks", topic: "IPv4/IPv6 Addressing & Subnetting" },
  { subject: "Computer Networks", topic: "Packet Fragmentation & Framing" },
  { subject: "Computer Networks", topic: "Flow & Error Control (Stop & Wait, Go-Back-N)" },
  { subject: "Computer Networks", topic: "Medium Access Control (CSMA/CD, Aloha)" },
  { subject: "Computer Networks", topic: "Routing Protocols & Switching" },
  { subject: "Computer Networks", topic: "TCP & UDP Sockets, Congestion Control" },
  { subject: "Computer Networks", topic: "Application Protocols (DNS, HTTP, SMTP)" },

  // Compiler Design
  { subject: "Compiler Design", topic: "Lexical Analysis & Parsing" },
  { subject: "Compiler Design", topic: "Syntax Directed Translation (SDT)" },
  { subject: "Compiler Design", topic: "Intermediate Code & Code Optimization" },
];

export function generateDailySchedule(): DayPlan[] {
  const schedule: DayPlan[] = [];
  // Dates come from lib/milestones.ts (single source of truth)
  const start = isoToLocalDate(PLAN_START);
  const end = isoToLocalDate(PLAN_END);

  const syllabusDeadline = isoToLocalDate(SYLLABUS_END);
  const revisionDeadline = isoToLocalDate(REVISION_END);

  // Sep 27 se Nov 30 ke beech total days = 65 days
  // 64 syllabus items ko 65 dino me evenly map kiya gaya hai
  let topicIdx = 0;
  let revIdx = 0;

  const current = new Date(start);

  while (current <= end) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");
    const day = String(current.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;
    const isSunday = current.getDay() === 0;

    let phase: "SYLLABUS" | "REVISION" | "BLANK" = "BLANK";
    let subject = "";
    let topic = "";

    if (current <= syllabusDeadline) {
      phase = "SYLLABUS";
      const item = ALL_SYLLABUS_TOPICS[topicIdx % ALL_SYLLABUS_TOPICS.length];
      subject = item.subject;
      topic = item.topic;
      topicIdx++;
    } else if (current <= revisionDeadline) {
      phase = "REVISION";
      const item = ALL_SYLLABUS_TOPICS[revIdx % ALL_SYLLABUS_TOPICS.length];
      subject = `[Revision] ${item.subject}`;
      topic = `${item.topic} + PYQ Review`;
      revIdx++;
    } else {
      phase = "BLANK";
      subject = "—";
      topic = "Final Buffer / Self Tuning / Exam Window";
    }

    schedule.push({
      date: dateStr,
      displayDate: current.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      dayName: current.toLocaleDateString("en-US", { weekday: "short" }),
      subject,
      topic,
      phase,
      tasks: {
        classNotes: false,
        dpp: false,
        pyqs: false,
        mockTest: isSunday,
        errorLog: false,
        shortNotes: false,
      },
    });

    current.setDate(current.getDate() + 1);
  }

  return schedule;
}