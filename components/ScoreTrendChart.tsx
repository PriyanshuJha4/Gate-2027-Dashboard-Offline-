"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import MockDetailDialog from "@/components/mock/MockDetailDialog";
import { topicsBySubject } from "@/lib/topics";
import {
  LOSS_REASONS,
  GATE_SECTION_PRESET,
  GATE_MAX_MARKS,
  MAX_SECTIONS,
  MIX_KEYS,
  QUESTION_TYPES,
  computeSection,
  fmtMarks,
  parseMockPayload,
  summarizeSections,
  type MixKey,
  type MockSection,
  type MockTest,
} from "@/lib/mockScoring";

/* ----------------------------- form model ----------------------------- */

const INPUT =
  "w-full border dark:border-slate-700 dark:bg-slate-950 dark:text-white rounded-lg px-3 py-2 text-sm outline-none";
const LABEL = "block text-xs font-medium text-slate-500 mb-1";

const MIX_LABEL: Record<MixKey, string> = {
  mcq1_ok: `${QUESTION_TYPES.mcq1.label} ✓`,
  mcq1_bad: `${QUESTION_TYPES.mcq1.label} ✗ (−1/3)`,
  mcq2_ok: `${QUESTION_TYPES.mcq2.label} ✓`,
  mcq2_bad: `${QUESTION_TYPES.mcq2.label} ✗ (−2/3)`,
  nat1_ok: `${QUESTION_TYPES.nat1.label} ✓`,
  nat2_ok: `${QUESTION_TYPES.nat2.label} ✓`,
  nat_bad: "NAT/MSQ ✗ (no negative)",
};

type MixState = Record<MixKey, string>;
const emptyMix = (): MixState =>
  Object.fromEntries(MIX_KEYS.map((k) => [k, ""])) as MixState;

interface SectionRow {
  key: string;
  name: string;
  correct: string;
  wrong: string;
  marks: string;
  neg_marks: string;
  time_min: string;
  calcOpen: boolean;
  mix: MixState;
}
interface LossRow {
  key: string;
  topic_id: string;
  marks_lost: string;
  reason: string;
}
interface FormState {
  test_name: string;
  test_date: string;
  subject: string;
  duration_min: string;
  max_score: string;
  score: string;
  sections: SectionRow[];
  losses: LossRow[];
}

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const emptySection = (name = ""): SectionRow => ({
  key: nextKey(),
  name,
  correct: "",
  wrong: "",
  marks: "",
  neg_marks: "",
  time_min: "",
  calcOpen: false,
  mix: emptyMix(),
});
const emptyLoss = (): LossRow => ({ key: nextKey(), topic_id: "", marks_lost: "", reason: "concept" });

function emptyForm(): FormState {
  return {
    test_name: "",
    test_date: todayStr(),
    subject: "",
    duration_min: "180",
    max_score: String(GATE_MAX_MARKS),
    score: "",
    sections: [],
    losses: [],
  };
}

function testToForm(t: MockTest): FormState {
  return {
    test_name: t.test_name || "",
    test_date: t.test_date,
    subject: t.subject || "",
    duration_min: t.duration_min ? String(t.duration_min) : "",
    max_score: String(t.max_score),
    score: String(t.score),
    sections: t.sections.map((s) => ({
      key: nextKey(),
      name: s.name,
      correct: String(s.correct),
      wrong: String(s.wrong),
      marks: String(s.marks),
      neg_marks: String(s.neg_marks),
      time_min: String(s.time_min),
      calcOpen: false,
      mix: emptyMix(),
    })),
    losses: t.topic_losses.map((l) => ({
      key: nextKey(),
      topic_id: l.topic_id,
      marks_lost: String(l.marks_lost),
      reason: l.reason,
    })),
  };
}

const num = (s: string) => (s.trim() === "" ? 0 : Number(s));

function rowToSection(r: SectionRow): MockSection {
  const correct = num(r.correct);
  const wrong = num(r.wrong);
  return {
    name: r.name.trim(),
    attempted: correct + wrong, // attempted is always right + wrong
    correct,
    wrong,
    marks: num(r.marks),
    neg_marks: num(r.neg_marks),
    time_min: num(r.time_min),
  };
}

const rowIsBlank = (r: SectionRow) =>
  !r.name.trim() && !r.correct && !r.wrong && !r.marks && !r.neg_marks && !r.time_min;

/** Body for POST /api/mock-tests. Always sends sections + topic_losses so an edit can also clear them. */
function formToBody(f: FormState, id: string) {
  return {
    id,
    test_date: f.test_date,
    subject: f.subject.trim() || "Full Mock",
    test_name: f.test_name,
    duration_min: f.duration_min.trim() === "" ? null : Number(f.duration_min),
    max_score: f.max_score.trim() === "" ? GATE_MAX_MARKS : Number(f.max_score),
    score: f.score.trim() === "" ? NaN : Number(f.score),
    sections: f.sections.filter((r) => !rowIsBlank(r)).map(rowToSection),
    topic_losses: f.losses
      .filter((l) => l.topic_id || l.marks_lost.trim() !== "")
      .map((l) => ({ topic_id: l.topic_id, marks_lost: Number(l.marks_lost), reason: l.reason })),
  };
}

const TOPIC_GROUPS = topicsBySubject();

/* ------------------------------ form UI ------------------------------ */

function MockTestForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  submitLabel,
  error,
  busy,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitLabel: string;
  error: string | null;
  busy: boolean;
}) {
  const sections = useMemo(
    () => form.sections.filter((r) => !rowIsBlank(r)).map(rowToSection),
    [form.sections],
  );
  const hasSections = sections.length > 0; // blank rows do not count
  const totals = useMemo(() => summarizeSections(sections), [sections]);
  const derivedScore = Math.max(0, totals.net);

  const patch = (p: Partial<FormState>) => setForm({ ...form, ...p });
  const updSection = (key: string, p: Partial<SectionRow>) =>
    patch({ sections: form.sections.map((r) => (r.key === key ? { ...r, ...p } : r)) });
  const updLoss = (key: string, p: Partial<LossRow>) =>
    patch({ losses: form.losses.map((r) => (r.key === key ? { ...r, ...p } : r)) });

  function applyMix(r: SectionRow) {
    const c = computeSection(r.mix);
    updSection(r.key, {
      correct: String(c.correct),
      wrong: String(c.wrong),
      marks: String(c.marks),
      neg_marks: String(c.neg_marks),
      calcOpen: false,
    });
  }

  return (
    <div className="space-y-5">
      {/* basics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className={LABEL}>Test Name</label>
          <input
            placeholder="e.g. Made Easy FLT-3"
            className={INPUT}
            value={form.test_name}
            onChange={(e) => patch({ test_name: e.target.value })}
          />
        </div>
        <div>
          <label className={LABEL}>Test Date</label>
          <input
            type="date"
            className={INPUT}
            value={form.test_date}
            onChange={(e) => patch({ test_date: e.target.value })}
          />
        </div>
        <div>
          <label className={LABEL}>Subject / Type</label>
          <input
            placeholder="Full Mock, or e.g. Operating Systems"
            className={INPUT}
            value={form.subject}
            onChange={(e) => patch({ subject: e.target.value })}
          />
        </div>
        <div>
          <label className={LABEL}>Duration (min)</label>
          <input
            type="number"
            min={1}
            placeholder="180"
            className={INPUT}
            value={form.duration_min}
            onChange={(e) => patch({ duration_min: e.target.value })}
          />
        </div>
        <div>
          <label className={LABEL}>Total / Max Score</label>
          <input
            type="number"
            placeholder="100"
            className={INPUT}
            value={form.max_score}
            onChange={(e) => patch({ max_score: e.target.value })}
          />
        </div>
        <div>
          <label className={LABEL}>
            Score Obtained {hasSections && <span className="text-indigo-500">(auto from sections)</span>}
          </label>
          <input
            type="number"
            placeholder="e.g. 65"
            disabled={hasSections}
            className={`${INPUT} ${hasSections ? "opacity-70 cursor-not-allowed" : ""}`}
            value={hasSections ? String(derivedScore) : form.score}
            onChange={(e) => patch({ score: e.target.value })}
          />
        </div>
      </div>

      {/* sections */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Sections</h4>
            <p className="text-xs text-slate-400">
              Optional. Marks = marks from correct answers, Negative = deducted for wrong answers.
            </p>
          </div>
          <div className="flex gap-2">
            {!hasSections && (
              <button
                type="button"
                onClick={() => patch({ sections: GATE_SECTION_PRESET.map((n) => emptySection(n)) })}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                GATE layout
              </button>
            )}
            <button
              type="button"
              disabled={form.sections.length >= MAX_SECTIONS}
              onClick={() => patch({ sections: [...form.sections, emptySection()] })}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 cursor-pointer disabled:opacity-50"
            >
              + Add section
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {form.sections.map((r) => {
            const s = rowToSection(r);
            return (
              <div key={r.key} className="rounded-xl border dark:border-slate-800 p-3 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 items-end">
                  <div className="col-span-2">
                    <label className={LABEL}>Section</label>
                    <input
                      className={INPUT}
                      placeholder="e.g. Core CS"
                      value={r.name}
                      onChange={(e) => updSection(r.key, { name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Correct</label>
                    <input
                      type="number"
                      min={0}
                      className={INPUT}
                      value={r.correct}
                      onChange={(e) => updSection(r.key, { correct: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Wrong</label>
                    <input
                      type="number"
                      min={0}
                      className={INPUT}
                      value={r.wrong}
                      onChange={(e) => updSection(r.key, { wrong: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Marks</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className={INPUT}
                      value={r.marks}
                      onChange={(e) => updSection(r.key, { marks: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Negative</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className={INPUT}
                      value={r.neg_marks}
                      onChange={(e) => updSection(r.key, { neg_marks: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Time (min)</label>
                    <input
                      type="number"
                      min={0}
                      className={INPUT}
                      value={r.time_min}
                      onChange={(e) => updSection(r.key, { time_min: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    Attempted {s.attempted} · Net{" "}
                    <b className="text-slate-700 dark:text-slate-200">{fmtMarks(s.marks - s.neg_marks)}</b>
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updSection(r.key, { calcOpen: !r.calcOpen })}
                      className="px-2.5 py-1 rounded-md border dark:border-slate-700 cursor-pointer"
                    >
                      {r.calcOpen ? "Hide calculator" : "Calculate marks"}
                    </button>
                    <button
                      type="button"
                      onClick={() => patch({ sections: form.sections.filter((x) => x.key !== r.key) })}
                      className="px-2.5 py-1 rounded-md bg-red-50 dark:bg-red-950 text-red-600 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {r.calcOpen && (
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-3 space-y-3">
                    <p className="text-xs text-slate-400">
                      Enter how many questions of each kind you got right / wrong. GATE marking is applied:
                      1-mark MCQ wrong −1/3, 2-mark MCQ wrong −2/3, NAT/MSQ no negative.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {MIX_KEYS.map((k) => (
                        <div key={k}>
                          <label className="block text-[11px] text-slate-500 mb-1">{MIX_LABEL[k]}</label>
                          <input
                            type="number"
                            min={0}
                            className={INPUT}
                            value={r.mix[k]}
                            onChange={(e) => updSection(r.key, { mix: { ...r.mix, [k]: e.target.value } })}
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => applyMix(r)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium cursor-pointer"
                    >
                      Fill correct / wrong / marks / negative
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {hasSections && (
          <p className="mt-3 text-xs text-slate-500">
            Total: attempted {totals.attempted} · correct {totals.correct} · wrong {totals.wrong} · marks{" "}
            {fmtMarks(totals.marks)} · negative −{fmtMarks(totals.neg_marks)} ·{" "}
            <b className="text-slate-700 dark:text-slate-200">net {fmtMarks(totals.net)}</b> · {totals.time_min} min
          </p>
        )}
      </div>

      {/* topic losses */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Topic-wise marks lost</h4>
            <p className="text-xs text-slate-400">Optional. Which topics cost you marks, and why.</p>
          </div>
          <button
            type="button"
            onClick={() => patch({ losses: [...form.losses, emptyLoss()] })}
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 cursor-pointer"
          >
            + Add topic
          </button>
        </div>

        <div className="space-y-2">
          {form.losses.map((l) => (
            <div key={l.key} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
              <div className="col-span-2 md:col-span-6">
                <label className={LABEL}>Topic</label>
                <select
                  className={INPUT}
                  value={l.topic_id}
                  onChange={(e) => updLoss(l.key, { topic_id: e.target.value })}
                >
                  <option value="">Select a topic…</option>
                  {TOPIC_GROUPS.map((g) => (
                    <optgroup key={g.subject} label={g.subject}>
                      {g.topics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={LABEL}>Marks lost</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  className={INPUT}
                  value={l.marks_lost}
                  onChange={(e) => updLoss(l.key, { marks_lost: e.target.value })}
                />
              </div>
              <div className="md:col-span-3">
                <label className={LABEL}>Reason</label>
                <select className={INPUT} value={l.reason} onChange={(e) => updLoss(l.key, { reason: e.target.value })}>
                  {LOSS_REASONS.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-1">
                <button
                  type="button"
                  aria-label="Remove topic row"
                  onClick={() => patch({ losses: form.losses.filter((x) => x.key !== l.key) })}
                  className="h-9 w-full rounded-lg bg-red-50 dark:bg-red-950 text-red-600 cursor-pointer"
                >
                  &minus;
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-3.5 py-1.5 text-sm rounded-lg border cursor-pointer">
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-500 cursor-pointer disabled:opacity-60"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ main view ------------------------------ */

export default function ScoreTrendChart() {
  const [tests, setTests] = useState<MockTest[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [editError, setEditError] = useState<string | null>(null);

  const [detailId, setDetailId] = useState<string | null>(null);

  const loadTests = useCallback(async () => {
    try {
      const res = await fetch("/api/mock-tests");
      const data = await res.json();
      if (Array.isArray(data)) {
        setTests(
          data.map((t: any) => ({
            ...t,
            test_name: t.test_name ?? null,
            duration_min: t.duration_min ?? null,
            negative_marks: Number(t.negative_marks) || 0,
            sections: Array.isArray(t.sections) ? t.sections : [],
            topic_losses: Array.isArray(t.topic_losses) ? t.topic_losses : [],
          })),
        );
      }
    } catch (e) {
      console.error("Failed to load mock tests from DB", e);
    }
  }, []);

  useEffect(() => {
    loadTests();
  }, [loadTests]);

  /** Validates with the same rules as the server, then POSTs. Returns an error message or null. */
  async function save(f: FormState, id: string): Promise<string | null> {
    const body = formToBody(f, id);
    const check = parseMockPayload(body);
    if (!check.ok) {
      return check.error === "Invalid score" ? "Enter the score, or add sections so it can be calculated." : check.error;
    }
    try {
      const res = await fetch("/api/mock-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        return j?.error || "Could not save the test.";
      }
      await loadTests();
      return null;
    } catch (e) {
      console.error("Failed to save test", e);
      return "Could not reach the server.";
    }
  }

  async function addTest() {
    setSaving(true);
    setFormError(null);
    const err = await save(form, Date.now().toString());
    setSaving(false);
    if (err) return setFormError(err);
    setForm(emptyForm());
  }

  function openEditModal(test: MockTest) {
    setDetailId(null);
    setEditingId(test.id);
    setEditForm(testToForm(test));
    setEditError(null);
  }

  async function saveEditedTest() {
    if (!editingId) return;
    setSaving(true);
    setEditError(null);
    const err = await save(editForm, editingId);
    setSaving(false);
    if (err) return setEditError(err);
    setEditingId(null);
  }

  async function deleteTest(id: string) {
    try {
      const res = await fetch(`/api/mock-tests?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        loadTests();
        setDeletingId(null);
      }
    } catch (e) {
      console.error("Failed to delete test", e);
    }
  }

  const detailTest = detailId ? tests.find((t) => t.id === detailId) ?? null : null;

  const chartData = tests.map((t) => ({
    date: t.test_date,
    percentage: Math.round((t.score / t.max_score) * 100),
    subject: t.test_name || t.subject,
    score: t.score,
    maxScore: t.max_score,
  }));

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">Log a Mock Test Score (SQLite Synced)</h3>
        <MockTestForm
          form={form}
          setForm={setForm}
          onSubmit={addTest}
          submitLabel="Save Score"
          error={formError}
          busy={saving}
        />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">Score Trend (%)</h3>
        {chartData.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No mock tests logged yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: any, name: any, item: any) => [
                  `${value}% (${item.payload.score}/${item.payload.maxScore})`,
                  item.payload.subject,
                ]}
              />
              <Line type="monotone" dataKey="percentage" stroke="#6366f1" strokeWidth={2.5} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b dark:border-slate-800 pb-3">
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Test History & Logs</h3>
            <p className="text-xs text-slate-400">Manage your logged mock tests. Open “Detail” for the full breakdown.</p>
          </div>
          <button
            onClick={() => {
              setIsEditMode(!isEditMode);
              setDeletingId(null);
            }}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium cursor-pointer ${
              isEditMode ? "bg-slate-800 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            }`}
          >
            {isEditMode ? "Done" : "Edit Logs"}
          </button>
        </div>

        <div className="space-y-2">
          {tests.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No tests recorded yet.</p>
          ) : (
            tests
              .slice()
              .reverse()
              .map((test) => {
                const pct = Math.round((test.score / test.max_score) * 100);
                const hasDetail = test.sections.length > 0 || test.topic_losses.length > 0;
                return (
                  <div key={test.id} className="flex items-center justify-between gap-2 p-3 rounded-xl border dark:border-slate-800">
                    <div className="flex items-center gap-3 overflow-hidden">
                      {isEditMode && (
                        <button
                          onClick={() => setDeletingId(deletingId === test.id ? null : test.id)}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 font-bold"
                        >
                          &minus;
                        </button>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-slate-500">{test.test_date}</span>
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                            {test.test_name || test.subject}
                          </span>
                          {test.test_name && test.subject && (
                            <span className="text-xs text-slate-400">{test.subject}</span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                          {test.score} / {test.max_score}{" "}
                          <span className="text-xs font-normal text-slate-400">({pct}%)</span>
                          {test.negative_marks > 0 && (
                            <span className="ml-2 text-xs font-normal text-red-500">−{fmtMarks(test.negative_marks)} neg</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setDetailId(test.id)}
                        className={`text-xs px-2.5 py-1 rounded-md border cursor-pointer ${
                          hasDetail
                            ? "border-indigo-200 text-indigo-700 dark:border-indigo-800 dark:text-indigo-300"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        Detail
                      </button>
                      {isEditMode &&
                        (deletingId === test.id ? (
                          <div className="flex items-center gap-1.5 bg-red-50 p-1 rounded-lg border">
                            <button onClick={() => deleteTest(test.id)} className="px-2.5 py-1 text-xs bg-red-600 text-white rounded-md">
                              Confirm
                            </button>
                            <button onClick={() => setDeletingId(null)} className="px-2.5 py-1 text-xs bg-white text-gray-700 rounded-md">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => openEditModal(test)} className="text-xs px-2.5 py-1 border rounded-md">
                            Edit
                          </button>
                        ))}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>

      {detailTest && (
        <MockDetailDialog test={detailTest} onClose={() => setDetailId(null)} onEdit={openEditModal} />
      )}

      {editingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl space-y-4">
            <h4 className="font-semibold text-slate-800 dark:text-white">Edit Mock Test Log</h4>
            <MockTestForm
              form={editForm}
              setForm={setEditForm}
              onSubmit={saveEditedTest}
              onCancel={() => setEditingId(null)}
              submitLabel="Save Changes"
              error={editError}
              busy={saving}
            />
          </div>
        </div>
      )}
    </div>
  );
}
