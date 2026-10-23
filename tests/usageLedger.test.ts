import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('@/lib/server/supabaseStore', () => ({
  isCloudStoreEnabled: () => false,
  readCloudStore: async () => ({ found: false }),
  writeCloudStore: async () => ({ ok: true }),
  resolveCloudStoreKey: () => null,
}));

import { estimateCostUsd, estimateTokens, priceFor } from '@/lib/usage/pricing';
import {
  _resetLedgerForTest,
  appendUsage,
  buildRow,
  compactStore,
  dayOf,
  MAX_ROWS,
  readLedger,
  type LedgerStore,
  type UsageRow,
} from '@/lib/usage/ledger';
import { buildReport, csvCell, flattenLedger, reportToCsv } from '@/lib/usage/report';
import { callLiveLlm } from '@/lib/engine/llmClient';
import { runWithUsageContext } from '@/lib/usage/context';

let dir: string;
const baseInput = {
  user: 'Co.Lan@truongvietanh.com',
  workflow: 'wf:khbd',
  runId: 'r1',
  model: 'google/gemini-2.5-flash',
  provider: 'gemini',
  promptTokens: 1000,
  completionTokens: 500,
  estimated: false,
  latencyMs: 1200,
  ok: true,
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'va-ledger-'));
  process.env.USAGE_LEDGER_FILE = join(dir, 'usage-ledger.json');
  _resetLedgerForTest();
});
afterEach(() => {
  delete process.env.USAGE_LEDGER_FILE;
  delete process.env.USAGE_PRICING_JSON;
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  for (const k of ['GEMINI_API_KEY', 'GEMINI_API_KEYS', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY']) delete process.env[k];
});

describe('pricing', () => {
  it('khớp mô hình theo chuỗi con, khoá dài hơn ưu tiên', () => {
    expect(priceFor('google/gemini-2.5-flash-lite').price).toEqual({ in: 0.1, out: 0.4 });
    expect(priceFor('google/gemini-2.5-flash').price).toEqual({ in: 0.3, out: 2.5 });
    expect(priceFor('cc/claude-haiku-4-5-20251001').known).toBe(true);
    expect(priceFor('mo-hinh-la').known).toBe(false);
  });
  it('tính chi phí USD theo triệu token', () => {
    expect(estimateCostUsd('google/gemini-2.5-flash', 1_000_000, 1_000_000)).toBeCloseTo(2.8, 6);
  });
  it('cho phép ghi đè bằng USAGE_PRICING_JSON và bỏ qua JSON hỏng', () => {
    process.env.USAGE_PRICING_JSON = '{"mo-hinh-la":{"in":10,"out":20}}';
    expect(estimateCostUsd('mo-hinh-la', 1_000_000, 0)).toBe(10);
    process.env.USAGE_PRICING_JSON = '{hỏng';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(priceFor('google/gemini-2.5-flash').known).toBe(true);
    spy.mockRestore();
  });
  it('ước tính token bằng ký tự / 3', () => {
    expect(estimateTokens('a'.repeat(30))).toBe(10);
  });
});

describe('sổ sử dụng', () => {
  it('ghi và đọc lại một dòng, chuẩn hoá email', async () => {
    await appendUsage(baseInput);
    const store = await readLedger();
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].user).toBe('co.lan@truongvietanh.com');
    expect(store.rows[0].costUsd).toBeCloseTo((1000 * 0.3 + 500 * 2.5) / 1e6, 6);
  });
  it('người dùng trống thành "khách"', () => {
    expect(buildRow({ ...baseInput, user: '  ' }).user).toBe('khách');
  });
  it('dòng quá 60 ngày được cộng dồn theo ngày, không mất tổng', () => {
    const old = Date.now() - 90 * 86_400_000;
    const rows: UsageRow[] = [0, 1, 2].map((i) => buildRow({ ...baseInput, runId: `old${i % 2}`, now: old }));
    const recent = buildRow({ ...baseInput, runId: 'new' });
    const out = compactStore({ version: 1, rows: [...rows, recent], rollups: [] });
    expect(out.rows).toHaveLength(1);
    expect(out.rollups).toHaveLength(1);
    expect(out.rollups[0]).toMatchObject({ day: dayOf(old), calls: 3, runs: 2, promptTokens: 3000, completionTokens: 1500 });
  });
  it('vượt 30.000 dòng thì dòng cũ nhất được cộng dồn', () => {
    const now = Date.now();
    const rows: UsageRow[] = [];
    for (let i = 0; i < MAX_ROWS + 5; i++) rows.push({ ...buildRow({ ...baseInput, runId: `x${i}`, now: now - 1000 + i }) });
    const out = compactStore({ version: 1, rows, rollups: [] });
    expect(out.rows).toHaveLength(MAX_ROWS);
    expect(out.rollups.reduce((s, r) => s + r.calls, 0)).toBe(5);
  });
  it('lỗi ghi không ném ra và giữ dòng trong hàng đợi', async () => {
    process.env.USAGE_LEDGER_FILE = join(dir, 'khong-co-thu-muc', '\0bad');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(appendUsage(baseInput)).resolves.not.toThrow();
    spy.mockRestore();
  });
});

describe('báo cáo', () => {
  const store = (): LedgerStore => ({
    version: 1,
    rows: [
      buildRow({ ...baseInput, user: 'a@x.vn', runId: 'a1' }),
      buildRow({ ...baseInput, user: 'a@x.vn', runId: 'a1', promptTokens: 200, completionTokens: 100 }),
      buildRow({ ...baseInput, user: 'b@x.vn', runId: 'b1', workflow: 'assistant', ok: false }),
    ],
    rollups: [],
  });
  it('tổng hợp theo ngày/người/công cụ và đếm lượt đúng', () => {
    const r = buildReport(store(), '7d', 10);
    expect(r.byDay).toHaveLength(7);
    expect(r.totals.calls).toBe(3);
    expect(r.totals.runs).toBe(1); // a1 (2 lời gọi) = 1 lượt; b1 lỗi không tính
    expect(r.totals.activeUsers).toBe(2);
    expect(r.byUser.map((u) => u.key).sort()).toEqual(['a@x.vn', 'b@x.vn']);
    expect(r.byWorkflow.map((u) => u.key).sort()).toEqual(['assistant', 'wf:khbd']);
    expect(r.month.budgetUsd).toBe(10);
    expect(r.month.forecastUsd).toBeGreaterThanOrEqual(r.month.spentUsd);
  });
  it('cảnh báo vượt ngân sách', () => {
    const r = buildReport(store(), 'month', 0.000001);
    expect(r.month.overBudget).toBe(true);
  });
  it('flatten gộp dòng chi tiết với bản cộng dồn', () => {
    const s = store();
    s.rollups.push({ day: s.rows[0].day, user: 'a@x.vn', workflow: 'wf:khbd', model: s.rows[0].model, calls: 4, errors: 0, runs: 2, promptTokens: 1, completionTokens: 1, costUsd: 0 });
    const f = flattenLedger(s).find((x) => x.user === 'a@x.vn');
    expect(f?.calls).toBe(6);
  });
  it('CSV có BOM, tiêu đề và chống chèn công thức', () => {
    const s = store();
    s.rows[0].user = '=cmd|calc';
    const csv = reportToCsv(s, '7d');
    expect(csv.startsWith('﻿ngay,')).toBe(true);
    expect(csv).toContain("'=cmd|calc");
    expect(csvCell('a,b')).toBe('"a,b"');
  });
});

describe('llmClient ghi sổ', () => {
  it('ghi token thật từ usageMetadata của Gemini và gắn đúng người dùng', async () => {
    process.env.GEMINI_API_KEY = 'k-test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'Xin chào' }] } }],
            usageMetadata: { promptTokenCount: 321, candidatesTokenCount: 40, thoughtsTokenCount: 9 },
          }),
          { status: 200 },
        ),
      ),
    );
    const recorded: unknown[] = [];
    const res = await runWithUsageContext(
      { user: 'u@x.vn', workflow: 'w', runId: 'r', record: (e) => void recorded.push(e) },
      () => callLiveLlm('sys', 'user', undefined, { useCache: false }),
    );
    expect(res.ok).toBe(true);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ provider: 'gemini', model: 'google/gemini-2.5-flash', promptTokens: 321, completionTokens: 49, estimated: false, ok: true });
  });

  it('ước tính khi thiếu usage và đánh dấu estimated', async () => {
    process.env.GEMINI_API_KEY = 'k-test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a'.repeat(30) }] } }] }), { status: 200 })),
    );
    const recorded: { estimated: boolean; completionTokens: number }[] = [];
    await runWithUsageContext({ user: 'u', workflow: 'w', runId: 'r', record: (e) => void recorded.push(e) }, () =>
      callLiveLlm('s', 'u', undefined, { useCache: false }),
    );
    expect(recorded[0].estimated).toBe(true);
    expect(recorded[0].completionTokens).toBe(10);
  });

  it('lỗi ghi sổ không làm hỏng lời gọi AI', async () => {
    process.env.GEMINI_API_KEY = 'k-test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 })),
    );
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await runWithUsageContext(
      { user: 'u', workflow: 'w', runId: 'r', record: () => Promise.reject(new Error('đĩa đầy')) },
      () => callLiveLlm('s', 'u', undefined, { useCache: false }),
    );
    spy.mockRestore();
    expect(res.ok).toBe(true);
    expect(res.content).toBe('ok');
  });

  it('ghi dòng lỗi khi nhà cung cấp lỗi', async () => {
    process.env.GEMINI_API_KEY = 'k-test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const recorded: { ok: boolean }[] = [];
    const res = await runWithUsageContext({ user: 'u', workflow: 'w', runId: 'r', record: (e) => void recorded.push(e) }, () =>
      callLiveLlm('s', 'u', undefined, { useCache: false }),
    );
    spy.mockRestore();
    expect(res.ok).toBe(false);
    expect(recorded[0].ok).toBe(false);
  });
});
