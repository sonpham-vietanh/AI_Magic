import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callLiveLlm, clearLlmCache } from '@/lib/engine/llmClient';
import { withVariation } from '@/lib/engine/variation';
import { codeFromErrorText, isAiAuthText, llmErrorMessage } from '@/lib/engine/llmErrors';

const KEYS = [
  'GEMINI_API_KEY', 'GEMINI_API_KEYS', 'GROQ_API_KEY', 'GROQ_API_KEYS', 'OPENAI_API_KEY', 'OPENAI_API_KEYS',
  'OPENROUTER_API_KEY', 'OPENROUTER_API_KEYS', 'OPENAI_BASE_URL', 'OPENAI_MODEL', 'OPENAI_FALLBACK_MODEL', 'GEMINI_FALLBACK_MODEL',
  'LLM_STALL_SECONDS',
];
const sse = (text: string) => `data: {"choices":[{"delta":{"content":"${text}"}}]}\n\ndata: [DONE]\n\n`;
const ok = (text: string) => new Response(sse(text), { status: 200 });

describe('độ tin cậy gọi AI', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    clearLlmCache();
    for (const k of KEYS) vi.stubEnv(k, '');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('OPENAI_BASE_URL', 'https://llm.example.test/v1');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    clearLlmCache();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lỗi thoáng qua (503) được thử lại và thành công', async () => {
    fetchMock.mockResolvedValueOnce(new Response('busy', { status: 503 })).mockResolvedValueOnce(ok('Xong'));
    const r = await callLiveLlm('s', 'u');
    expect(r.ok).toBe(true);
    expect(r.content).toBe('Xong');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('thử lại tối đa 3 lần rồi báo ai_busy khi toàn 429', async () => {
    fetchMock.mockImplementation(async () => new Response('slow down', { status: 429 }));
    const r = await callLiveLlm('s', 'u');
    expect(r.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(r.code).toBe('ai_busy');
  });

  it('401: không thử lại vô ích, mã ai_auth', async () => {
    fetchMock.mockImplementation(async () => new Response('unauthorized', { status: 401 }));
    const r = await callLiveLlm('s', 'u');
    expect(r.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.code).toBe('ai_auth');
  });

  it('lỗi 500 nhưng nội dung nói OAuth hết hạn: vẫn là ai_auth, không thử lại', async () => {
    fetchMock.mockImplementation(async () => new Response('{"error":"OAuth token expired, please login"}', { status: 500 }));
    const r = await callLiveLlm('s', 'u');
    expect(r.code).toBe('ai_auth');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('mô hình dự phòng được thử khi mô hình chính hỏng (không phải do khoá)', async () => {
    vi.stubEnv('OPENAI_MODEL', 'model-chinh');
    vi.stubEnv('OPENAI_FALLBACK_MODEL', 'model-du-phong');
    let call = 0;
    fetchMock.mockImplementation(async (_u: string, init: { body: string }) => {
      call++;
      const m = JSON.parse(init.body).model as string;
      return m === 'model-du-phong' ? ok('Từ dự phòng') : new Response('bad gateway', { status: 502 });
    });
    const r = await callLiveLlm('s', 'u');
    expect(r.ok).toBe(true);
    expect(r.content).toBe('Từ dự phòng');
    expect(r.modelUsed).toContain('model-du-phong');
    expect(call).toBe(4); // 3 lần mô hình chính + 1 lần dự phòng
  });

  it('khoá bị từ chối thì không đổi sang mô hình dự phòng', async () => {
    vi.stubEnv('OPENAI_FALLBACK_MODEL', 'model-du-phong');
    fetchMock.mockImplementation(async () => new Response('no', { status: 403 }));
    const r = await callLiveLlm('s', 'u');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.code).toBe('ai_auth');
  });

  it('chuyển sang nhà cung cấp kế tiếp khi nhà cung cấp đầu hỏng', async () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk');
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('groq') ? new Response('x', { status: 400 }) : ok('Từ proxy'),
    );
    const r = await callLiveLlm('s', 'u');
    expect(r.ok).toBe(true);
    expect(r.content).toBe('Từ proxy');
  });

  it('đồng hồ "không thấy chữ nào": bỏ kết nối im lặng, báo timeout, không thử lại', async () => {
    const stream = new ReadableStream<Uint8Array>({ start() {} });
    fetchMock.mockImplementation(async () => new Response(stream, { status: 200 }));
    const t0 = Date.now();
    const r = await callLiveLlm('s', 'u', undefined, { stallMs: 150, timeoutMs: 5000 });
    expect(r.ok).toBe(false);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(r.error ?? '').toMatch(/timeout|không thấy chữ/i);
    expect(r.code).toBe('ai_timeout');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('có chữ về đều đặn thì đồng hồ im lặng không ngắt', async () => {
    const enc = new TextEncoder();
    let i = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(c) {
        await new Promise((r) => setTimeout(r, 60));
        if (i < 4) c.enqueue(enc.encode(`data: {"choices":[{"delta":{"content":"a${i++}"}}]}\n\n`));
        else {
          c.enqueue(enc.encode('data: [DONE]\n\n'));
          c.close();
        }
      },
    });
    fetchMock.mockImplementation(async () => new Response(stream, { status: 200 }));
    const r = await callLiveLlm('s', 'u', undefined, { stallMs: 200, timeoutMs: 5000 });
    expect(r.ok).toBe(true);
    expect(r.content).toBe('a0a1a2a3');
  });

  it('chưa cấu hình AI nào: ai_unconfigured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const r = await callLiveLlm('s', 'u');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('ai_unconfigured');
  });
});

describe('Sinh lại không bị bộ nhớ đệm trả y hệt', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    clearLlmCache();
    for (const k of KEYS) vi.stubEnv(k, '');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('OPENAI_BASE_URL', 'https://llm.example.test/v1');
    let n = 0;
    fetchMock = vi.fn(async () => ok(`Bản ${++n}`));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    clearLlmCache();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('cùng lời nhắc: lần 2 trúng đệm; có nonce thì gọi AI mới và lời nhắc yêu cầu phương án khác', async () => {
    const opts = { useCache: true };
    const a = await callLiveLlm('sys', 'user', undefined, opts);
    const b = await callLiveLlm('sys', 'user', undefined, opts);
    expect(b.modelUsed).toContain('Cache 0 token');
    expect(b.content).toBe(a.content);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const c = await withVariation('abc123', () => callLiveLlm('sys', 'user', undefined, opts));
    expect(c.modelUsed).not.toContain('Cache 0 token');
    expect(c.content).not.toBe(a.content);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sent = JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body);
    expect(sent.messages[1].content).toContain('abc123');
    expect(sent.messages[1].content).toContain('KHÁC');

    const d = await withVariation('zzz999', () => callLiveLlm('sys', 'user', undefined, opts));
    expect(d.content).not.toBe(c.content);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('vary:false (bước chấm điểm) không bị gắn yêu cầu phương án khác', async () => {
    await withVariation('abc123', () => callLiveLlm('sys', 'user', undefined, { vary: false }));
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(sent.messages[1].content).toBe('user');
  });
});

describe('phân loại lỗi AI', () => {
  it('nhận ra AI chưa đăng nhập / hết hạn', () => {
    expect(isAiAuthText('LLM HTTP 401')).toBe(true);
    expect(isAiAuthText('Chưa gọi được AI (LLM HTTP 403).')).toBe(true);
    expect(isAiAuthText('OAuth token expired')).toBe(true);
    expect(isAiAuthText('session expired')).toBe(true);
    expect(isAiAuthText('LLM HTTP 500')).toBe(false);
    expect(isAiAuthText('')).toBe(false);
    expect(isAiAuthText(undefined)).toBe(false);
  });
  it('mã lỗi và thông điệp tiếng Việt', () => {
    expect(codeFromErrorText('LLM HTTP 429')).toBe('ai_busy');
    expect(codeFromErrorText('LLM timeout (đã quá thời gian chờ)')).toBe('ai_timeout');
    expect(codeFromErrorText('LLM HTTP 401')).toBe('ai_auth');
    expect(codeFromErrorText('gì đó')).toBe('ai_unavailable');
    expect(llmErrorMessage('ai_auth')).toMatch(/đăng nhập/);
    expect(llmErrorMessage('ai_quota')).toMatch(/hạn mức|lượt soạn/);
    for (const c of ['ai_auth', 'ai_busy', 'ai_timeout', 'ai_quota', 'ai_unconfigured', 'ai_unavailable'] as const) {
      expect(llmErrorMessage(c)).not.toMatch(/HTTP|token|OAuth|LLM/);
    }
  });
});
