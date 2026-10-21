import { RUBRIC_IDS, RUBRIC_6, averageScore, type RubricScores } from './rubric';

export * from './rubric';

/* ---------- Bộ đề thật ---------- */
export interface EvalCase {
  id: string;
  subject: string;
  grade: string;
  title: string;
  text: string;
  source: string; // nguồn gốc nguyên văn (vd: "GV gửi qua Zalo 12/10")
  teacher: string;
  addedAt: string;
}
export const MAX_EVAL_CASES = 100;

export function coverage(cases: { subject: string; grade: string }[]): {
  total: number;
  target: number;
  bySubject: Record<string, number>;
  byGrade: Record<string, number>;
  bySubjectGrade: Record<string, number>;
  /** Môn có ít hơn nửa mức trung bình: gợi ý cần thu thêm để "trải đều". */
  thin: string[];
} {
  const bySubject: Record<string, number> = {};
  const byGrade: Record<string, number> = {};
  const bySubjectGrade: Record<string, number> = {};
  for (const c of cases) {
    bySubject[c.subject] = (bySubject[c.subject] ?? 0) + 1;
    byGrade[c.grade] = (byGrade[c.grade] ?? 0) + 1;
    const k = `${c.subject}|${c.grade}`;
    bySubjectGrade[k] = (bySubjectGrade[k] ?? 0) + 1;
  }
  const subs = Object.keys(bySubject);
  const avg = subs.length ? cases.length / subs.length : 0;
  const thin = subs.filter((s) => bySubject[s] < avg * 0.5);
  return { total: cases.length, target: MAX_EVAL_CASES, bySubject, byGrade, bySubjectGrade, thin };
}

/* ---------- Chấm mù ---------- */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Xáo trộn và gán nhãn mờ (vd "B-0a3f1"). Người chấm chỉ thấy `blinded`
 * (nhãn + nội dung); `mapping` (nhãn -> item gốc, gồm phiên bản) chỉ giữ phía server.
 */
export function blindize<T extends { text: string }>(
  items: T[],
  seed: number,
): { blinded: { label: string; text: string }[]; mapping: Record<string, T> } {
  const rnd = mulberry32(seed);
  const order = items.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const used = new Set<string>();
  const blinded: { label: string; text: string }[] = [];
  const mapping: Record<string, T> = {};
  for (const idx of order) {
    let label: string;
    do {
      label = 'B-' + Math.floor(rnd() * 0xfffff).toString(16).padStart(5, '0');
    } while (used.has(label));
    used.add(label);
    mapping[label] = items[idx];
    blinded.push({ label, text: items[idx].text });
  }
  return { blinded, mapping };
}

/* ---------- Tổng hợp điểm ---------- */
export interface ScoreRecord {
  version: string; // nhãn phiên bản prompt (sau khi giải mù)
  scores: RubricScores;
}
export interface AggregateRow {
  version: string;
  n: number;
  perCriterion: Record<string, number>;
  overall: number;
}

export function aggregate(records: ScoreRecord[]): AggregateRow[] {
  const groups = new Map<string, ScoreRecord[]>();
  for (const r of records) {
    const g = groups.get(r.version) ?? [];
    g.push(r);
    groups.set(r.version, g);
  }
  const rows: AggregateRow[] = [];
  for (const [version, recs] of groups) {
    const perCriterion: Record<string, number> = {};
    for (const id of RUBRIC_IDS) {
      const vals = recs.map((r) => r.scores[id]).filter((v) => typeof v === 'number' && Number.isFinite(v));
      perCriterion[id] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
    const overall = recs.length ? recs.reduce((a, r) => a + averageScore(r.scores), 0) / recs.length : 0;
    rows.push({ version, n: recs.length, perCriterion, overall });
  }
  return rows.sort((a, b) => a.version.localeCompare(b.version));
}

export function isValidScores(scores: Record<string, unknown>): boolean {
  return RUBRIC_6.every((c) => {
    const v = scores[c.id];
    return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
  });
}
