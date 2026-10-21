import { join } from 'node:path';
import { createJsonStore } from '../signals/jsonFile';
import { MAX_EVAL_CASES, aggregate, blindize, type EvalCase, type RubricScores } from './index';

export interface BaselineConfig {
  baselineMinutes: number | null;
  targetMinutes: number | null;
  measuredWith?: string;
}

export interface StoredCase extends EvalCase {
  orgId: string;
}
interface BlindEntry {
  orgId: string;
  label: string;
  version: string; // CHỈ phía server
  caseId?: string;
  runId?: string;
  text: string;
}
interface ScoreEntry {
  orgId: string;
  blindLabel: string;
  caseId?: string;
  runId?: string;
  rater: string;
  scores: RubricScores;
  at: string;
}
interface EvalData {
  baselines: Record<string, BaselineConfig>;
  cases: StoredCase[];
  blind: BlindEntry[];
  scores: ScoreEntry[];
}

const store = createJsonStore<EvalData>({
  tag: 'eval',
  file: () => process.env.EVAL_FILE || join(process.cwd(), '.data', 'eval.json'),
  empty: () => ({ baselines: {}, cases: [], blind: [], scores: [] }),
  normalize: (raw) => {
    const r = raw as Partial<EvalData>;
    return {
      baselines: r.baselines && typeof r.baselines === 'object' ? r.baselines : {},
      cases: Array.isArray(r.cases) ? r.cases : [],
      blind: Array.isArray(r.blind) ? r.blind : [],
      scores: Array.isArray(r.scores) ? r.scores : [],
    };
  },
});

const EMPTY_BASELINE: BaselineConfig = { baselineMinutes: null, targetMinutes: null };

export async function getBaseline(orgId: string): Promise<BaselineConfig> {
  const d = await store.read();
  return d.baselines[orgId] ?? { ...EMPTY_BASELINE };
}

export async function setBaseline(orgId: string, cfg: BaselineConfig): Promise<BaselineConfig> {
  return store.update((d) => {
    d.baselines[orgId] = cfg;
    return cfg;
  });
}

export async function listCases(orgId: string): Promise<EvalCase[]> {
  const d = await store.read();
  return d.cases.filter((c) => c.orgId === orgId).map(({ orgId: _o, ...c }) => c);
}

export class CaseLimitError extends Error {
  constructor() {
    super(`Bộ đề tối đa ${MAX_EVAL_CASES} đề.`);
    this.name = 'CaseLimitError';
  }
}

export async function addCase(
  orgId: string,
  c: Omit<EvalCase, 'id' | 'addedAt'>,
): Promise<EvalCase> {
  return store.update((d) => {
    if (d.cases.filter((x) => x.orgId === orgId).length >= MAX_EVAL_CASES) throw new CaseLimitError();
    const full: StoredCase = {
      ...c,
      orgId,
      id: `case_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      addedAt: new Date().toISOString(),
    };
    d.cases.push(full);
    const { orgId: _o, ...pub } = full;
    return pub;
  });
}

/** Đăng ký các bản cần chấm mù; trả về chỉ nhãn + nội dung (không có phiên bản). */
export async function registerBlind(
  orgId: string,
  items: { version: string; caseId?: string; runId?: string; text: string }[],
  seed: number,
): Promise<{ label: string; text: string }[]> {
  const { blinded, mapping } = blindize(items, seed);
  return store.update((d) => {
    for (const [label, it] of Object.entries(mapping)) {
      d.blind.push({ orgId, label, version: it.version, caseId: it.caseId, runId: it.runId, text: it.text });
    }
    return blinded;
  });
}

/** Danh sách cho người chấm: tuyệt đối không có phiên bản. */
export async function listBlindForRater(orgId: string): Promise<{ label: string; caseId?: string; text: string }[]> {
  const d = await store.read();
  return d.blind.filter((b) => b.orgId === orgId).map((b) => ({ label: b.label, caseId: b.caseId, text: b.text }));
}

export class UnknownBlindLabelError extends Error {
  constructor() {
    super('Nhãn chấm mù không tồn tại.');
    this.name = 'UnknownBlindLabelError';
  }
}

export async function addScore(
  orgId: string,
  s: { blindLabel: string; caseId?: string; runId?: string; rater: string; scores: RubricScores },
): Promise<void> {
  await store.update((d) => {
    if (!d.blind.some((b) => b.orgId === orgId && b.label === s.blindLabel)) throw new UnknownBlindLabelError();
    d.scores = d.scores.filter(
      (x) => !(x.orgId === orgId && x.blindLabel === s.blindLabel && x.rater === s.rater),
    );
    d.scores.push({ ...s, orgId, at: new Date().toISOString() });
  });
}

/** Giải mù CHỈ ở server: gom điểm theo phiên bản. */
export async function report(orgId: string, version?: string) {
  const d = await store.read();
  const versionOf = new Map(d.blind.filter((b) => b.orgId === orgId).map((b) => [b.label, b.version]));
  const records = d.scores
    .filter((s) => s.orgId === orgId)
    .map((s) => ({ version: versionOf.get(s.blindLabel) ?? '(không rõ)', scores: s.scores }))
    .filter((r) => !version || r.version === version);
  return aggregate(records);
}
