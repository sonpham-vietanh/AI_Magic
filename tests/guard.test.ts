import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAccess, timingSafeEqualStr } from '@/lib/server/guard';

const req = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/x', { headers });

describe('guard', () => {
  beforeEach(() => vi.stubEnv('APP_API_TOKEN', 'secret-token'));
  afterEach(() => vi.unstubAllEnvs());

  it('accepts matching bearer token', async () => {
    expect(await requireAccess(req({ authorization: 'Bearer secret-token' }))).toBeNull();
  });
  it('accepts same-origin browser requests', async () => {
    expect(await requireAccess(req({ 'sec-fetch-site': 'same-origin' }))).toBeNull();
  });
  it('rejects wrong token, cross-site and anonymous with 401', async () => {
    for (const h of <Record<string, string>[]>[
      { authorization: 'Bearer nope' },
      { 'sec-fetch-site': 'cross-site' },
      {},
    ]) {
      const res = await requireAccess(req(h));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(401);
    }
  });
  it('timingSafeEqualStr compares correctly', () => {
    expect(timingSafeEqualStr('abc', 'abc')).toBe(true);
    expect(timingSafeEqualStr('abc', 'abd')).toBe(false);
    expect(timingSafeEqualStr('abc', 'abcd')).toBe(false);
  });
});
