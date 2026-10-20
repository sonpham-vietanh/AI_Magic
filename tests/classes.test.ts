import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const HEADERS = { 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' };
const URL_ = 'http://localhost/api/classes';

async function load() {
  vi.resetModules();
  return await import('@/app/api/classes/route');
}
const post = (r: { POST: (q: Request) => Promise<Response> }, body: unknown, raw?: string) =>
  r.POST(new Request(URL_, { method: 'POST', headers: HEADERS, body: raw ?? JSON.stringify(body) }));

describe('/api/classes', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(mkdtempSync(join(tmpdir(), 'classes-test-')));
  });
  afterEach(() => vi.restoreAllMocks());

  it('adds and lists notes', async () => {
    const r = await load();
    const res = await post(r, { action: 'add_note', classId: 'class-7a1-aht', note: ' Hello ' });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.note.note).toBe('Hello');
    await post(r, { action: 'add_note', classId: 'class-7a1-aht', note: 'Second' });
    const list = await r.GET(new Request(`${URL_}?classId=class-7a1-aht`, { headers: HEADERS }));
    const lj = await list.json();
    expect(lj.notes).toHaveLength(2);
    expect(lj.notes[0].note).toBe('Second');
  });

  it('validates input', async () => {
    const r = await load();
    expect((await post(r, { action: 'add_note', classId: 'class-7a1-aht', note: '' })).status).toBe(400);
    expect((await post(r, { action: 'add_note', classId: 'class-7a1-aht', note: 'x'.repeat(2001) })).status).toBe(400);
    expect((await post(r, { action: 'add_note', classId: '../etc', note: 'x' })).status).toBe(400);
    expect((await post(r, null, '{bad')).status).toBe(400);
  });

  it('404 for unknown class', async () => {
    const r = await load();
    expect((await post(r, { action: 'add_note', classId: 'nope-999', note: 'x' })).status).toBe(404);
    const g = await r.GET(new Request(`${URL_}?classId=nope-999`, { headers: HEADERS }));
    expect(g.status).toBe(404);
  });

  it('rejects cross-site requests', async () => {
    const r = await load();
    const res = await r.GET(new Request(`${URL_}?classId=class-7a1-aht`, { headers: { 'sec-fetch-site': 'cross-site' } }));
    expect([401, 403]).toContain(res.status);
  });
});
