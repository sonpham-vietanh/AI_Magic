import { describe, expect, it, vi, afterEach } from 'vitest';
import { GET } from '@/app/api/integrations/status/route';

afterEach(() => vi.unstubAllEnvs());

function req() {
  return new Request('http://localhost/api/integrations/status', {
    headers: { 'sec-fetch-site': 'same-origin', 'x-forwarded-for': '10.9.9.' + Math.floor(Math.random() * 200) },
  });
}

describe('GET /api/integrations/status', () => {
  it('chỉ trả có/không, không lộ tên hay giá trị biến môi trường', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-super-secret-value');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://secret-project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_secret');
    const res = await GET(req());
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain('sk-or-super-secret-value');
    expect(text).not.toContain('secret-project');
    expect(text).not.toMatch(/_API_KEY|SUPABASE_URL|envNames/);
    const j = JSON.parse(text);
    expect(j.ai.openrouter).toBe(true);
    expect(j.cloud.configured).toBe(true);
    expect(typeof j.login.google).toBe('boolean');
    expect(Array.isArray(j.services)).toBe(true);
  });

  it('báo chưa nối AI khi không có khoá', async () => {
    for (const k of ['OPENROUTER_API_KEY', 'OPENROUTER_API_KEYS', 'GEMINI_API_KEY', 'GEMINI_API_KEYS', 'GROQ_API_KEY', 'GROQ_API_KEYS', 'OPENAI_API_KEY', 'OPENAI_API_KEYS']) vi.stubEnv(k, '');
    const j = await (await GET(req())).json();
    expect(j.ai.any).toBe(false);
  });
});
