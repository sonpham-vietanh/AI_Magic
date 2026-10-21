import { describe, expect, it } from 'vitest';
import { readJsonLimited } from '@/lib/server/body';

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('http://localhost/x', { method: 'POST', body, headers });

describe('readJsonLimited', () => {
  it('đọc JSON hợp lệ trong giới hạn', async () => {
    const r = await readJsonLimited(post('{"a":1}'), 100);
    expect(r).toEqual({ ok: true, data: { a: 1 } });
  });
  it('413 khi vượt giới hạn (đếm byte thật)', async () => {
    const r = await readJsonLimited(post(JSON.stringify({ a: 'x'.repeat(500) })), 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(413);
  });
  it('413 khi Content-Length khai báo quá lớn', async () => {
    const r = await readJsonLimited(post('{}', { 'content-length': '999999' }), 100);
    if (r.ok) throw new Error('phải từ chối');
    expect(r.response.status).toBe(413);
  });
  it('400 khi JSON hỏng hoặc rỗng', async () => {
    for (const b of ['{oops', '']) {
      const r = await readJsonLimited(post(b), 100);
      if (r.ok) throw new Error('phải từ chối');
      expect(r.response.status).toBe(400);
    }
  });
});
