import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dir: string;
const base = { nguoi: { ten: 'A', email: 'a@x.vn' }, tinh_nang: 'sinh_hoc_lieu' as const, so_lan: 1 };

async function loadStore() {
  vi.resetModules();
  return await import('@/lib/server/store');
}
const dataFiles = () => {
  const d = join(dir, '.data');
  return existsSync(d) ? readdirSync(d) : [];
};

describe('store', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'store-test-'));
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
  });
  afterEach(() => vi.restoreAllMocks());

  it('does not lose events under concurrent writes', async () => {
    const s = await loadStore();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        s.recordUsageEvent({
          ...base,
          id: `e${i}`,
          luc: `2026-01-01T00:00:${String(i).padStart(2, '0')}+07:00`,
        }),
      ),
    );
    const r = await s.queryMajorOsEvents({ limit: 500 });
    const mine = r.du_lieu.filter((e) => /^e\d+$/.test(e.id));
    expect(mine).toHaveLength(20);
    expect(new Set(mine.map((e) => e.id)).size).toBe(20);
  });

  it('paginates with trang_sau cursor', async () => {
    const s = await loadStore();
    for (let i = 0; i < 5; i++) {
      await s.recordUsageEvent({ ...base, id: `p${i}`, luc: `2030-01-0${i + 1}T00:00:00+07:00` });
    }
    const win = { tu: '2030-01-01T00:00:00+07:00', den: '2030-12-31T00:00:00+07:00' };
    const p1 = await s.queryMajorOsEvents({ ...win, limit: 2 });
    expect(p1.du_lieu).toHaveLength(2);
    expect(p1.trang_sau).toBeTruthy();
    const p2 = await s.queryMajorOsEvents({ ...win, limit: 2, trangSau: p1.trang_sau });
    const p3 = await s.queryMajorOsEvents({ ...win, limit: 2, trangSau: p2.trang_sau });
    expect(p3.du_lieu).toHaveLength(1);
    expect(p3.trang_sau).toBeNull();
    const ids = [...p1.du_lieu, ...p2.du_lieu, ...p3.du_lieu].map((e) => e.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('filters by tu/den', async () => {
    const s = await loadStore();
    for (let i = 1; i <= 5; i++) {
      await s.recordUsageEvent({ ...base, id: `f${i}`, luc: `2031-02-0${i}T00:00:00+07:00` });
    }
    const r = await s.queryMajorOsEvents({
      tu: '2031-02-02T00:00:00+07:00',
      den: '2031-02-04T00:00:00+07:00',
    });
    expect(r.du_lieu.map((e) => e.id).sort()).toEqual(['f2', 'f3', 'f4']);
  });

  it('backs up a corrupt store file instead of overwriting it', async () => {
    const s0 = await loadStore();
    await s0.recordUsageEvent({ ...base, id: 'seed' });
    const name = dataFiles().find((f) => f.endsWith('.json'))!;
    writeFileSync(join(dir, '.data', name), '{ not valid json', 'utf8');
    const s = await loadStore();
    await s.recordUsageEvent({ ...base, id: 'after' });
    const backups = dataFiles().filter((f) => f !== name);
    expect(backups.length).toBeGreaterThan(0);
    const contents = backups.map((b) => readFileSync(join(dir, '.data', b), 'utf8'));
    expect(contents.some((c) => c.includes('not valid json'))).toBe(true);
  });
});
