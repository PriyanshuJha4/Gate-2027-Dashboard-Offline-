// SINGLE SOURCE OF TRUTH for every syllabus topic.
//
// - `id` is permanent. NEVER change an id once it has been used (it is stored in the database).
//   You can rename `name` / `libName` freely, the ticks follow the id.
// - `name`    : spelling shown in the Syllabus Tracker / Weekly Matrix (old lib/syllabusProgress.ts).
// - `libName` : spelling stored in cards.topic, pdfs.chapter, error_logs.topic (old lib/syllabus.ts).
//               Kept as-is so existing rows and dropdowns keep working.
// - `aliases` : any other spelling that ever appeared (used by the one-time migration + lookups).

export interface Topic {
  id: string;
  subject: string;
  name: string;
  libName: string;
  inTracker: boolean;
  aliases?: string[];
}

export const TOPICS: Topic[] = [
  { id: "c-data-types-and-operators", subject: "C Programming", name: "Data Types & Operators", libName: "Data Types and Operators", inTracker: true },
  { id: "c-control-flow-statements", subject: "C Programming", name: "Control Flow Statements", libName: "Control Flow Statements", inTracker: true },
  { id: "c-functions-and-storage", subject: "C Programming", name: "Functions & Storage", libName: "Functions & storage", inTracker: true },
  { id: "c-arrays-and-pointers", subject: "C Programming", name: "Arrays & Pointers", libName: "Arrays and Pointers", inTracker: true },
  { id: "c-string-in-c-programming", subject: "C Programming", name: "String in C Programming", libName: "String in C Programming", inTracker: true },
  { id: "c-structure-and-union", subject: "C Programming", name: "Structure & Union", libName: "Structure and Union", inTracker: true },
  { id: "c-miscellaneous-topics", subject: "C Programming", name: "Miscellaneous Topics", libName: "Miscellaneous Topics", inTracker: true },
  { id: "ds-introduction-to-dsa", subject: "Data Structures", name: "Introduction to DSA", libName: "Introduction to DSA", inTracker: true },
  { id: "ds-arrays", subject: "Data Structures", name: "Arrays", libName: "Arrays", inTracker: true },
  { id: "ds-linked-list", subject: "Data Structures", name: "Linked List", libName: "Linked List", inTracker: true },
  { id: "ds-stack-and-queues", subject: "Data Structures", name: "Stack & Queues", libName: "Stack and Queues", inTracker: true },
  { id: "ds-tree", subject: "Data Structures", name: "Tree", libName: "Tree", inTracker: true },
  { id: "ds-graphs", subject: "Data Structures", name: "Graphs", libName: "Graphs", inTracker: true },
  { id: "ds-hashing", subject: "Data Structures", name: "Hashing", libName: "Hashing", inTracker: true },
  { id: "coa-introduction-of-coa", subject: "COA", name: "Introduction of COA", libName: "Introduction of COA", inTracker: true },
  { id: "coa-machine-instruction-and-addressing-modes", subject: "COA", name: "Machine Instruction & Addressing Modes", libName: "Machine Instruction & Addressing Modes", inTracker: true },
  { id: "coa-floating-point", subject: "COA", name: "Floating Point", libName: "Floating Point", inTracker: true },
  { id: "coa-alu-and-control-unit", subject: "COA", name: "ALU & Control Unit", libName: "ALU & Control Unit", inTracker: true },
  { id: "coa-instruction-pipelining", subject: "COA", name: "Instruction Pipelining", libName: "Instruction Pipelining", inTracker: true },
  { id: "coa-cache-memory", subject: "COA", name: "Cache Memory", libName: "Cache Memory", inTracker: true },
  { id: "coa-secondary-memory-and-i-o-interface", subject: "COA", name: "Secondary Memory & I/O Interface", libName: "Secondary Memory & IO Interface", inTracker: true },
  { id: "algo-analysis-of-algorithm", subject: "Algorithms", name: "Analysis of Algorithm", libName: "Analysis of Algorithm", inTracker: true },
  { id: "algo-design-strategies", subject: "Algorithms", name: "Design Strategies", libName: "Design Strategies", inTracker: true },
  { id: "algo-greedy-method", subject: "Algorithms", name: "Greedy Method", libName: "Greedy Method", inTracker: true },
  { id: "algo-dynamic-programming", subject: "Algorithms", name: "Dynamic Programming", libName: "Dynamic Programming", inTracker: true },
  { id: "algo-graph-algorithms", subject: "Algorithms", name: "Graph Algorithms", libName: "Graph Algorithms", inTracker: true },
  { id: "algo-heap-algorithms", subject: "Algorithms", name: "Heap Algorithms", libName: "Heap Algorithms", inTracker: true },
  { id: "algo-backtracking-and-branch-and-bound", subject: "Algorithms", name: "Backtracking & Branch & Bound", libName: "Backtracking & Branch Bound", inTracker: true, aliases: ["Backtracking & Branch Bound"] },
  { id: "dl-logic-gates", subject: "Digital Logic", name: "Logic Gates", libName: "Logic Gates", inTracker: true },
  { id: "dl-minimization-of-boolean-function", subject: "Digital Logic", name: "Minimization of Boolean Function", libName: "Minimization of Boolean Function", inTracker: true },
  { id: "dl-combinational-circuits", subject: "Digital Logic", name: "Combinational Circuits", libName: "Combinational Circuits", inTracker: true },
  { id: "dl-sequential-logic-circuits", subject: "Digital Logic", name: "Sequential Logic Circuits", libName: "Sequential Logic Circuits", inTracker: true },
  { id: "dl-number-system", subject: "Digital Logic", name: "Number System", libName: "Number System", inTracker: true },
  { id: "dm-graph-theory", subject: "Discrete Mathematics", name: "Graph Theory", libName: "Graph Theory", inTracker: true },
  { id: "dm-mathematical-logic", subject: "Discrete Mathematics", name: "Mathematical Logic", libName: "Mathematical logic", inTracker: true },
  { id: "dm-set-theory", subject: "Discrete Mathematics", name: "Set Theory", libName: "Set Theory", inTracker: true },
  { id: "dm-combinatorics", subject: "Discrete Mathematics", name: "Combinatorics", libName: "Combinatorics", inTracker: true },
  { id: "em-probability-and-statistics", subject: "Engineering Mathematics", name: "Probability & Statistics", libName: "Probability and statistics", inTracker: true },
  { id: "em-single-variable-calculus", subject: "Engineering Mathematics", name: "Single Variable Calculus", libName: "Single Variable Calculus", inTracker: true },
  { id: "em-linear-algebra", subject: "Engineering Mathematics", name: "Linear Algebra", libName: "Linear Algebra", inTracker: true },
  { id: "apt-verbal-aptitude", subject: "Aptitude", name: "Verbal Aptitude", libName: "Verbal Aptitude", inTracker: true },
  { id: "apt-clocks-and-calendars", subject: "Aptitude", name: "Quantitative Aptitude — Clocks & Calendars", libName: "Quantitative Aptitude: Clocks & Calendars", inTracker: true, aliases: ["Clocks & Calendars"] },
  { id: "apt-percentages-and-profit-loss", subject: "Aptitude", name: "Quantitative Aptitude — Percentages & Profit/Loss", libName: "Quantitative Aptitude: Percentages & Profit loss", inTracker: true, aliases: ["Percentages & Profit/Loss"] },
  { id: "apt-numbers-and-counting-theory", subject: "Aptitude", name: "Quantitative Aptitude — Numbers & Counting Theory", libName: "Quantitative Aptitude: Numbers & Counting Theory", inTracker: true, aliases: ["Numbers & Counting Theory"] },
  { id: "apt-time-and-work", subject: "Aptitude", name: "Quantitative Aptitude — Time & Work", libName: "Quantitative Aptitude: Time and Work", inTracker: true, aliases: ["Time & Work"] },
  { id: "apt-time-and-distance", subject: "Aptitude", name: "Quantitative Aptitude — Time & Distance", libName: "Quantitative Aptitude: Time and Distance", inTracker: true, aliases: ["Time & Distance"] },
  { id: "apt-data-interpretation", subject: "Aptitude", name: "Quantitative Aptitude — Data Interpretation", libName: "Quantitative Aptitude: Data Interpretation", inTracker: true, aliases: ["Data Interpretation"] },
  { id: "apt-formation-of-image", subject: "Aptitude", name: "Spatial Aptitude — Formation of Image", libName: "Spatial Aptitude: Formation of Image", inTracker: true },
  { id: "apt-arrangement-and-problem-solving", subject: "Aptitude", name: "Analytical Aptitude — Arrangement & Problem Solving", libName: "Analytical Aptitude: Arrangement & Problem Solving", inTracker: true },
  { id: "apt-directions-and-blood-relations", subject: "Aptitude", name: "Analytical Aptitude — Directions & Blood Relations", libName: "Analytical Aptitude: Directions & Blood Relations", inTracker: true },
  { id: "apt-venn-diagrams-and-syllogism", subject: "Aptitude", name: "Analytical Aptitude — Venn Diagrams & Syllogism", libName: "Analytical Aptitude: Venn Diagrams & Syllogism", inTracker: true },
  { id: "toc-finite-automata", subject: "TOC", name: "Finite Automata", libName: "Finite Automata", inTracker: true },
  { id: "toc-push-down-automata", subject: "TOC", name: "Push Down Automata", libName: "Push Down Automata", inTracker: true },
  { id: "toc-turing-machine", subject: "TOC", name: "Turing Machine", libName: "Turing Machine", inTracker: true },
  { id: "toc-decidability", subject: "TOC", name: "Decidability", libName: "Decidability", inTracker: true },
  { id: "dbms-fds-and-normalization", subject: "DBMS", name: "FD's & Normalization", libName: "FD's & Normalization", inTracker: true },
  { id: "dbms-transaction-and-concurrency-control", subject: "DBMS", name: "Transaction & Concurrency Control", libName: "Transaction & Concurrency Control", inTracker: true },
  { id: "dbms-er-model", subject: "DBMS", name: "ER Model", libName: "ER Model", inTracker: true },
  { id: "dbms-query-language", subject: "DBMS", name: "Query Language", libName: "Query Language", inTracker: true },
  { id: "dbms-file-organization-and-indexing", subject: "DBMS", name: "File Organization & Indexing", libName: "File Org & Indexing", inTracker: true, aliases: ["File Org & Indexing"] },
  { id: "cn-ipv4-addressing", subject: "Computer Networks", name: "IPv4 Addressing", libName: "IPv4 Addressing", inTracker: true },
  { id: "cn-error-control", subject: "Computer Networks", name: "Error Control", libName: "Error Control", inTracker: true },
  { id: "cn-flow-control", subject: "Computer Networks", name: "Flow Control", libName: "Flow Control", inTracker: true },
  { id: "cn-ipv4-header-and-fragmentation", subject: "Computer Networks", name: "IPv4 Header & Fragmentation", libName: "IPv4 Header & Fragmentation", inTracker: true },
  { id: "cn-tcp-and-udp", subject: "Computer Networks", name: "TCP & UDP", libName: "TCP & UDP", inTracker: true },
  { id: "cn-medium-access-control", subject: "Computer Networks", name: "Medium Access Control", libName: "Medium Access Control", inTracker: true },
  { id: "cn-switching", subject: "Computer Networks", name: "Switching", libName: "Switching", inTracker: true },
  { id: "cn-application-layer-protocol", subject: "Computer Networks", name: "Application Layer Protocol", libName: "Application Layer Protocol", inTracker: true },
  { id: "cn-ip-support-protocol", subject: "Computer Networks", name: "IP Support Protocol", libName: "IP Support Protocol", inTracker: true },
  { id: "cn-osi-and-tcp-ip-protocol", subject: "Computer Networks", name: "OSI & TCP/IP Protocol", libName: "OSI and TCP/IP Protocol", inTracker: true },
  { id: "cd-lexical-analysis-and-syntax-analysis", subject: "Compiler Design", name: "Lexical Analysis & Syntax Analysis", libName: "Lexical Analysis & Syntax Analysis", inTracker: true },
  { id: "cd-syntax-directed-translation", subject: "Compiler Design", name: "Syntax Directed Translation", libName: "Syntax Directed Translation", inTracker: true },
  { id: "cd-intermediate-code-and-code-optimization", subject: "Compiler Design", name: "Intermediate Code & Code Optimization", libName: "Intermediate Code & Code Optimization", inTracker: true },
  { id: "os-introduction-and-background", subject: "Operating Systems", name: "Introduction & Background", libName: "Introduction and background", inTracker: true },
  { id: "os-process-management", subject: "Operating Systems", name: "Process Management", libName: "Process Management", inTracker: true },
  { id: "os-cpu-scheduling", subject: "Operating Systems", name: "CPU Scheduling", libName: "CPU Scheduling", inTracker: true },
  { id: "os-process-synchronization", subject: "Operating Systems", name: "Process Synchronization", libName: "Process Synchronization", inTracker: true },
  { id: "os-deadlock", subject: "Operating Systems", name: "Deadlock", libName: "Dead Lock", inTracker: true },
  { id: "os-memory-management", subject: "Operating Systems", name: "Memory Management", libName: "Memory Management", inTracker: true },
  { id: "os-file-system-and-device-management", subject: "Operating Systems", name: "File System & Device Management", libName: "File System & Device Management", inTracker: true },
  { id: "os-system-calls-and-threads", subject: "Operating Systems", name: "System Calls & Threads", libName: "System Calls and Threads", inTracker: true },
  { id: "os-revision", subject: "Operating Systems", name: "Revision", libName: "Revision", inTracker: false },
];

/** Lower-case, "&" -> "and", drop every non-alphanumeric char:
 *  "Dead Lock" == "Deadlock", "Time & Work" == "Time and Work", "Profit/Loss" == "Profit loss". */
export function normTopic(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

export const TOPIC_BY_ID: Map<string, Topic> = new Map(TOPICS.map((t) => [t.id, t]));

const BY_NORM: Map<string, Topic[]> = new Map();
for (const t of TOPICS) {
  for (const n of [t.name, t.libName, ...(t.aliases || [])]) {
    const k = normTopic(n);
    const list = BY_NORM.get(k) || [];
    if (!list.includes(t)) list.push(t);
    BY_NORM.set(k, list);
  }
}

/** Find a topic id from ANY known spelling. Pass `subject` to disambiguate names shared by two subjects. */
export function topicIdByName(name: string | null | undefined, subject?: string | null): string | null {
  if (!name) return null;
  const list = BY_NORM.get(normTopic(name));
  if (!list || list.length === 0) return null;
  if (list.length === 1) return list[0].id;
  const hit = subject ? list.find((t) => t.subject === subject) : undefined;
  return (hit || list[0]).id;
}

export function topicById(id: string | null | undefined): Topic | undefined {
  return id ? TOPIC_BY_ID.get(id) : undefined;
}

/** Name to show in the tracker. Falls back to the id when unknown. */
export function topicName(id: string): string {
  return TOPIC_BY_ID.get(id)?.name ?? id;
}

/** Grouped by subject, in syllabus order. */
export function topicsBySubject(filter: (t: Topic) => boolean = () => true) {
  const out: { subject: string; topics: Topic[] }[] = [];
  for (const t of TOPICS) {
    if (!filter(t)) continue;
    let g = out.find((x) => x.subject === t.subject);
    if (!g) out.push((g = { subject: t.subject, topics: [] }));
    g.topics.push(t);
  }
  return out;
}

/** Progress key stored in syllabus_progress.topic_key:  "<topicId>::<categoryKey>" */
export function progressKey(topicId: string, categoryKey: string) {
  return `${topicId}::${categoryKey}`;
}

/** Turn an OLD key ("Data Types and Operators::short_notes") into the new one, or null if unknown. */
export function migrateProgressKey(oldKey: string): string | null {
  const i = oldKey.lastIndexOf("::");
  if (i < 0) return null;
  const id = topicIdByName(oldKey.slice(0, i));
  return id ? `${id}::${oldKey.slice(i + 2)}` : null;
}
