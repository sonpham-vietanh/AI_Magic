import { afterEach, describe, expect, it, vi } from 'vitest';
import { rateLimit } from '@/lib/server/rateLimit';

const req = () =>
  new Request('http://localhost/api/x', { headers: { 'x-forwarded-for': '9.9.9.9' } });

describe('rateLimit', () => {
  afterEach(() => vi.useRealTimers());

  it('allows up to limit then returns 429 with Retry-After', async () => {
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(await rateLimit(req(), b, 3, 60_000)).toBeNull();
    const res = await rateLimit(req(), b, 3, 60_000);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get('Retry-After')).toBeTruthy();
  });

  it('resets after the window expires', async () => {
    vi.useFakeTimers();
    const b = `w-${Math.random()}`;
    expect(await rateLimit(req(), b, 1, 1000)).toBeNull();
    expect((await rateLimit(req(), b, 1, 1000))!.status).toBe(429);
    vi.advanceTimersByTime(1500);
    expect(await rateLimit(req(), b, 1, 1000)).toBeNull();
  });

  it('isolates buckets', async () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    expect(await rateLimit(req(), a, 1, 1000)).toBeNull();
    expect(await rateLimit(req(), b, 1, 1000)).toBeNull();
  });
});
