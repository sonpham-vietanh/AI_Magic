import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callLiveLlm } from '@/lib/engine/llmClient';

const ENV_KEYS = ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY'] as const;

describe('hạn chót cứng của lần gọi AI', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_BASE_URL = 'https://llm.example.test/v1';
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.unstubAllGlobals();
  });

  it('nhà cung cấp trả phần đầu rồi im lặng: bỏ chờ đúng hạn, không treo', async () => {
    const enc = new TextEncoder();
    let cancelled = false;
    // Luồng gửi một đoạn rồi KHÔNG BAO GIỜ gửi tiếp và cũng không báo lỗi khi bị huỷ (giống kết nối treo thật).
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"Xin"}}]}\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { status: 200 })));
    const t0 = Date.now();
    const res = await callLiveLlm('s', 'u', undefined, { timeoutMs: 300 });
    const took = Date.now() - t0;
    expect(res.ok).toBe(false);
    expect(took).toBeLessThan(3000);
    expect(res.error ?? '').toMatch(/timeout|thời gian/i);
    expect(cancelled).toBe(true); // kết nối treo được giải phóng
  });

  it('fetch không bao giờ trả về: cũng bỏ chờ đúng hạn', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    const t0 = Date.now();
    const res = await callLiveLlm('s', 'u', undefined, { timeoutMs: 300 });
    expect(res.ok).toBe(false);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it('phản hồi bình thường vẫn chạy (không bị hạn chót làm hỏng)', async () => {
    const body =
      'data: {"choices":[{"delta":{"content":"Xin "}}]}\n\ndata: {"choices":[{"delta":{"content":"chào"}}]}\n\ndata: [DONE]\n\n';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })));
    const res = await callLiveLlm('s', 'u', undefined, { timeoutMs: 5000 });
    expect(res.ok).toBe(true);
    expect(res.content).toBe('Xin chào');
  });
});
