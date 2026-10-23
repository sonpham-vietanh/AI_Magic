import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runBackup, parseArgs as parseBackup } from '../scripts/backup-data.mjs';
import { applyRestore, planRestore, verifyBackupDir } from '../scripts/restore-data.mjs';
import { classify } from '../scripts/check-rls.mjs';

let root: string;
let data: string;
let out: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'va-backup-test-'));
  data = join(root, 'data');
  out = join(root, 'out');
  await mkdir(data, { recursive: true });
  await writeFile(join(data, 'eval.json'), JSON.stringify({ entries: [1, 2] }));
  await writeFile(join(data, 'user-roles.json'), JSON.stringify({ users: {} }));
  await writeFile(join(data, 'eval.json.corrupt-1'), 'bỏ qua');
  await writeFile(join(data, 'x.tmp'), 'bỏ qua');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('backup-data', () => {
  it('sao lưu chỉ các .json hợp lệ, kèm checksum', async () => {
    const r = await runBackup({ dataDir: data, out, keep: 5, supabase: false }, new Date('2026-10-23T01:02:03Z'));
    expect(r.dest.endsWith('va-backup-20261023T010203Z')).toBe(true);
    expect(Object.keys(r.manifest.files).sort()).toEqual(['eval.json', 'user-roles.json']);
    const v = await verifyBackupDir(r.dest);
    expect(v.problems).toEqual([]);
    expect(v.files).toHaveLength(2);
  });

  it('giữ N bản gần nhất và không xóa thư mục lạ', async () => {
    await mkdir(join(out, 'giu-lai-thu-muc-la'), { recursive: true });
    for (const t of ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']) {
      await runBackup({ dataDir: data, out, keep: 2, supabase: false }, new Date(`${t}T00:00:00Z`));
    }
    const names = (await readdir(out)).sort();
    expect(names).toEqual(['giu-lai-thu-muc-la', 'va-backup-20261022T000000Z', 'va-backup-20261023T000000Z']);
  });

  it('lỗi rõ ràng khi thư mục dữ liệu không có và tham số sai', async () => {
    await expect(runBackup({ dataDir: join(root, 'khong-co'), out, keep: 1, supabase: false })).rejects.toThrow();
    expect(() => parseBackup(['--keep', '0'])).toThrow();
    expect(() => parseBackup(['--la'])).toThrow();
  });
});

describe('restore-data', () => {
  it('dry-run không ghi gì; apply ghi đè, giữ bản cũ, bỏ qua tệp giống hệt', async () => {
    const b = await runBackup({ dataDir: data, out, keep: 5, supabase: false });
    const target = join(root, 'target');
    await mkdir(target);
    await writeFile(join(target, 'eval.json'), '{"entries":[]}');
    await writeFile(join(target, 'user-roles.json'), await readFile(join(data, 'user-roles.json')));

    const plan = await planRestore({ source: b.dest, target, only: null });
    expect(plan.problems).toEqual([]);
    const byName = Object.fromEntries(plan.items.map((i: { name: string; action: string }) => [i.name, i.action]));
    expect(byName['eval.json']).toBe('ghi đè');
    expect(byName['user-roles.json']).toContain('giống hệt');
    expect(await readFile(join(target, 'eval.json'), 'utf8')).toBe('{"entries":[]}');

    const done = await applyRestore(plan, new Date('2026-10-23T05:00:00Z'));
    expect(done).toEqual(['eval.json']);
    expect(JSON.parse(await readFile(join(target, 'eval.json'), 'utf8'))).toEqual({ entries: [1, 2] });
    expect(await readFile(join(target, 'eval.json.pre-restore-20261023T050000Z'), 'utf8')).toBe('{"entries":[]}');
  });

  it('dừng khi checksum lệch hoặc --only sai tên', async () => {
    const b = await runBackup({ dataDir: data, out, keep: 5, supabase: false });
    await writeFile(join(b.dest, 'eval.json'), '{"hong":true}');
    const plan = await planRestore({ source: b.dest, target: join(root, 'target'), only: null });
    expect(plan.problems.join(' ')).toContain('eval.json');
    await expect(planRestore({ source: b.dest, target: join(root, 't'), only: ['khong-co'] })).rejects.toThrow();
  });

  it('từ chối thư mục không có manifest', async () => {
    await expect(verifyBackupDir(data)).rejects.toThrow();
  });
});

describe('check-rls classify', () => {
  it('phân loại phản hồi', () => {
    expect(classify(200, '[{"id":1}]')).toBe('DOC_DUOC');
    expect(classify(200, '[]')).toBe('TRONG_HOAC_CHAN');
    expect(classify(401, '')).toBe('CHAN');
    expect(classify(404, '')).toBe('KHONG_CO');
    expect(classify(400, '{"code":"PGRST205"}')).toBe('KHONG_CO');
    expect(classify(500, 'x')).toBe('LOI');
  });
});
