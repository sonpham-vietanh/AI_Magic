import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { readJsonStrict, writeJsonAtomic, StoreReadError, StoreWriteError } from '@/lib/server/safeJson';
import {
  VA_APP_STORE_TABLE,
  VA_ISOLATED_KV_COLLECTION,
  isCloudStoreEnabled,
  readCloudStore,
  resetCloudStoreCache,
  resolveCloudStoreKey,
  writeCloudStore,
} from '@/lib/server/supabaseStore';

describe('Kho đám mây Supabase cô lập (va_app_store / va_app_store_v2)', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    resetCloudStoreCache();
    process.env.VA_ENABLE_SUPABASE_STORE_IN_TEST = '1';
    process.env.VA_CLOUD_STORE = '1';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...origEnv };
    resetCloudStoreCache();
  });

  it('chỉ ánh xạ các kho chuẩn nằm trong .data/*.json và bỏ qua thư mục tạm', () => {
    const validPath = join(process.cwd(), '.data', 'kho-reviews.json');
    expect(resolveCloudStoreKey(validPath)).toBe('kho-reviews');

    const tempPath = join(process.cwd(), 'tmp', 'kho-reviews.json');
    expect(resolveCloudStoreKey(tempPath)).toBeNull();

    const unknownFile = join(process.cwd(), '.data', 'unknown-store.json');
    expect(resolveCloudStoreKey(unknownFile)).toBeNull();
  });

  it('ưu tiên đọc/ghi bảng mới độc lập public.va_app_store khi bảng đã được tạo', async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : undefined;
      calls.push({ url, method, body });

      if (method === 'POST') {
        return new Response('', { status: 201 });
      }
      return new Response(JSON.stringify([{ payload: { reviews: [{ id: 'r1' }] } }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const w = await writeCloudStore('kho-reviews', { reviews: [{ id: 'r1' }] });
    expect(w.ok).toBe(true);
    expect(w.backend).toBe('dedicated_table');
    expect(calls[0].url).toContain(`/rest/v1/${VA_APP_STORE_TABLE}?on_conflict=store_key`);

    resetCloudStoreCache();
    const r = await readCloudStore<{ reviews: { id: string }[] }>('kho-reviews');
    expect(r.found).toBe(true);
    expect(r.backend).toBe('dedicated_table');
    expect(r.data?.reviews[0].id).toBe('r1');
  });

  it('tự động chuyển sang phân vùng cô lập va_app_store_v2 nếu bảng va_app_store chưa chạy migration (404), tuyệt đối không đụng dữ liệu gốc', async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : undefined;
      calls.push({ url, method, body });

      if (url.includes(`/${VA_APP_STORE_TABLE}`)) {
        return new Response(JSON.stringify({ code: 'PGRST205', message: 'Could not find the table' }), {
          status: 404,
        });
      }
      if (method === 'POST' && url.includes('/studio_kv')) {
        return new Response('', { status: 201 });
      }
      return new Response(JSON.stringify([{ j: { exams: ['ex_1'] } }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const w = await writeCloudStore('assessment', { exams: ['ex_1'] });
    expect(w.ok).toBe(true);
    expect(w.backend).toBe('isolated_kv');

    // Kiểm tra chắc chắn ghi vào collection cô lập va_app_store_v2, không phải packages/reviews/atoms gốc
    const postCall = calls.find((c) => c.method === 'POST' && c.url.includes('/studio_kv'));
    expect(postCall).toBeDefined();
    const parsedBody = JSON.parse(postCall!.body!);
    expect(parsedBody.collection).toBe(VA_ISOLATED_KV_COLLECTION);
    expect(parsedBody.id).toBe('assessment');

    resetCloudStoreCache();
    const r = await readCloudStore<{ exams: string[] }>('assessment');
    expect(r.found).toBe(true);
    expect(r.backend).toBe('isolated_kv');
    expect(r.data?.exams).toEqual(['ex_1']);
  });

  it('lỗi mạng/5xx khi đọc KHÔNG được coi là chưa có dữ liệu (failed)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('boom', { status: 500 }));
    const r = await readCloudStore('assessment');
    expect(r.found).toBe(false);
    expect(r.failed).toBe(true);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    resetCloudStoreCache();
    expect((await readCloudStore('assessment')).failed).toBe(true);
  });

  it('chưa có dòng nào thì found=false và KHÔNG failed', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const r = await readCloudStore('assessment');
    expect(r.found).toBe(false);
    expect(r.failed).toBeUndefined();
  });

  it('máy dev (không phải production, không bật cờ) không đụng kho đám mây', () => {
    delete process.env.VA_CLOUD_STORE;
    expect(isCloudStoreEnabled()).toBe(false);
  });

  it('chỉ dùng khóa secret, không dùng khóa publishable', () => {
    delete process.env.SUPABASE_SECRET_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_x';
    expect(isCloudStoreEnabled()).toBe(false);
  });

  describe('safeJson với kho đám mây', () => {
    let cwd = '';
    let prev = '';
    beforeEach(async () => {
      prev = process.cwd();
      cwd = await mkdtemp(join(tmpdir(), 'cloudstore-'));
      await mkdir(join(cwd, '.data'), { recursive: true });
      process.chdir(cwd);
    });
    afterEach(async () => {
      process.chdir(prev);
      await rm(cwd, { recursive: true, force: true });
    });

    it('đọc đám mây lỗi: ném StoreReadError, không quay về tệp cục bộ cũ', async () => {
      const f = join(cwd, '.data', 'assessment.json');
      await writeFile(f, JSON.stringify({ old: true }));
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('boom', { status: 503 }));
      await expect(readJsonStrict(f, () => ({}))).rejects.toBeInstanceOf(StoreReadError);
    });

    it('ghi đám mây lỗi: ném StoreWriteError và KHÔNG ghi đĩa', async () => {
      const f = join(cwd, '.data', 'assessment.json');
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('boom', { status: 500 }));
      await expect(writeJsonAtomic(f, { a: 1 })).rejects.toBeInstanceOf(StoreWriteError);
      await expect(readFile(f, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('ghi đám mây được thì ghi cả đĩa', async () => {
      const f = join(cwd, '.data', 'assessment.json');
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('', { status: 201 }));
      await writeJsonAtomic(f, { a: 1 });
      expect(JSON.parse(await readFile(f, 'utf8'))).toEqual({ a: 1 });
    });
  });
});
