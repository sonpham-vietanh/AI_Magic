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

import { _resetLedgerForTest, appendUsage, readLedger } from '@/lib/usage/ledger';
import { countRuns, dailyLimit, monthlyBudgetUsd, summarizeMine, withUsage } from '@/lib/usage/quota';
import { callLiveLlm } from '@/lib/engine/llmClient';
import { todayKey } from '@/lib/usage/ledger';

let dir: string;
const req = (headers: Record<string, string> = {}) => new Request('http://localhost/api/x', { headers });
const fakeGemini = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'kết quả' }] } }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
        }),
        { status: 200 },
      ),
    ),
  );

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'va-quota-'));
  process.env.USAGE_LEDGER_FILE = join(dir, 'usage-ledger.json');
  process.env.GEMINI_API_KEY = 'k-test';
  _resetLedgerForTest();
});
afterEach(() => {
  delete process.env.USAGE_LEDGER_FILE;
  delete process.env.USAGE_DAILY_LIMIT;
  delete process.env.GEMINI_API_KEY;
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

const ai = () => callLiveLlm('s', 'u', undefined, { useCache: false });

describe('cấu hình hạn mức', () => {
  it('mặc định không giới hạn (0), giá trị sai quay về mặc định, đặt số thì dùng số đó', () => {
    expect(dailyLimit({} as NodeJS.ProcessEnv)).toBe(0);
    expect(dailyLimit({ USAGE_DAILY_LIMIT: '0' } as unknown as NodeJS.ProcessEnv)).toBe(0);
    expect(dailyLimit({ USAGE_DAILY_LIMIT: '12' } as unknown as NodeJS.ProcessEnv)).toBe(12);
    expect(dailyLimit({ USAGE_DAILY_LIMIT: 'abc' } as unknown as NodeJS.ProcessEnv)).toBe(0);
    expect(monthlyBudgetUsd({ USAGE_MONTHLY_BUDGET_USD: '25' } as unknown as NodeJS.ProcessEnv)).toBe(25);
    expect(monthlyBudgetUsd({} as NodeJS.ProcessEnv)).toBe(0);
  });
});

describe('hạn mức theo lượt', () => {
  it('một lượt gồm nhiều lời gọi AI chỉ tính 1 lượt', async () => {
    fakeGemini();
    process.env.USAGE_DAILY_LIMIT = '2';
    await withUsage(req(), { workflow: 'wf:khbd', declaredUser: 'lan@x.vn' }, async () => {
      await ai();
      await ai();
      await ai();
    });
    const store = await readLedger();
    expect(store.rows).toHaveLength(3);
    expect(countRuns(store, 'lan@x.vn', todayKey())).toBe(1);
  });

  it('chặn lượt thứ N+1 bằng thông điệp tiếng Việt và không gọi mạng', async () => {
    fakeGemini();
    process.env.USAGE_DAILY_LIMIT = '2';
    const run = () =>
      withUsage(req(), { workflow: 'generate', declaredUser: 'lan@x.vn' }, async (h) => {
        const r = await ai();
        return { r, ex: h.exceeded() };
      });
    expect((await run()).ex).toBeNull();
    expect((await run()).ex).toBeNull();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const before = fetchMock.mock.calls.length;
    const third = await run();
    expect(third.ex).not.toBeNull();
    expect(third.ex?.message).toContain('Cô/thầy đã dùng hết 2 lượt');
    expect(third.r.ok).toBe(false);
    expect(fetchMock.mock.calls.length).toBe(before);
    // người khác không bị ảnh hưởng
    const other = await withUsage(req(), { workflow: 'generate', declaredUser: 'khac@x.vn' }, async (h) => {
      await ai();
      return h.exceeded();
    });
    expect(other).toBeNull();
  });

  it('lượt không gọi AI (lấy từ Kho) không tính và không bị chặn dù đã hết hạn mức', async () => {
    fakeGemini();
    process.env.USAGE_DAILY_LIMIT = '1';
    await withUsage(req(), { workflow: 'w', declaredUser: 'lan@x.vn' }, () => ai());
    const out = await withUsage(req(), { workflow: 'w', declaredUser: 'lan@x.vn' }, async (h) => h.exceeded());
    expect(out).toBeNull();
    expect(countRuns(await readLedger(), 'lan@x.vn', todayKey())).toBe(1);
  });

  it('USAGE_DAILY_LIMIT=0 thì không giới hạn', async () => {
    fakeGemini();
    process.env.USAGE_DAILY_LIMIT = '0';
    for (let i = 0; i < 5; i++) await withUsage(req(), { workflow: 'w', declaredUser: 'lan@x.vn' }, () => ai());
    expect(countRuns(await readLedger(), 'lan@x.vn', todayKey())).toBe(5);
  });

  it('lời gọi lỗi không tốn hạn mức', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.USAGE_DAILY_LIMIT = '1';
    await withUsage(req(), { workflow: 'w', declaredUser: 'lan@x.vn' }, () => ai());
    spy.mockRestore();
    expect(countRuns(await readLedger(), 'lan@x.vn', todayKey())).toBe(0);
  });
});

describe('thống kê của tôi', () => {
  it('trả đúng hợp đồng today/month', async () => {
    await appendUsage({
      user: 'lan@x.vn', workflow: 'w', runId: 'r1', model: 'google/gemini-2.5-flash', provider: 'gemini',
      promptTokens: 100, completionTokens: 50, estimated: false, latencyMs: 10, ok: true,
    });
    const mine = summarizeMine(await readLedger(), 'lan@x.vn');
    expect(mine.today.used).toBe(1);
    expect(mine.today.limit).toBe(0);
    expect(mine.month).toEqual({ runs: 1, tokens: 150 });
    expect(summarizeMine(await readLedger(), 'nguoi.khac@x.vn').today.used).toBe(0);
  });
});
