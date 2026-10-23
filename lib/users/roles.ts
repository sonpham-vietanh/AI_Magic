// Kho vai trò do quản trị gán (.data/user-roles.json, khóa 'user-roles'): email -> { role, blocked, updatedBy, updatedAt }.
// Vai trò hiệu lực = mức CAO NHẤT giữa biến môi trường (ADMIN_EMAILS, REVIEWER_EMAILS) và kho này.
// Tài khoản bị chặn luôn bị từ chối, bất kể vai trò.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminEmails, allowedDomains, reviewerEmails } from '@/lib/server/googleAuth';
import { createMutex, readJsonStrict, writeJsonAtomic } from '@/lib/server/safeJson';
import type { TeacherSession, UserRole } from '@/lib/server/sessionToken';

export interface RoleRecord {
  role: UserRole;
  blocked: boolean;
  updatedBy: string;
  updatedAt: string;
}

export interface RoleStore {
  users: Record<string, RoleRecord>;
}

export const ROLE_RANK: Record<UserRole, number> = { teacher: 0, reviewer: 1, admin: 2 };
export const ROLE_LABEL: Record<UserRole, string> = { teacher: 'Giáo viên', reviewer: 'Người duyệt', admin: 'Quản trị viên' };

export function isUserRole(v: unknown): v is UserRole {
  return v === 'teacher' || v === 'reviewer' || v === 'admin';
}

export function normalizeEmail(raw: string): string {
  return String(raw ?? '').trim().toLowerCase();
}

/** Email hợp lệ và thuộc AUTH_ALLOWED_DOMAINS. */
export function isAllowedEmail(email: string): boolean {
  const e = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  return allowedDomains().includes(e.split('@')[1]);
}

export function roleStorePath(): string {
  return process.env.USER_ROLES_STORE_PATH || join(process.cwd(), '.data', 'user-roles.json');
}

function sanitize(raw: unknown): RoleStore {
  const out: RoleStore = { users: {} };
  const src = (raw as { users?: unknown } | null)?.users;
  if (!src || typeof src !== 'object') return out;
  for (const [k, v] of Object.entries(src as Record<string, Partial<RoleRecord>>)) {
    const email = normalizeEmail(k);
    if (!email || !v || typeof v !== 'object') continue;
    out.users[email] = {
      role: isUserRole(v.role) ? v.role : 'teacher',
      blocked: v.blocked === true,
      updatedBy: typeof v.updatedBy === 'string' ? v.updatedBy : '',
      updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : '',
    };
  }
  return out;
}

// Bộ nhớ đệm để các hàm đồng bộ (requireAdmin, requireReviewer) kiểm tra lại kho mà không phải async.
const CACHE_TTL_MS = 3_000;
let cache: { store: RoleStore; at: number } | null = null;

function remember(store: RoleStore): RoleStore {
  cache = { store, at: Date.now() };
  return store;
}

/** Nạp kho (async, đúng nguồn kể cả đám mây) và làm mới bộ nhớ đệm. Ném lỗi nếu không đọc được. */
export async function loadRoleStore(): Promise<RoleStore> {
  const raw = await readJsonStrict<RoleStore>(roleStorePath(), () => ({ users: {} }));
  return remember(sanitize(raw));
}

/** Bản đọc đồng bộ từ bộ nhớ đệm / tệp cục bộ. Lỗi đọc thì giữ bản đệm cũ. */
export function peekRoleStore(): RoleStore {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.store;
  try {
    return remember(sanitize(JSON.parse(readFileSync(roleStorePath(), 'utf8'))));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return remember(cache?.store ?? { users: {} });
    return cache ? cache.store : { users: {} };
  }
}

/** Dùng cho test: xoá bộ nhớ đệm. */
export function resetRoleCache(): void {
  cache = null;
}

function envRole(email: string): UserRole {
  if (adminEmails().has(email)) return 'admin';
  return reviewerEmails().has(email) ? 'reviewer' : 'teacher';
}

export function effectiveRoleFrom(emailRaw: string, store: RoleStore): UserRole {
  const email = normalizeEmail(emailRaw);
  const fromEnv = envRole(email);
  const fromStore = store.users[email]?.role ?? 'teacher';
  return ROLE_RANK[fromEnv] >= ROLE_RANK[fromStore] ? fromEnv : fromStore;
}

export function isBlockedIn(emailRaw: string, store: RoleStore): boolean {
  return store.users[normalizeEmail(emailRaw)]?.blocked === true;
}

/** Vai trò hiệu lực (đồng bộ, theo bộ nhớ đệm). Bị chặn vẫn trả vai trò thật; hãy kiểm isBlocked riêng. */
export function getEffectiveRole(email: string): UserRole {
  return effectiveRoleFrom(email, peekRoleStore());
}

export function isBlocked(email: string): boolean {
  return isBlockedIn(email, peekRoleStore());
}

export async function getEffectiveRoleAsync(email: string): Promise<UserRole> {
  return effectiveRoleFrom(email, await loadRoleStore());
}

export async function isBlockedAsync(email: string): Promise<boolean> {
  return isBlockedIn(email, await loadRoleStore());
}

/**
 * Vai trò mà máy chủ thực sự áp dụng cho một phiên. Phiên Google luôn được tính lại từ kho (đổi vai trò có hiệu lực
 * ngay, không phải đợi cookie 14 ngày hết hạn); tài khoản bị chặn trả null. Phiên tự khai tên giữ nguyên vai trò.
 */
export function effectiveSessionRole(session: TeacherSession): UserRole | null {
  if (session.via !== 'google' || !session.email) return session.role;
  const store = peekRoleStore();
  if (isBlockedIn(session.email, store)) return null;
  return effectiveRoleFrom(session.email, store);
}

/** Các quản trị viên đang hoạt động (cấu hình + kho, không tính bị chặn). */
export function activeAdmins(store: RoleStore): string[] {
  const set = new Set<string>(adminEmails());
  for (const [e, r] of Object.entries(store.users)) if (r.role === 'admin') set.add(e);
  return [...set].filter((e) => !isBlockedIn(e, store) && effectiveRoleFrom(e, store) === 'admin');
}

const roleMutex = createMutex();

/**
 * Sửa kho trong một khoá tuần tự: nạp bản mới nhất, chạy `mutate` (có thể ném lỗi để huỷ, có thể async để ghi nhật ký
 * trước), rồi mới lưu.
 */
export async function mutateRoleStore<T>(mutate: (store: RoleStore) => T | Promise<T>): Promise<T> {
  return roleMutex(async () => {
    const store = structuredClone(await loadRoleStore());
    const result = await mutate(store);
    await writeJsonAtomic(roleStorePath(), store);
    remember(store);
    return result;
  });
}
