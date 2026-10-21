import { join } from 'node:path';
import { createJsonStore } from './jsonFile';

/**
 * Tín hiệu miễn phí: ghi tự động, không tốn giây nào của giáo viên.
 * (a) sự kiện sinh lại -> tỷ lệ sinh lại / tiết; (b) diff bản AI vs bản GV duyệt.
 * Mọi bản ghi mang orgId; đọc luôn lọc theo org.
 */

export const MAX_RUNS = 2000;
export const MAX_TEXT_BYTES = 60 * 1024;
export const REGEN_FLAG_THRESHOLD = 0.4;
export const REGEN_FLAG_MIN_GENERATIONS = 3;
const MAX_DIFF_LINES = 3000;

export interface RunRecord {
  orgId: string;
  runId: string;
  lessonKey: string;
  teacher: string;
  workflow: string;
  at: string;
  regenerationOf?: string;
  requiresApproval: boolean;
  text: string;
  finalText?: string;
  accepted?: boolean;
  diffRatio?: number;
  finalAt?: string;
}

interface SignalsData {
  runs: RunRecord[];
}

export class UnknownRunError extends Error {
  readonly code = 'UNKNOWN_RUN';
  constructor(runId: string) {
    super(`Không tìm thấy lượt sinh: ${runId}`);
    this.name = 'UnknownRunError';
  }
}

const store = createJsonStore<SignalsData>({
  tag: 'signals',
  file: () => process.env.SIGNALS_FILE || join(process.cwd(), '.data', 'signals.json'),
  empty: () => ({ runs: [] }),
  normalize: (raw) => {
    const runs = (raw as Partial<SignalsData>).runs;
    return { runs: Array.isArray(runs) ? runs : [] };
  },
});

function capText(s: string | undefined): string {
  const t = s ?? '';
  if (Buffer.byteLength(t, 'utf8') <= MAX_TEXT_BYTES) return t;
  return Buffer.from(t, 'utf8').subarray(0, MAX_TEXT_BYTES).toString('utf8');
}

export async function recordGeneration(e: {
  orgId: string;
  lessonKey: string;
  teacher: string;
  workflow: string;
  runId: string;
  regenerationOf?: string;
  requiresApproval?: boolean;
  text?: string;
}): Promise<void> {
  await store.update((data) => {
    if (data.runs.some((r) => r.orgId === e.orgId && r.runId === e.runId)) return; // idempotent
    data.runs.push({
      orgId: e.orgId,
      runId: e.runId,
      lessonKey: e.lessonKey,
      teacher: e.teacher,
      workflow: e.workflow,
      at: new Date().toISOString(),
      regenerationOf: e.regenerationOf,
      requiresApproval: !!e.requiresApproval,
      text: capText(e.text),
    });
    if (data.runs.length > MAX_RUNS) data.runs = data.runs.slice(-MAX_RUNS);
  });
}

function splitLines(s: string): string[] {
  return s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l, i, arr) => !(l === '' && (i === arr.length - 1 || i === 0)))
    .slice(0, MAX_DIFF_LINES);
}

/** Tỷ lệ khác biệt theo dòng trong [0,1]: 0 = giống hệt. = 1 - 2*LCS/(|a|+|b|). */
export function lineDiffRatio(a: string, b: string): number {
  const x = splitLines(a);
  const y = splitLines(b);
  if (x.length + y.length === 0) return 0;
  let prev = new Int32Array(y.length + 1);
  let cur = new Int32Array(y.length + 1);
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  const lcs = prev[y.length];
  const ratio = 1 - (2 * lcs) / (x.length + y.length);
  return Math.min(1, Math.max(0, Math.round(ratio * 10000) / 10000));
}

export async function recordFinalVersion(e: {
  orgId: string;
  runId: string;
  finalText: string;
  accepted: boolean;
}): Promise<{ diffRatio: number; editedAtAll: boolean }> {
  return store.update((data) => {
    const run = data.runs.find((r) => r.orgId === e.orgId && r.runId === e.runId);
    if (!run) throw new UnknownRunError(e.runId);
    const finalText = capText(e.finalText);
    const diffRatio = lineDiffRatio(run.text, finalText);
    run.finalText = finalText;
    run.accepted = e.accepted;
    run.diffRatio = diffRatio;
    run.finalAt = new Date().toISOString();
    return { diffRatio, editedAtAll: diffRatio > 0 };
  });
}

async function orgRuns(orgId: string): Promise<RunRecord[]> {
  const data = await store.read();
  return data.runs.filter((r) => r.orgId === orgId);
}

export async function lessonStats(orgId: string): Promise<
  { lessonKey: string; generations: number; regenerations: number; regenRate: number; flagged: boolean }[]
> {
  const by = new Map<string, { g: number; r: number }>();
  for (const r of await orgRuns(orgId)) {
    const s = by.get(r.lessonKey) ?? { g: 0, r: 0 };
    s.g++;
    if (r.regenerationOf) s.r++;
    by.set(r.lessonKey, s);
  }
  return [...by.entries()]
    .map(([lessonKey, s]) => {
      const regenRate = s.g ? s.r / s.g : 0;
      return {
        lessonKey,
        generations: s.g,
        regenerations: s.r,
        regenRate,
        flagged: regenRate > REGEN_FLAG_THRESHOLD && s.g >= REGEN_FLAG_MIN_GENERATIONS,
      };
    })
    .sort((a, b) => b.regenRate - a.regenRate || b.generations - a.generations);
}

export async function summary(orgId: string): Promise<{
  totalRuns: number;
  accepted: number;
  acceptedUnchanged: number;
  unchangedPct: number | null;
  avgDiffRatio: number | null;
  flaggedLessons: number;
}> {
  const runs = await orgRuns(orgId);
  const accepted = runs.filter((r) => r.accepted === true);
  const acceptedUnchanged = accepted.filter((r) => r.diffRatio === 0).length;
  const diffs = runs.filter((r) => typeof r.diffRatio === 'number').map((r) => r.diffRatio as number);
  const stats = await lessonStats(orgId);
  return {
    totalRuns: runs.length,
    accepted: accepted.length,
    acceptedUnchanged,
    unchangedPct: accepted.length ? (acceptedUnchanged / accepted.length) * 100 : null,
    avgDiffRatio: diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null,
    flaggedLessons: stats.filter((s) => s.flagged).length,
  };
}
