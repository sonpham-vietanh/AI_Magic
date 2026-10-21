import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diffLines } from '@/lib/versions/diff';

let dir: string;
async function load() {
  vi.resetModules();
  return await import('@/lib/versions/store');
}
const base = {
  runId: 'r1',
  title: 'KHBD',
  format: 'ke_hoach',
  workflow: 'khbd',
  lessonKey: 'toan-10-1',
  text: 'a',
  actor: 'Lan',
};

describe('versions store', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ver-test-'));
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    rmSync(dir, { recursive: true, force: true });
  });

  it('đề kiểm tra không lưu toàn văn vào lịch sử phiên bản', async () => {
    const s = await load();
    const r = await s.saveVersion('vietanh', { ...base, workflow: 'de_kiem_tra', text: 'CÂU 1. nội dung đề bí mật' });
    const v = await s.getVersion('vietanh', r.id);
    expect(v!.text).not.toContain('bí mật');
    expect(v!.text).toBe(s.EXAM_PLACEHOLDER);
  });

  it('đánh số tăng dần theo (actor, bài, sản phẩm)', async () => {
    const s = await load();
    const a1 = await s.saveVersion('vietanh', base);
    const a2 = await s.saveVersion('vietanh', { ...base, text: 'b' });
    const other = await s.saveVersion('vietanh', { ...base, format: 'slide' });
    const otherLesson = await s.saveVersion('vietanh', { ...base, lessonKey: 'x' });
    const otherActor = await s.saveVersion('vietanh', { ...base, actor: 'Huy' });
    const sameActorCase = await s.saveVersion('vietanh', { ...base, actor: '  lan ' });
    expect([a1.number, a2.number, other.number, otherLesson.number, otherActor.number]).toEqual([1, 2, 1, 1, 1]);
    expect(sameActorCase.number).toBe(3);
  });

  it('chỉ liệt kê bản của đúng người và tách org', async () => {
    const s = await load();
    await s.saveVersion('vietanh', base);
    await s.saveVersion('vietanh', { ...base, actor: 'Huy' });
    await s.saveVersion('khac', base);
    expect(await s.listVersions('vietanh', 'Lan')).toHaveLength(1);
    expect(await s.listVersions('khac', 'Lan')).toHaveLength(1);
    const list = await s.listVersions('vietanh', 'Lan');
    expect(list[0]).not.toHaveProperty('text');
    const saved = await s.saveVersion('vietanh', { ...base, text: 'nội dung' });
    expect(await s.getVersion('khac', saved.id)).toBeNull();
    expect((await s.getVersion('vietanh', saved.id))?.text).toBe('nội dung');
  });

  it('giới hạn kích thước và số bản mỗi người', async () => {
    const s = await load();
    await expect(s.saveVersion('vietanh', { ...base, text: 'x'.repeat(100 * 1024 + 1) })).rejects.toBeInstanceOf(
      s.VersionLimitError,
    );
    const big = [{ kind: 'text', title: 't', data: { title: 't', sections: [{ heading: 'h', body: 'y'.repeat(1024 * 1024) }] } }];
    await expect(s.saveVersion('vietanh', { ...base, artifacts: big as never })).rejects.toBeInstanceOf(
      s.VersionLimitError,
    );
    for (let i = 0; i < 203; i++) await s.saveVersion('vietanh', { ...base, lessonKey: `l${i}` });
    expect((await s.listVersions('vietanh', 'Lan', 200)).length).toBe(200);
  }, 30_000);

  it('không mất bản khi ghi đồng thời', async () => {
    const s = await load();
    const rs = await Promise.all(Array.from({ length: 15 }, () => s.saveVersion('vietanh', base)));
    expect(new Set(rs.map((r) => r.number)).size).toBe(15);
  });

  it('file hỏng được sao lưu và bắt đầu lại', async () => {
    mkdirSync(join(dir, '.data'));
    writeFileSync(join(dir, '.data', 'versions.json'), '{hỏng', 'utf8');
    const s = await load();
    const r = await s.saveVersion('vietanh', base);
    expect(r.number).toBe(1);
    const files = existsSync(join(dir, '.data')) ? readdirSync(join(dir, '.data')) : [];
    expect(files.some((f) => f.includes('corrupt'))).toBe(true);
  });
});

describe('diffLines', () => {
  it('đếm dòng thêm/xoá/giữ', () => {
    const d = diffLines('a\nb\nc', 'a\nc\nd');
    expect(d.added).toBe(1);
    expect(d.removed).toBe(1);
    expect(d.unchanged).toBe(2);
    expect(d.lines.map((l) => l.kind + ':' + l.text)).toEqual(['same:a', 'del:b', 'same:c', 'add:d']);
  });
  it('rỗng và giống nhau', () => {
    expect(diffLines('', '').lines).toEqual([]);
    expect(diffLines('x', 'x').added).toBe(0);
    expect(diffLines('', 'x\ny').added).toBe(2);
  });
});
