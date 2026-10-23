// Tuỳ chọn mặc định của từng người dùng (môn, khối, phong cách giảng dạy), khoá theo email trong phiên.
// Lưu ở .data/user-prefs.json (đổi được bằng USER_PREFS_FILE), chỉ qua lib/server/safeJson.
import { join } from 'node:path';
import { z } from 'zod';
import { createMutex, readJsonStrict, writeJsonAtomic } from '@/lib/server/safeJson';
import { PHONG_CACH } from '@/lib/workflows/types';

export interface UserPrefs {
  mon?: string;
  khoi?: string;
  phongCach?: string;
}

interface PrefsRecord extends UserPrefs {
  updatedAt: string;
}
interface PrefsStore {
  users: Record<string, PrefsRecord>;
}

export const MAX_PREF_USERS = 5000;
const mutex = createMutex();

function prefsFile(): string {
  return process.env.USER_PREFS_FILE || join(process.cwd(), '.data', 'user-prefs.json');
}

/** Khoá người dùng: email chữ thường; phiên chỉ có tên thì dùng "name:<tên chuẩn hoá>". */
export function userKey(input: { email?: string | null; name?: string | null }): string {
  const email = (input.email ?? '').trim().toLowerCase();
  if (email) return email.slice(0, 120);
  const name = (input.name ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  return name ? `name:${name.slice(0, 100)}` : '';
}

const phongCachIds = PHONG_CACH.map((p) => p.id) as string[];

/** Giá trị rỗng hoặc null nghĩa là xoá tuỳ chọn đó. */
export const prefsSchema = z
  .object({
    mon: z.union([z.string().trim().regex(/^[a-z0-9_]{1,40}$/, 'Môn không hợp lệ'), z.literal(''), z.null()]).optional(),
    khoi: z.union([z.string().trim().regex(/^\d{1,2}$/, 'Khối không hợp lệ'), z.literal(''), z.null()]).optional(),
    phongCach: z
      .union([z.string().trim().refine((v) => phongCachIds.includes(v), 'Phong cách không hợp lệ'), z.literal(''), z.null()])
      .optional(),
  })
  .strict();

export type PrefsInput = z.infer<typeof prefsSchema>;

function clean(rec: Partial<PrefsRecord> | undefined): UserPrefs {
  const out: UserPrefs = {};
  if (!rec) return out;
  if (typeof rec.mon === 'string' && rec.mon) out.mon = rec.mon.slice(0, 40);
  if (typeof rec.khoi === 'string' && rec.khoi) out.khoi = rec.khoi.slice(0, 2);
  if (typeof rec.phongCach === 'string' && rec.phongCach) out.phongCach = rec.phongCach.slice(0, 40);
  return out;
}

async function readStore(): Promise<PrefsStore> {
  const raw = await readJsonStrict<Partial<PrefsStore> | null>(prefsFile(), () => null);
  const users = raw && typeof raw === 'object' && raw.users && typeof raw.users === 'object' ? raw.users : {};
  return { users: { ...users } };
}

export async function getPrefs(key: string): Promise<UserPrefs> {
  if (!key) return {};
  const store = await readStore();
  return clean(Object.hasOwn(store.users, key) ? store.users[key] : undefined);
}

/** Gộp thay đổi vào tuỳ chọn của đúng `key`; trả về tuỳ chọn mới. Lỗi ghi được ném lên. */
export async function setPrefs(key: string, patch: PrefsInput): Promise<UserPrefs> {
  if (!key) throw new Error('Thiếu danh tính người dùng.');
  return mutex(async () => {
    const store = await readStore();
    const cur = clean(Object.hasOwn(store.users, key) ? store.users[key] : undefined);
    const next: UserPrefs = { ...cur };
    for (const f of ['mon', 'khoi', 'phongCach'] as const) {
      if (patch[f] === undefined) continue;
      const v = patch[f];
      if (v) next[f] = v;
      else delete next[f];
    }
    if (!Object.hasOwn(store.users, key) && Object.keys(store.users).length >= MAX_PREF_USERS) {
      // Bỏ bản ghi cũ nhất để chặn phình tệp.
      const oldest = Object.entries(store.users).sort((a, b) => String(a[1]?.updatedAt).localeCompare(String(b[1]?.updatedAt)))[0];
      if (oldest) delete store.users[oldest[0]];
    }
    store.users[key] = { ...next, updatedAt: new Date().toISOString() };
    await writeJsonAtomic(prefsFile(), store);
    return next;
  });
}
