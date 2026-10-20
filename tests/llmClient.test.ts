import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callLiveLlm } from '@/lib/engine/llmClient';

const KEYS = [
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'OPENROUTER_MODEL',
  'GEMINI_MODEL',
];

describe('callLiveLlm', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    for (const k of KEYS) vi.stubEnv(k, '');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns ok:false without calling fetch when no keys', async () => {
    const r = await callLiveLlm('sys', 'user');
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('joins SSE chunks from OpenAI-compatible endpoint', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('OPENAI_BASE_URL', 'https://llm.example.test/v1');
    const body =
      'data: {"choices":[{"delta":{"content":"Xin "}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"chào"}}]}\n\n' +
      'data: [DONE]\n\n';
    fetchMock.mockResolvedValue(new Response(body, { status: 200 }));
    const r = await callLiveLlm('sys', 'user');
    expect(r.ok).toBe(true);
    expect(r.content).toBe('Xin chào');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('llm.example.test');
  });

  it('returns ok:false on HTTP error', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    const r = await callLiveLlm('sys', 'user');
    expect(r.ok).toBe(false);
  });
});
