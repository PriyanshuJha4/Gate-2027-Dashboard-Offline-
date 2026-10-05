// GATE marking scheme + shared types / validation for mock tests.
// Pure TypeScript (no node or browser APIs): the API route and the React components both import it,
// so the numbers shown in the UI and the numbers saved in SQLite always follow the same rules.
//
// GATE marking
//   1-mark MCQ : +1, wrong = -1/3
//   2-mark MCQ : +2, wrong = -2/3
//   NAT / MSQ  : +1 or +2, wrong = 0 (no negative marking, MSQ has no partial marks)
//   Unattempted: 0
//
// Meaning of the stored section numbers
//   marks     = GROSS marks from correct answers   (positive)
//   neg_marks = marks deducted for wrong answers   (stored as a positive number)
//   net       = marks - neg_marks
// mock_tests.score is the NET score, mock_tests.negative_marks is the sum of neg_marks.

export type QType = "mcq1" | "mcq2" | "nat1" | "nat2";

export const QUESTION_TYPES: Record<QType, { label: string; marks: number; negative: number }> = {
  mcq1: { label: "1-mark MCQ", marks: 1, negative: 1 / 3 },
  mcq2: { label: "2-mark MCQ", marks: 2, negative: 2 / 3 },
  nat1: { label: "1-mark NAT/MSQ", marks: 1, negative: 0 },
  nat2: { label: "2-mark NAT/MSQ", marks: 2, negative: 0 },
};

export const GATE_MAX_MARKS = 100;
export const MAX_SECTIONS = 12;
export const MAX_TOPIC_LOSSES = 60;

/** Reasons for losing marks on a topic. `reason` is stored as the key. Unknown keys are still accepted. */
export const LOSS_REASONS: { key: string; label: string }[] = [
  { key: "concept", label: "Concept gap" },
  { key: "silly", label: "Silly mistake" },
  { key: "calculation", label: "Calculation error" },
  { key: "time", label: "Ran out of time" },
  { key: "guess", label: "Wrong guess" },
  { key: "unattempted", label: "Left unattempted" },
  { key: "other", label: "Other" },
];

export function reasonLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return LOSS_REASONS.find((r) => r.key === key)?.label ?? key;
}

/** Presets offered in the form (GATE CS paper: GA + Engineering Maths + Core CS). */
export const GATE_SECTION_PRESET = ["General Aptitude", "Engineering Mathematics", "Core CS"];

/* ------------------------------- types ------------------------------- */

export interface MockSection {
  name: string;
  attempted: number;
  correct: number;
  wrong: number;
  marks: number;
  neg_marks: number;
  time_min: number;
}

export interface MockTopicLoss {
  topic_id: string;
  marks_lost: number;
  reason: string;
}

/** Shape returned by GET /api/mock-tests (old fields are unchanged so DashboardHeader keeps working). */
export interface MockTest {
  id: string;
  test_date: string;
  subject: string;
  test_name: string | null;
  duration_min: number | null;
  negative_marks: number;
  score: number;
  max_score: number;
  sections: MockSection[];
  topic_losses: MockTopicLoss[];
}

/* ------------------------------ arithmetic ------------------------------ */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** "12" for whole numbers, "12.33" otherwise. */
export function fmtMarks(n: number): string {
  const r = round2(Number(n) || 0);
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

/** Negative marks for ONE wrong answer of this question type. */
export function negativeFor(type: QType): number {
  return QUESTION_TYPES[type].negative;
}

export type MixKey = "mcq1_ok" | "mcq1_bad" | "mcq2_ok" | "mcq2_bad" | "nat1_ok" | "nat2_ok" | "nat_bad";
export const MIX_KEYS: MixKey[] = ["mcq1_ok", "mcq1_bad", "mcq2_ok", "mcq2_bad", "nat1_ok", "nat2_ok", "nat_bad"];
export type SectionMix = Partial<Record<MixKey, number | string>>;

const cnt = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

/** Turn "how many questions of each kind were right / wrong" into the numbers stored for a section. */
export function computeSection(mix: SectionMix): Omit<MockSection, "name" | "time_min"> {
  const m1ok = cnt(mix.mcq1_ok);
  const m1bad = cnt(mix.mcq1_bad);
  const m2ok = cnt(mix.mcq2_ok);
  const m2bad = cnt(mix.mcq2_bad);
  const n1ok = cnt(mix.nat1_ok);
  const n2ok = cnt(mix.nat2_ok);
  const natBad = cnt(mix.nat_bad); // wrong NAT/MSQ: counts as attempted + wrong, costs nothing

  const correct = m1ok + m2ok + n1ok + n2ok;
  const wrong = m1bad + m2bad + natBad;
  return {
    attempted: correct + wrong,
    correct,
    wrong,
    marks: round2(m1ok * 1 + m2ok * 2 + n1ok * 1 + n2ok * 2),
    neg_marks: round2(m1bad * negativeFor("mcq1") + m2bad * negativeFor("mcq2")),
  };
}

export function sectionNet(s: Pick<MockSection, "marks" | "neg_marks">): number {
  return round2((Number(s.marks) || 0) - (Number(s.neg_marks) || 0));
}

export function accuracyPct(correct: number, attempted: number): number | null {
  return attempted > 0 ? Math.round((correct / attempted) * 100) : null;
}

export interface SectionTotals {
  attempted: number;
  correct: number;
  wrong: number;
  marks: number;
  neg_marks: number;
  net: number;
  time_min: number;
  accuracy: number | null;
}

export function summarizeSections(sections: MockSection[]): SectionTotals {
  const t = { attempted: 0, correct: 0, wrong: 0, marks: 0, neg_marks: 0, time_min: 0 };
  for (const s of sections) {
    t.attempted += Number(s.attempted) || 0;
    t.correct += Number(s.correct) || 0;
    t.wrong += Number(s.wrong) || 0;
    t.marks += Number(s.marks) || 0;
    t.neg_marks += Number(s.neg_marks) || 0;
    t.time_min += Number(s.time_min) || 0;
  }
  const marks = round2(t.marks);
  const neg = round2(t.neg_marks);
  return {
    ...t,
    marks,
    neg_marks: neg,
    net: round2(marks - neg),
    accuracy: accuracyPct(t.correct, t.attempted),
  };
}

/** Score stored in mock_tests.score when sections exist. Never below 0 (the old API rejected negative scores). */
export function scoreFromSections(sections: MockSection[]): number {
  return Math.max(0, summarizeSections(sections).net);
}

/* ------------------------------ validation ------------------------------ */

export function checkSection(s: MockSection): string | null {
  const name = String(s.name ?? "").trim();
  if (!name) return "Every section needs a name.";
  const label = `Section "${name}"`;
  for (const k of ["attempted", "correct", "wrong", "time_min"] as const) {
    const v = s[k];
    if (!Number.isInteger(v) || v < 0) return `${label}: ${k.replace("_", " ")} must be a whole number, 0 or more.`;
  }
  if (s.correct + s.wrong > s.attempted) return `${label}: correct + wrong cannot be more than attempted.`;
  for (const k of ["marks", "neg_marks"] as const) {
    if (!Number.isFinite(s[k]) || s[k] < 0) return `${label}: ${k.replace("_", " ")} must be 0 or more.`;
  }
  return null;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ParsedMock {
  id: string;
  test_date: string;
  subject: string;
  /** undefined = field not sent, keep what is in the database. null = cleared. */
  test_name?: string | null;
  duration_min?: number | null;
  negative_marks?: number;
  score: number;
  max_score: number;
  /** undefined = not sent, keep stored sections. [] = remove them. */
  sections?: MockSection[];
  topic_losses?: MockTopicLoss[];
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const numOr0 = (v: unknown) => (v === undefined || v === null || v === "" ? 0 : Number(v));

/**
 * Validates and normalises a POST body. Used by the API (authoritative) and by the form (friendly errors).
 * - Old clients that only send {id, test_date, subject, score, max_score} still work exactly as before.
 * - When sections are sent, score and negative_marks are DERIVED from them so the three can never disagree.
 */
export function parseMockPayload(
  body: any,
  opts: { knownTopic?: (id: string) => boolean } = {},
): ParseResult<ParsedMock> {
  if (!body || typeof body !== "object") return fail("Invalid request.");

  const id = String(body.id ?? "").trim();
  if (!id) return fail("ID required");

  const test_date = String(body.test_date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(test_date)) return fail("Pick a valid test date.");

  const subject = String(body.subject ?? "").trim().slice(0, 80) || "Full Mock";

  const max_score = Number(body.max_score);
  if (!Number.isFinite(max_score) || max_score <= 0) return fail("Max score must be greater than 0.");

  let test_name: string | null | undefined;
  if (body.test_name !== undefined) test_name = String(body.test_name ?? "").trim().slice(0, 120) || null;

  let duration_min: number | null | undefined;
  if (body.duration_min !== undefined) {
    if (body.duration_min === null || body.duration_min === "") duration_min = null;
    else {
      const d = Number(body.duration_min);
      if (!Number.isInteger(d) || d < 1 || d > 600) return fail("Duration must be a whole number of minutes (1–600).");
      duration_min = d;
    }
  }

  // ---- sections ----
  let sections: MockSection[] | undefined;
  if (body.sections !== undefined) {
    if (!Array.isArray(body.sections)) return fail("Sections must be a list.");
    if (body.sections.length > MAX_SECTIONS) return fail(`At most ${MAX_SECTIONS} sections per test.`);
    const seen = new Set<string>();
    sections = [];
    for (const raw of body.sections) {
      const s: MockSection = {
        name: String(raw?.name ?? "").trim().slice(0, 60),
        attempted: numOr0(raw?.attempted),
        correct: numOr0(raw?.correct),
        wrong: numOr0(raw?.wrong),
        marks: round2(numOr0(raw?.marks)),
        neg_marks: round2(numOr0(raw?.neg_marks)),
        time_min: numOr0(raw?.time_min),
      };
      const err = checkSection(s);
      if (err) return fail(err);
      const k = s.name.toLowerCase();
      if (seen.has(k)) return fail(`Section "${s.name}" is listed twice.`);
      seen.add(k);
      sections.push(s);
    }
  }

  // ---- score / negative marks ----
  let score: number;
  let negative_marks: number | undefined;
  if (sections && sections.length > 0) {
    score = scoreFromSections(sections);
    negative_marks = summarizeSections(sections).neg_marks;
    if (score > max_score) return fail("Net marks from the sections are more than the max score.");
  } else {
    score = Number(body.score);
    if (body.score === "" || body.score === null || !Number.isFinite(score) || score < 0 || score > max_score) {
      return fail("Invalid score");
    }
    if (body.negative_marks !== undefined && body.negative_marks !== null && body.negative_marks !== "") {
      const n = Number(body.negative_marks);
      if (!Number.isFinite(n) || n < 0) return fail("Negative marks must be 0 or more.");
      negative_marks = round2(n);
    } else if (sections) {
      negative_marks = 0; // sections were cleared, so the old total no longer applies
    }
  }

  // ---- topic losses ----
  let topic_losses: MockTopicLoss[] | undefined;
  if (body.topic_losses !== undefined) {
    if (!Array.isArray(body.topic_losses)) return fail("Topic losses must be a list.");
    if (body.topic_losses.length > MAX_TOPIC_LOSSES) return fail(`At most ${MAX_TOPIC_LOSSES} topic rows per test.`);
    const seen = new Set<string>();
    topic_losses = [];
    for (const raw of body.topic_losses) {
      const topic_id = String(raw?.topic_id ?? "").trim();
      if (!topic_id) return fail("Pick a topic for every topic-loss row.");
      if (opts.knownTopic && !opts.knownTopic(topic_id)) return fail(`Unknown topic: ${topic_id}`);
      if (seen.has(topic_id)) return fail("The same topic is listed twice in topic losses.");
      seen.add(topic_id);
      const marks_lost = round2(Number(raw?.marks_lost));
      if (!Number.isFinite(marks_lost) || marks_lost <= 0) return fail("Marks lost must be more than 0 for every topic row.");
      if (marks_lost > max_score) return fail("Marks lost on one topic cannot be more than the max score.");
      topic_losses.push({ topic_id, marks_lost, reason: String(raw?.reason ?? "").trim().slice(0, 60) });
    }
  }

  return {
    ok: true,
    value: { id, test_date, subject, test_name, duration_min, negative_marks, score, max_score, sections, topic_losses },
  };
}
