import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreReadError, StoreWriteError, createMutex, readJsonStrict, writeJsonAtomic } from '@/lib/server/safeJson';
import { REVIEWER_HEADER, normalizeActorName, requireReviewer, sameActor } from '@/lib/server/roles';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'safejson-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('readJsonStrict', () => {
  it('tệp chưa có: dùng giá trị mặc định', async () => {
    const r = await readJsonStrict(join(dir, 'none.json'), () => ({ empty: true }));
    expect(r).toEqual({ empty: true });
  });

  it('đọc được JSON hợp lệ', async () => {
    const f = join(dir, 'a.json');
    await writeFile(f, JSON.stringify({ x: 1 }));
    expect(await readJsonStrict(f, () => ({ x: 0 }))).toEqual({ x: 1 });
  });

  it('lỗi đọc KHÁC "chưa có" thì ném lỗi và KHÔNG dùng giá trị mặc định (không ghi đè dữ liệu thật)', async () => {
    const fallback = vi.fn(() => ({}));
    // Đường dẫn là một thư mục: readFile báo EISDIR (lỗi đọc thoáng qua loại không phải ENOENT).
    const asDir = join(dir, 'isdir.json');
    await mkdir(asDir);
    await expect(readJsonStrict(asDir, fallback)).rejects.toBeInstanceOf(StoreReadError);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('JSON hỏng: sao lưu sang .corrupt-* rồi mới bắt đầu lại', async () => {
    const f = join(dir, 'bad.json');
    await writeFile(f, '{"x": 1,,,');
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await readJsonStrict(f, () => ({ fresh: true }));
    err.mockRestore();
    expect(r).toEqual({ fresh: true });
    const files = await readdir(dir);
    const backup = files.find((n) => n.startsWith('bad.json.corrupt-'));
    expect(backup).toBeTruthy();
    expect(await readFile(join(dir, backup as string), 'utf8')).toContain('{"x": 1,,,');
  });
});

describe('writeJsonAtomic', () => {
  it('ghi được và không để lại tệp tạm', async () => {
    const f = join(dir, 'w.json');
    await writeJsonAtomic(f, { a: [1, 2, 3] });
    expect(JSON.parse(await readFile(f, 'utf8'))).toEqual({ a: [1, 2, 3] });
    expect((await readdir(dir)).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('lỗi ghi PHẢI ném StoreWriteError (không nuốt) và dọn tệp tạm', async () => {
    const target = join(dir, 'target.json');
    await mkdir(target); // đích là thư mục nên rename chắc chắn lỗi
    await expect(writeJsonAtomic(target, { a: 1 })).rejects.toBeInstanceOf(StoreWriteError);
    expect((await readdir(dir)).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('nhiều lần ghi đồng thời không đè tên tệp tạm của nhau', async () => {
    const f = join(dir, 'c.json');
    await Promise.all(Array.from({ length: 20 }, (_, i) => writeJsonAtomic(f, { i })));
    const j = JSON.parse(await readFile(f, 'utf8')) as { i: number };
    expect(typeof j.i).toBe('number');
    expect((await readdir(dir)).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });
});

describe('createMutex', () => {
  it('chạy tuần tự đúng thứ tự gọi', async () => {
    const lock = createMutex();
    const order: number[] = [];
    await Promise.all(
      [30, 5, 15].map((ms, i) =>
        lock(async () => {
          await new Promise((r) => setTimeout(r, ms));
          order.push(i);
        }),
      ),
    );
    expect(order).toEqual([0, 1, 2]);
  });

  it('lỗi của một tác vụ không làm hỏng hàng đợi', async () => {
    const lock = createMutex();
    await expect(lock(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(await lock(async () => 42)).toBe(42);
  });
});

describe('requireReviewer và so khớp tên', () => {
  const req = (key?: string) => new Request('http://x/y', { headers: key ? { [REVIEWER_HEADER]: key } : {} });
  const saved = process.env.REVIEWER_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.REVIEWER_KEY;
    else process.env.REVIEWER_KEY = saved;
  });

  it('chưa cấu hình REVIEWER_KEY: từ chối tất cả (503)', () => {
    delete process.env.REVIEWER_KEY;
    expect(requireReviewer(req('bat-ky'))?.status).toBe(503);
  });

  it('thiếu hoặc sai mã: 403; đúng mã: cho qua', () => {
    process.env.REVIEWER_KEY = 'ma-dung-123';
    expect(requireReviewer(req())?.status).toBe(403);
    expect(requireReviewer(req('sai'))?.status).toBe(403);
    expect(requireReviewer(req('ma-dung-123'))).toBeNull();
  });

  it('so khớp tên bỏ qua hoa/thường, khoảng trắng thừa và dạng Unicode', () => {
    expect(normalizeActorName('  Nguyễn   A ')).toBe('nguyễn a');
    expect(sameActor('Nguyễn A', 'NGUYỄN  a')).toBe(true);
    // chữ "ễ" dạng tổ hợp (e + dấu mũ + dấu ngã) phải bằng dạng dựng sẵn
    expect(sameActor('Nguyễn A', 'Nguyễn A')).toBe(true);
    expect(sameActor('', '')).toBe(false);
    expect(sameActor('A', 'B')).toBe(false);
  });
});
