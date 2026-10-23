// Đồng bộ các kho dữ liệu vận hành (.data/*.json) lên Supabase bằng BẢNG MỚI ĐỘC LẬP (`va_app_store`)
// hoặc phân vùng cô lập `collection = 'va_app_store_v2'` trong `studio_kv` (nếu quản trị viên chưa chạy lệnh CREATE TABLE).
// TUYỆT ĐỐI KHÔNG ghi hay sửa các bảng/collection dữ liệu gốc (`atoms`, `edges`, `questions`, `socratic`, `resources`,
// `packages`, `tainguyen`, `activity`, `reviews`, `users`, `_meta`).

import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

export const VA_APP_STORE_TABLE = process.env.SUPABASE_APP_STORE_TABLE || 'va_app_store';
export const VA_ISOLATED_KV_COLLECTION = 'va_app_store_v2';

export type CloudBackendKind = 'dedicated_table' | 'isolated_kv' | 'disabled';

interface CacheEntry {
  data: unknown;
  at: number;
  backend: CloudBackendKind;
}

const CACHE_TTL_MS = 4_000;
const memoryCache = new Map<string, CacheEntry>();

// Các kho chuẩn trong thư mục `.data/` được phép đồng bộ lên Supabase.
const ALLOWED_STORE_KEYS = new Set([
  'teaching-studio-store',
  'versions',
  'kho-reviews',
  'kho-assets',
  'assessment',
  'eval',
  'signals',
  'class-notes',
  'teacher-sessions',
  'user-prefs',
  'user-roles',
  'usage-ledger',
  'audit-log',
  'ops-log',
]);

/** Danh sách khóa kho chuẩn (dùng cho sao lưu và xuất dữ liệu). */
export const STORE_KEYS: readonly string[] = [...ALLOWED_STORE_KEYS];

function getSupabaseCreds(): { url: string; key: string } | null {
  // Trong môi trường chạy unit test (Vitest), mặc định tắt tự động gọi mạng trừ khi bài test bật cờ riêng.
  if (
    (process.env.VITEST || process.env.NODE_ENV === 'test') &&
    process.env.VA_ENABLE_SUPABASE_STORE_IN_TEST !== '1'
  ) {
    return null;
  }
  // Máy dev dùng chung `.env.local` với production nên mặc định KHÔNG đồng bộ lên kho đám mây thật.
  // Chỉ bật khi chạy production, hoặc khi đặt VA_CLOUD_STORE=1 một cách chủ động.
  if (process.env.NODE_ENV !== 'production' && process.env.VA_CLOUD_STORE !== '1') return null;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  // Ghi dữ liệu vận hành chỉ bằng khóa secret của máy chủ, không dùng khóa publishable.
  const key = (process.env.SUPABASE_SECRET_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

/** Kho đám mây có đang bật không (đủ cấu hình và đúng môi trường). */
export function isCloudStoreEnabled(): boolean {
  return getSupabaseCreds() !== null;
}

/**
 * Chỉ ánh xạ các tệp nằm đúng trong thư mục `.data/<name>.json` của dự án.
 * Các tệp tạm trong thư mục test (`os.tmpdir()`) trả về `null` để không bao giờ đẩy dữ liệu test lên đám mây.
 */
export function resolveCloudStoreKey(filePath: string): string | null {
  try {
    const abs = resolve(filePath);
    const dataDir = resolve(process.cwd(), '.data');
    if (dirname(abs) !== dataDir) return null;
    const base = basename(abs);
    if (!base.endsWith('.json')) return null;
    const key = base.slice(0, -5);
    return ALLOWED_STORE_KEYS.has(key) ? key : null;
  } catch {
    return null;
  }
}

async function sbRest(
  creds: { url: string; key: string },
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${creds.url}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: creds.key,
      Authorization: `Bearer ${creds.key}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
}

function isTableMissing(status: number, bodyText: string): boolean {
  if (status === 404) return true;
  if (status === 400 || status === 406) {
    return (
      bodyText.includes('PGRST205') ||
      bodyText.includes('42P01') ||
      bodyText.includes('does not exist') ||
      bodyText.includes('Could not find the table')
    );
  }
  return false;
}

let detectedBackend: CloudBackendKind | null = null;

export function resetCloudStoreCache(): void {
  memoryCache.clear();
  detectedBackend = null;
}

/**
 * Đọc dữ liệu của một `storeKey` từ Supabase:
 * 1. Ưu tiên bảng mới độc lập `public.va_app_store`.
 * 2. Nếu bảng `va_app_store` chưa được tạo trong SQL Editor (404 / PGRST205), tự động dùng phân vùng cô lập
 *    `studio_kv` với `collection = 'va_app_store_v2'` (hoàn toàn tách biệt với dữ liệu gốc).
 */
export async function readCloudStore<T>(
  storeKey: string,
): Promise<{ found: boolean; data?: T; backend: CloudBackendKind; failed?: boolean }> {
  const creds = getSupabaseCreds();
  if (!creds) return { found: false, backend: 'disabled' };

  const cached = memoryCache.get(storeKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { found: true, data: structuredClone(cached.data) as T, backend: cached.backend };
  }

  // Bước 1: Thử bảng độc lập `va_app_store` (trừ khi đã biết chưa tạo bảng trong phiên này).
  if (detectedBackend !== 'isolated_kv') {
    try {
      const res = await sbRest(
        creds,
        `/${encodeURIComponent(VA_APP_STORE_TABLE)}?store_key=eq.${encodeURIComponent(storeKey)}&select=payload&limit=1`,
      );
      if (res.ok) {
        detectedBackend = 'dedicated_table';
        const rows = (await res.json()) as { payload?: T }[];
        if (Array.isArray(rows) && rows.length > 0 && rows[0].payload !== undefined) {
          memoryCache.set(storeKey, {
            data: rows[0].payload,
            at: Date.now(),
            backend: 'dedicated_table',
          });
          return { found: true, data: rows[0].payload, backend: 'dedicated_table' };
        }
        return { found: false, backend: 'dedicated_table' };
      }
      const errText = await res.text().catch(() => '');
      if (isTableMissing(res.status, errText)) {
        detectedBackend = 'isolated_kv';
      } else {
        // Lỗi thật (401/403/5xx): KHÔNG coi là "chưa có dữ liệu", nếu không lần ghi sau sẽ đè mất dữ liệu đám mây.
        return { found: false, backend: 'dedicated_table', failed: true };
      }
    } catch {
      return { found: false, backend: 'disabled', failed: true };
    }
  }

  // Bước 2: Dùng phân vùng cô lập `collection = 'va_app_store_v2'` trong `studio_kv`.
  try {
    const res = await sbRest(
      creds,
      `/studio_kv?collection=eq.${encodeURIComponent(VA_ISOLATED_KV_COLLECTION)}&id=eq.${encodeURIComponent(storeKey)}&select=j&limit=1`,
    );
    if (!res.ok) return { found: false, backend: 'isolated_kv', failed: true };
    const rows = (await res.json()) as { j?: T }[];
    if (Array.isArray(rows) && rows.length > 0 && rows[0].j !== undefined) {
      memoryCache.set(storeKey, {
        data: rows[0].j,
        at: Date.now(),
        backend: 'isolated_kv',
      });
      return { found: true, data: rows[0].j, backend: 'isolated_kv' };
    }
    return { found: false, backend: 'isolated_kv' };
  } catch {
    return { found: false, backend: 'disabled', failed: true };
  }
}

/**
 * Ghi (upsert) dữ liệu của một `storeKey` lên Supabase mà không đụng chạm dữ liệu gốc.
 */
export async function writeCloudStore(
  storeKey: string,
  data: unknown,
): Promise<{ ok: boolean; backend: CloudBackendKind; error?: string }> {
  const creds = getSupabaseCreds();
  if (!creds) return { ok: false, backend: 'disabled' };

  if (detectedBackend !== 'isolated_kv') {
    try {
      const res = await sbRest(
        creds,
        `/${encodeURIComponent(VA_APP_STORE_TABLE)}?on_conflict=store_key`,
        {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            store_key: storeKey,
            payload: data,
            updated_at: new Date().toISOString(),
          }),
        },
      );
      if (res.ok) {
        detectedBackend = 'dedicated_table';
        memoryCache.set(storeKey, {
          data: structuredClone(data),
          at: Date.now(),
          backend: 'dedicated_table',
        });
        return { ok: true, backend: 'dedicated_table' };
      }
      const errText = await res.text().catch(() => '');
      if (isTableMissing(res.status, errText)) {
        detectedBackend = 'isolated_kv';
      } else {
        return { ok: false, backend: 'dedicated_table', error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
      }
    } catch (e) {
      return {
        ok: false,
        backend: 'dedicated_table',
        error: e instanceof Error ? e.message : 'lỗi kết nối Supabase',
      };
    }
  }

  try {
    const res = await sbRest(creds, '/studio_kv?on_conflict=collection,id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        collection: VA_ISOLATED_KV_COLLECTION,
        id: storeKey,
        ord: Math.floor(Date.now() / 1000),
        j: data,
      }),
    });
    if (res.ok) {
      memoryCache.set(storeKey, {
        data: structuredClone(data),
        at: Date.now(),
        backend: 'isolated_kv',
      });
      return { ok: true, backend: 'isolated_kv' };
    }
    const errText = await res.text().catch(() => '');
    return { ok: false, backend: 'isolated_kv', error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
  } catch (e) {
    return {
      ok: false,
      backend: 'isolated_kv',
      error: e instanceof Error ? e.message : 'lỗi kết nối Supabase',
    };
  }
}

/**
 * Liệt kê trạng thái các kho đang có trên Supabase (phục vụ trang `/ket-noi` và quản trị).
 */
export async function inspectCloudStoreStatus(): Promise<{
  configured: boolean;
  backend: CloudBackendKind;
  tableName: string;
  isolatedCollection: string;
  keys: { key: string; updatedAt?: string }[];
}> {
  const creds = getSupabaseCreds();
  if (!creds) {
    return {
      configured: false,
      backend: 'disabled',
      tableName: VA_APP_STORE_TABLE,
      isolatedCollection: VA_ISOLATED_KV_COLLECTION,
      keys: [],
    };
  }

  try {
    const res = await sbRest(
      creds,
      `/${encodeURIComponent(VA_APP_STORE_TABLE)}?select=store_key,updated_at&order=store_key.asc`,
    );
    if (res.ok) {
      const rows = (await res.json()) as { store_key: string; updated_at?: string }[];
      return {
        configured: true,
        backend: 'dedicated_table',
        tableName: VA_APP_STORE_TABLE,
        isolatedCollection: VA_ISOLATED_KV_COLLECTION,
        keys: rows.map((r) => ({ key: r.store_key, updatedAt: r.updated_at })),
      };
    }
  } catch {
    // tiếp tục thử isolated_kv
  }

  try {
    const res = await sbRest(
      creds,
      `/studio_kv?collection=eq.${encodeURIComponent(VA_ISOLATED_KV_COLLECTION)}&select=id,ord&order=id.asc`,
    );
    if (res.ok) {
      const rows = (await res.json()) as { id: string; ord?: number }[];
      return {
        configured: true,
        backend: 'isolated_kv',
        tableName: VA_APP_STORE_TABLE,
        isolatedCollection: VA_ISOLATED_KV_COLLECTION,
        keys: rows.map((r) => ({
          key: r.id,
          updatedAt: r.ord ? new Date(r.ord * 1000).toISOString() : undefined,
        })),
      };
    }
  } catch {
    // bỏ qua
  }

  return {
    configured: true,
    backend: 'disabled',
    tableName: VA_APP_STORE_TABLE,
    isolatedCollection: VA_ISOLATED_KV_COLLECTION,
    keys: [],
  };
}

/**
 * Đẩy toàn bộ các kho `.data/*.json` hiện có trên đĩa cục bộ lên bảng mới / phân vùng cô lập trên Supabase.
 * Không chạm vào bất kỳ bảng dữ liệu gốc nào.
 */
export async function syncAllLocalStoresToCloud(): Promise<{
  ok: boolean;
  backend: CloudBackendKind;
  synced: string[];
  skipped: string[];
  errors: { key: string; error: string }[];
}> {
  const dataDir = resolve(process.cwd(), '.data');
  const synced: string[] = [];
  const skipped: string[] = [];
  const errors: { key: string; error: string }[] = [];
  let backend: CloudBackendKind = 'disabled';

  for (const key of ALLOWED_STORE_KEYS) {
    const filePath = join(dataDir, `${key}.json`);
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch {
      skipped.push(key);
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      const res = await writeCloudStore(key, parsed);
      backend = res.backend;
      if (res.ok) {
        synced.push(key);
      } else {
        errors.push({ key, error: res.error || 'Không ghi được lên Supabase' });
      }
    } catch (e) {
      errors.push({ key, error: e instanceof Error ? e.message : 'JSON không hợp lệ' });
    }
  }

  return {
    ok: errors.length === 0 && synced.length > 0,
    backend,
    synced,
    skipped,
    errors,
  };
}
