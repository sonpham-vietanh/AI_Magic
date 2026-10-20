import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  callLiveLlm,
  streamLiveLlm,
  withLlmDeltaSink,
} from '@/lib/engine/llmClient';

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
  `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\r\n\r\n`;

// Tách chuỗi SSE thành các chunk bị cắt giữa dòng.
function sseResponse(): Response {
  const full = ev('Xin ') + ev('chào ') + ev('Việt Anh') + 'data: [DONE]\r\n\r\n';
  const enc = new TextEncoder().encode(full);
  const cuts = [7, 31, 60, 95, enc.length];
  let prev = 0;
  const parts = cuts.map((c) => {
    const p = enc.slice(prev, Math.min(c, enc.length));
    prev = Math.min(c, enc.length);
    return p;
  });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of parts) if (p.length) controller.enqueue(p);
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe('LLM streaming', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    for (const k of KEYS) vi.stubEnv(k, '');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    fetchMock = vi.fn(async () => sseResponse());
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('streamLiveLlm yields deltas in order across split chunks', async () => {
    const deltas: string[] = [];
    const gen = streamLiveLlm('sys', 'user');
    let step = await gen.next();
    while (!step.done) {
      deltas.push(step.value);
      step = await gen.next();
    }
    expect(deltas).toEqual(['Xin ', 'chào ', 'Việt Anh']);
    expect(step.value.ok).toBe(true);
    expect(step.value.content).toBe('Xin chào Việt Anh');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('callLiveLlm still returns the joined text', async () => {
    const r = await callLiveLlm('sys', 'user');
    expect(r.ok).toBe(true);
    expect(r.content).toBe('Xin chào Việt Anh');
  });

  it('withLlmDeltaSink forwards deltas from a single LLM call', async () => {
    const got: string[] = [];
    const r = await withLlmDeltaSink(
      (t) => got.push(t),
      () => callLiveLlm('sys', 'user'),
    );
    expect(got.join('')).toBe('Xin chào Việt Anh');
    expect(r.content).toBe('Xin chào Việt Anh');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
