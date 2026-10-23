// Sổ ghi mỗi lần gọi AI. Lưu qua safeJson (.data/usage-ledger.json, khoá đám mây 'usage-ledger').
// Giới hạn tăng trưởng: giữ dòng chi tiết 60 ngày và tối đa 30.000 dòng; phần cũ hơn được cộng dồn theo ngày.
// Ghi gộp (debounce) để mỗi lần gọi AI không phải ghi lại cả tệp.
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createMutex, readJsonStrict, writeJsonAtomic } from '@/lib/server/safeJson';
import { estimateCostUsd } from './pricing';

export const KEEP_DAYS = 60;
export const MAX_ROWS = 30_000;
const MAX_ROLLUPS = 3000;
const MAX_PENDING = 2000;
const FLUSH_DELAY_MS = 2500;

export interface UsageRow {
  id: string;
  ts: string;
  day: string;
  user: string;
  workflow: string;
  runId: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  estimated: boolean;
  latencyMs: number;
  ok: boolean;
  costUsd: number;
}

export interface UsageRollup {
  day: string;
  user: string;
  workflow: string;
  model: string;
  calls: number;
  errors: number;
  runs: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface LedgerStore {
  version: 1;
  rows: UsageRow[];
  rollups: UsageRollup[];
}

export const ANON_USER = 'khách';
const TZ_OFFSET_MS = 7 * 3600_000; // giờ Việt Nam

export function dayOf(ms: number): string {
  return new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 10);
}
export const todayKey = (now = Date.now()) => dayOf(now);
export const monthKeyOf = (day: string) => day.slice(0, 7);

export function ledgerFile(): string {
  const env = process.env.USAGE_LEDGER_FILE?.trim();
  if (env) return env;
  if (process.env.VITEST) return join(tmpdir(), `va-usage-ledger-vitest-${process.pid}.json`);
  return join(process.cwd(), '.data', 'usage-ledger.json');
}

const emptyStore = (): LedgerStore => ({ version: 1, rows: [], rollups: [] });
const mutex = createMutex();
let pending: UsageRow[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function normalizeUser(user: string | null | undefined): string {
  const u = (user ?? '').trim().toLowerCase().slice(0, 120);
  return u || ANON_USER;
}

export interface RecordInput {
  user: string;
  workflow: string;
  runId: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  estimated: boolean;
  latencyMs: number;
  ok: boolean;
  now?: number;
}

export function buildRow(input: RecordInput): UsageRow {
  const now = input.now ?? Date.now();
  const p = Math.max(0, Math.round(input.promptTokens) || 0);
  const c = Math.max(0, Math.round(input.completionTokens) || 0);
  return {
    id: randomUUID(),
    ts: new Date(now).toISOString(),
    day: dayOf(now),
    user: normalizeUser(input.user),
    workflow: (input.workflow || 'khac').slice(0, 60),
    runId: input.runId,
    model: (input.model || 'unknown').slice(0, 120),
    provider: (input.provider || 'unknown').slice(0, 40),
    promptTokens: p,
    completionTokens: c,
    estimated: input.estimated,
    latencyMs: Math.max(0, Math.round(input.latencyMs) || 0),
    ok: input.ok,
    costUsd: estimateCostUsd(input.model || '', p, c),
  };
}

/** Rút gọn: dòng quá hạn / vượt trần chuyển thành bản cộng dồn theo ngày. Hàm thuần, dễ kiểm thử. */
export function compactStore(store: LedgerStore, now = Date.now()): LedgerStore {
  const cutoff = dayOf(now - KEEP_DAYS * 86_400_000);
  let rows = store.rows;
  const moved: UsageRow[] = [];
  const keep: UsageRow[] = [];
  for (const r of rows) (r.day < cutoff ? moved : keep).push(r);
  rows = keep;
  if (rows.length > MAX_ROWS) {
    rows = [...rows].sort((a, b) => (a.ts < b.ts ? -1 : 1));
    moved.push(...rows.slice(0, rows.length - MAX_ROWS));
    rows = rows.slice(rows.length - MAX_ROWS);
  }
  if (!moved.length && store.rollups.length <= MAX_ROLLUPS) return { ...store, rows };

  const map = new Map<string, UsageRollup>();
  const SEP = '\u0000';
  const key = (d: string, u: string, w: string, m: string) => [d, u, w, m].join(SEP);
  for (const r of store.rollups) map.set(key(r.day, r.user, r.workflow, r.model), { ...r });
  const runSeen = new Set<string>();
  for (const r of moved) {
    const k = key(r.day, r.user, r.workflow, r.model);
    const cur = map.get(k) ?? {
      day: r.day,
      user: r.user,
      workflow: r.workflow,
      model: r.model,
      calls: 0,
      errors: 0,
      runs: 0,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
    };
    cur.calls += 1;
    if (!r.ok) cur.errors += 1;
    const rk = `${k}${SEP}${r.runId}`;
    if (r.ok && !runSeen.has(rk)) {
      runSeen.add(rk);
      cur.runs += 1;
    }
    cur.promptTokens += r.promptTokens;
    cur.completionTokens += r.completionTokens;
    cur.costUsd = Math.round((cur.costUsd + r.costUsd) * 1e6) / 1e6;
    map.set(k, cur);
  }
  let rollups = [...map.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (rollups.length > MAX_ROLLUPS) rollups = rollups.slice(rollups.length - MAX_ROLLUPS);
  return { version: 1, rows, rollups };
}

async function flushNow(): Promise<void> {
  await mutex(async () => {
    if (!pending.length) return;
    const batch = pending;
    pending = [];
    try {
      const store = await readJsonStrict<LedgerStore>(ledgerFile(), emptyStore);
      const base: LedgerStore = {
        version: 1,
        rows: Array.isArray(store?.rows) ? store.rows : [],
        rollups: Array.isArray(store?.rollups) ? store.rollups : [],
      };
      base.rows.push(...batch);
      await writeJsonAtomic(ledgerFile(), compactStore(base));
    } catch (err) {
      // Không mất dòng: trả lại hàng đợi (có trần) để lần sau thử lại.
      pending = [...batch, ...pending].slice(-MAX_PENDING);
      throw err;
    }
  });
}

export async function flushUsageLedger(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  await flushNow();
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flushNow().catch((e) => console.error('[usage] ghi sổ lỗi:', e instanceof Error ? e.message : e));
  }, FLUSH_DELAY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
}

/** Thêm một dòng vào sổ. Không bao giờ ném lỗi. */
export async function appendUsage(input: RecordInput): Promise<UsageRow | null> {
  try {
    const row = buildRow(input);
    pending.push(row);
    if (pending.length > MAX_PENDING) pending = pending.slice(-MAX_PENDING);
    if (process.env.VITEST) await flushNow();
    else schedule();
    return row;
  } catch (e) {
    console.error('[usage] không ghi được sổ:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** Đọc toàn bộ sổ (đã gồm dòng đang chờ ghi). */
export async function readLedger(): Promise<LedgerStore> {
  try {
    await flushUsageLedger();
  } catch {
    // vẫn đọc được phần đã lưu + hàng đợi
  }
  const store = await readJsonStrict<LedgerStore>(ledgerFile(), emptyStore);
  return {
    version: 1,
    rows: [...(Array.isArray(store?.rows) ? store.rows : []), ...pending],
    rollups: Array.isArray(store?.rollups) ? store.rollups : [],
  };
}

/** Chỉ dùng trong kiểm thử. */
export function _resetLedgerForTest(): void {
  pending = [];
  if (timer) clearTimeout(timer);
  timer = null;
}
