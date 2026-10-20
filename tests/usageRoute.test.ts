import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', async (orig) => ({
  ...(await orig<typeof import('@/lib/supabase')>()),
  fetchSupabaseActivityAndReviews: vi.fn(async () => ({ activities: [], reviews: [] })),
}));

const call = async (url: string, headers: Record<string, string> = {}) => {
  const { GET } = await import('@/app/api/major-os/usage/route');
  return GET(new Request(url, { headers }));
};

describe('GET /api/major-os/usage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('503 when MAJOR_OS_API_KEY is not configured', async () => {
    vi.stubEnv('MAJOR_OS_API_KEY', '');
    const res = await call('http://localhost/api/major-os/usage');
    expect(res.status).toBe(503);
  });

  it('401 for missing or wrong bearer, and ?demo=1 does not bypass', async () => {
    vi.stubEnv('MAJOR_OS_API_KEY', 'k123');
    expect((await call('http://localhost/api/major-os/usage')).status).toBe(401);
    expect(
      (await call('http://localhost/api/major-os/usage', { authorization: 'Bearer bad' })).status,
    ).toBe(401);
    expect((await call('http://localhost/api/major-os/usage?demo=1')).status).toBe(401);
  });

  it('200 with correct bearer and expected shape', async () => {
    vi.stubEnv('MAJOR_OS_API_KEY', 'k123');
    const res = await call('http://localhost/api/major-os/usage', {
      authorization: 'Bearer k123',
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.du_lieu)).toBe(true);
    expect(json).toHaveProperty('con_nua');
    expect(json).toHaveProperty('trang_sau');
  });
});
