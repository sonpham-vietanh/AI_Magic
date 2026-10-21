import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', async (orig) => ({
  ...(await orig<typeof import('@/lib/supabase')>()),
  fetchSupabaseAtomDetail: vi.fn(async () => ({
    atom: {
      id: 'KC-1',
      code: 'KC-1',
      title: 'Bài thử',
      subject: 'Toán',
      grade: 7,
      chapter: 'C1',
      lesson: 'L1',
      yeu_cau: 'Yêu cầu',
      quan_niem_sai: 'Sai',
    },
    packages: [],
    factoryAssets: [],
    edges: [],
    questions: [],
    socratic: [],
    tainguyen: [],
  })),
}));

import { POST } from '@/app/api/generate-pack/route';

const KEYS = [
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'OPENROUTER_MODEL',
  'GEMINI_MODEL',
];

const ev = (t: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;

function llmResponse(): Response {
  const full =
    ev('I. Mục tiêu ') + ev('===PHIEU_HOC_TAP===') + ev('Nhiệm vụ 1') + 'data: [DONE]\n\n';
  return new Response(full, { status: 200 });
}

function req(accept?: string) {
  return new Request('http://localhost/api/generate-pack', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Sec-Fetch-Site': 'same-origin',
      ...(accept ? { Accept: accept } : {}),
    },
    body: JSON.stringify({ mode: 'lesson_pack', atomId: 'KC-1', grade: '7' }),
  });
}

describe('POST /api/generate-pack streaming', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    for (const k of KEYS) vi.stubEnv(k, '');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    fetchMock = vi.fn(async () => llmResponse());
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('emits stage -> delta -> done in order with a single LLM call', async () => {
    const res = await POST(req('text/event-stream'));
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    const events = text
      .split('\n\n')
      .filter((b) => b.startsWith('data:'))
      .map((b) => JSON.parse(b.slice(5).trim()) as Record<string, unknown>);

    const types = events.map((e) => e.type);
    expect(types[types.length - 1]).toBe('done');
    expect(types).not.toContain('error');
    const firstDelta = types.indexOf('delta');
    const doneIdx = types.length - 1;
    expect(firstDelta).toBeGreaterThan(-1);
    expect(firstDelta).toBeLessThan(doneIdx);

    const stage = (id: string, status: string) =>
      events.findIndex((e) => e.type === 'stage' && e.id === id && e.status === status);
    // phần tất định xong trước khi LLM stream
    expect(stage('kiem_tra_nhanh', 'done')).toBeGreaterThan(-1);
    expect(stage('kiem_tra_nhanh', 'done')).toBeLessThan(firstDelta);
    expect(stage('cam_nang_socratic', 'done')).toBeLessThan(firstDelta);
    expect(stage('giao_an', 'start')).toBeLessThan(firstDelta);
    expect(stage('giao_an', 'done')).toBeGreaterThan(firstDelta);
    expect(stage('phieu_hoc_tap', 'done')).toBeLessThan(doneIdx);

    const deltaText = events
      .filter((e) => e.type === 'delta')
      .map((e) => e.text)
      .join('');
    expect(deltaText).toBe('I. Mục tiêu ===PHIEU_HOC_TAP===Nhiệm vụ 1');

    const pack = events[doneIdx].pack as { sections: unknown[] };
    expect(pack.sections).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the default JSON path unchanged', async () => {
    const res = await POST(req());
    expect(res.headers.get('content-type')).toContain('application/json');
    const data = (await res.json()) as { ok: boolean; pack: { sections: unknown[] } };
    expect(data.ok).toBe(true);
    expect(data.pack.sections).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
