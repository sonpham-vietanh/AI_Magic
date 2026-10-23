import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const llm = vi.hoisted(() => ({ callLiveLlm: vi.fn() }));
vi.mock('@/lib/engine/llmClient', async (orig) => ({
  ...(await orig<typeof import('@/lib/engine/llmClient')>()),
  callLiveLlm: llm.callLiveLlm,
}));
vi.mock('@/lib/server/store', async (orig) => ({
  ...(await orig<typeof import('@/lib/server/store')>()),
  recordUsageEvent: vi.fn(async () => undefined),
}));

const PLAN = 'I. Mục tiêu\nĐịnh lí $c^2 = a^2 + b^2$.\nII. Hoạt động\nHoạt động 1: Khởi động (5 phút)';

const post = async (path: 'refine' | 'assistant', body: unknown, headers: Record<string, string> = {}) => {
  const mod =
    path === 'refine' ? await import('@/app/api/workflows/refine/route') : await import('@/app/api/assistant/route');
  return mod.POST(
    new Request(`http://localhost/api/x`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', host: 'localhost', ...headers },
      body: JSON.stringify(body),
    }),
  );
};

describe('POST /api/workflows/refine', () => {
  beforeEach(() => {
    llm.callLiveLlm.mockReset();
    vi.stubEnv('USAGE_DAILY_LIMIT', '0');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('từ chối khi không cùng nguồn (không có quyền)', async () => {
    const res = await post('refine', { instruction: 'rút gọn', text: PLAN }, { origin: 'http://evil.example' });
    expect(res.status).toBe(401);
  });

  it('dữ liệu sai thì 400 với lời tiếng Việt', async () => {
    const res = await post('refine', { instruction: 'a'.repeat(501), text: PLAN });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/500 ký tự/);
    const res2 = await post('refine', { instruction: 'rút gọn', text: '' });
    expect(res2.status).toBe(400);
  });

  it('chỉnh thành công: giữ công thức, trả {ok, text, modelUsed}', async () => {
    llm.callLiveLlm.mockImplementation(async (_s: string, user: string) => {
      const inner = /<ban_soan>\n([\s\S]*?)\n<\/ban_soan>/.exec(user)![1];
      return { ok: true, content: inner.replace('(5 phút)', '(3 phút)'), modelUsed: 'giả lập' };
    });
    const res = await post('refine', { instruction: 'rút còn 35 phút', text: PLAN, format: 'Kế hoạch bài dạy' });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.text).toContain('$c^2 = a^2 + b^2$');
    expect(j.text).toContain('(3 phút)');
    expect(j.modelUsed).toBe('giả lập');
  });

  it('AI chưa đăng nhập: 502 kèm code ai_auth', async () => {
    llm.callLiveLlm.mockResolvedValue({ ok: false, modelUsed: 'x', error: 'HTTP 401 unauthorized' });
    const res = await post('refine', { instruction: 'rút gọn', text: PLAN });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('ai_auth');
  });
});

describe('POST /api/assistant (hợp nhất vào ô chat)', () => {
  beforeEach(() => {
    llm.callLiveLlm.mockReset();
    vi.stubEnv('USAGE_DAILY_LIMIT', '0');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('đưa lớp, bài và các lượt trước vào lời nhắc, trả câu trả lời sạch', async () => {
    llm.callLiveLlm.mockResolvedValue({ ok: true, content: '**1.** Cho học sinh đo cạnh tam giác.', modelUsed: 'giả lập' });
    const res = await post('assistant', {
      question: 'Còn cách nào khác?',
      classId: 'class-7a2-aht',
      lessonTitle: 'Định lí Pythagore',
      history: [{ role: 'teacher', text: 'Gợi ý khởi động' }],
    });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.reply).toBe('1. Cho học sinh đo cạnh tam giác.');
    const user = llm.callLiveLlm.mock.calls[0][1] as string;
    expect(user).toContain('Định lí Pythagore');
    expect(user).toContain('Cô/thầy: Gợi ý khởi động');
  });

  it('AI chưa đăng nhập: 502 kèm code ai_auth, không lộ chi tiết', async () => {
    llm.callLiveLlm.mockResolvedValue({ ok: false, modelUsed: 'x', error: 'OAuth token expired' });
    const res = await post('assistant', { question: 'Bloom là gì?' });
    expect(res.status).toBe(502);
    const j = await res.json();
    expect(j.code).toBe('ai_auth');
    expect(j.error).not.toMatch(/OAuth/);
  });
});
