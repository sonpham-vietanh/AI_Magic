// Tổng hợp sổ sử dụng AI cho trang quản trị: theo ngày, người, công cụ, mô hình + dự báo cuối tháng. Hàm thuần.
import { dayOf, monthKeyOf, type LedgerStore } from './ledger';

export type UsageRange = '7d' | '30d' | 'month';

export interface Bucket {
  key: string;
  runs: number;
  calls: number;
  errors: number;
  tokens: number;
  costUsd: number;
}

export interface DayBucket extends Bucket {
  day: string;
}

export interface UsageReport {
  range: UsageRange;
  from: string;
  to: string;
  totals: {
    runs: number;
    calls: number;
    errors: number;
    promptTokens: number;
    completionTokens: number;
    tokens: number;
    costUsd: number;
    activeUsers: number;
    estimatedCalls: number;
  };
  byDay: DayBucket[];
  byUser: Bucket[];
  byWorkflow: Bucket[];
  byModel: Bucket[];
  month: {
    key: string;
    spentUsd: number;
    forecastUsd: number;
    budgetUsd: number;
    overBudget: boolean;
    forecastOverBudget: boolean;
    daysElapsed: number;
    daysInMonth: number;
  };
}

/** Một dòng đã cộng dồn theo (ngày, người, công cụ, mô hình): dùng chung cho dòng chi tiết và bản cộng dồn cũ. */
export interface FlatRow {
  day: string;
  user: string;
  workflow: string;
  model: string;
  runs: number;
  calls: number;
  errors: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  estimatedCalls: number;
}

export function flattenLedger(store: LedgerStore): FlatRow[] {
  const map = new Map<string, FlatRow>();
  const runSeen = new Set<string>();
  const SEP = '\u0000';
  for (const r of store.rows) {
    const k = [r.day, r.user, r.workflow, r.model].join(SEP);
    const cur =
      map.get(k) ??
      { day: r.day, user: r.user, workflow: r.workflow, model: r.model, runs: 0, calls: 0, errors: 0, promptTokens: 0, completionTokens: 0, costUsd: 0, estimatedCalls: 0 };
    cur.calls += 1;
    if (!r.ok) cur.errors += 1;
    if (r.estimated) cur.estimatedCalls += 1;
    const rk = `${k}${SEP}${r.runId}`;
    if (r.ok && !runSeen.has(rk)) {
      runSeen.add(rk);
      cur.runs += 1;
    }
    cur.promptTokens += r.promptTokens;
    cur.completionTokens += r.completionTokens;
    cur.costUsd += r.costUsd;
    map.set(k, cur);
  }
  for (const r of store.rollups) {
    const k = [r.day, r.user, r.workflow, r.model].join(SEP);
    const cur =
      map.get(k) ??
      { day: r.day, user: r.user, workflow: r.workflow, model: r.model, runs: 0, calls: 0, errors: 0, promptTokens: 0, completionTokens: 0, costUsd: 0, estimatedCalls: 0 };
    cur.calls += r.calls;
    cur.errors += r.errors;
    cur.runs += r.runs;
    cur.promptTokens += r.promptTokens;
    cur.completionTokens += r.completionTokens;
    cur.costUsd += r.costUsd;
    map.set(k, cur);
  }
  return [...map.values()];
}

export function parseRange(v: string | null | undefined): UsageRange {
  return v === '30d' || v === 'month' ? v : '7d';
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function rangeBounds(range: UsageRange, now = Date.now()): { from: string; to: string } {
  const to = dayOf(now);
  if (range === 'month') return { from: `${monthKeyOf(to)}-01`, to };
  return { from: addDays(to, range === '7d' ? -6 : -29), to };
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

function bucketize(rows: FlatRow[], pick: (r: FlatRow) => string, limit?: number): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    const key = pick(r);
    const b = map.get(key) ?? { key, runs: 0, calls: 0, errors: 0, tokens: 0, costUsd: 0 };
    b.runs += r.runs;
    b.calls += r.calls;
    b.errors += r.errors;
    b.tokens += r.promptTokens + r.completionTokens;
    b.costUsd += r.costUsd;
    map.set(key, b);
  }
  const out = [...map.values()].map((b) => ({ ...b, costUsd: round(b.costUsd) }));
  out.sort((a, b) => b.costUsd - a.costUsd || b.tokens - a.tokens);
  return limit ? out.slice(0, limit) : out;
}

export function buildReport(store: LedgerStore, range: UsageRange, budgetUsd: number, now = Date.now()): UsageReport {
  const { from, to } = rangeBounds(range, now);
  const flat = flattenLedger(store);
  const inRange = flat.filter((r) => r.day >= from && r.day <= to);

  const byDayMap = new Map<string, DayBucket>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    byDayMap.set(d, { day: d, key: d, runs: 0, calls: 0, errors: 0, tokens: 0, costUsd: 0 });
  }
  const totals = {
    runs: 0, calls: 0, errors: 0, promptTokens: 0, completionTokens: 0, tokens: 0, costUsd: 0, activeUsers: 0, estimatedCalls: 0,
  };
  const users = new Set<string>();
  for (const r of inRange) {
    const d = byDayMap.get(r.day);
    if (d) {
      d.runs += r.runs;
      d.calls += r.calls;
      d.errors += r.errors;
      d.tokens += r.promptTokens + r.completionTokens;
      d.costUsd += r.costUsd;
    }
    totals.runs += r.runs;
    totals.calls += r.calls;
    totals.errors += r.errors;
    totals.promptTokens += r.promptTokens;
    totals.completionTokens += r.completionTokens;
    totals.costUsd += r.costUsd;
    totals.estimatedCalls += r.estimatedCalls;
    users.add(r.user);
  }
  totals.tokens = totals.promptTokens + totals.completionTokens;
  totals.costUsd = round(totals.costUsd);
  totals.activeUsers = users.size;

  const monthKey = monthKeyOf(to);
  const spent = flat.filter((r) => monthKeyOf(r.day) === monthKey).reduce((s, r) => s + r.costUsd, 0);
  const daysElapsed = Number(to.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)), 0)).getUTCDate();
  const forecast = daysElapsed > 0 ? (spent / daysElapsed) * daysInMonth : spent;

  return {
    range,
    from,
    to,
    totals,
    byDay: [...byDayMap.values()].map((d) => ({ ...d, costUsd: round(d.costUsd) })),
    byUser: bucketize(inRange, (r) => r.user, 50),
    byWorkflow: bucketize(inRange, (r) => r.workflow),
    byModel: bucketize(inRange, (r) => r.model),
    month: {
      key: monthKey,
      spentUsd: round(spent),
      forecastUsd: round(forecast),
      budgetUsd,
      overBudget: budgetUsd > 0 && spent >= budgetUsd,
      forecastOverBudget: budgetUsd > 0 && forecast >= budgetUsd,
      daysElapsed,
      daysInMonth,
    },
  };
}

/** Chống chèn công thức khi mở CSV bằng Excel: ô bắt đầu bằng = + - @ được thêm dấu nháy. */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function reportToCsv(store: LedgerStore, range: UsageRange, now = Date.now()): string {
  const { from, to } = rangeBounds(range, now);
  const rows = flattenLedger(store)
    .filter((r) => r.day >= from && r.day <= to)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.user < b.user ? -1 : 1));
  const head = ['ngay', 'nguoi_dung', 'cong_cu', 'mo_hinh', 'luot_soan', 'so_loi_goi_ai', 'so_loi', 'token_vao', 'token_ra', 'chi_phi_usd_uoc_tinh'];
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push(
      [r.day, r.user, r.workflow, r.model, r.runs, r.calls, r.errors, r.promptTokens, r.completionTokens, round(r.costUsd, 6)]
        .map(csvCell)
        .join(','),
    );
  }
  // BOM để Excel đọc đúng tiếng Việt.
  return `﻿${lines.join('\r\n')}\r\n`;
}
