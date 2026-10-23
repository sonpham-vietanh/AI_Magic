// Danh bạ người dùng: gộp ghi nhận đăng nhập (teacher-sessions) với kho vai trò và danh sách email trong biến môi trường.
import { readJsonStrict } from '@/lib/server/safeJson';
import { sessionStorePath } from '@/lib/server/auth';
import { adminEmails, reviewerEmails } from '@/lib/server/googleAuth';
import type { UserRole } from '@/lib/server/sessionToken';
import { appendAudit, type AuditAction } from './audit';
import {
  activeAdmins,
  effectiveRoleFrom,
  isAllowedEmail,
  isBlockedIn,
  loadRoleStore,
  mutateRoleStore,
  normalizeEmail,
} from './roles';

export interface DirectoryUser {
  email: string;
  name: string;
  /** Vai trò hiệu lực = cao nhất giữa cấu hình máy chủ và vai trò được gán. */
  role: UserRole;
  /** Vai trò do quản trị gán trong ứng dụng. */
  assignedRole: UserRole;
  /** Vai trò đến từ cấu hình máy chủ (ADMIN_EMAILS/REVIEWER_EMAILS), không đổi được trên giao diện. */
  fromEnv: UserRole | null;
  blocked: boolean;
  firstSeen: string | null;
  lastSeen: string | null;
  loginCount: number;
}

export interface UserQuery {
  q?: string;
  role?: UserRole;
  status?: 'active' | 'blocked';
  page?: number;
  pageSize?: number;
}

export interface UserStats {
  total: number;
  newLast7Days: number;
  reviewers: number;
  admins: number;
  blocked: number;
}

interface SessionRow {
  name?: string;
  email?: string;
  updatedAt?: string;
  firstSeen?: string;
  loginCount?: number;
}

export async function buildDirectory(now = Date.now()): Promise<{ users: DirectoryUser[]; stats: UserStats }> {
  const [sess, store] = await Promise.all([
    readJsonStrict<{ sessions?: SessionRow[] }>(sessionStorePath(), () => ({ sessions: [] })),
    loadRoleStore(),
  ]);
  const map = new Map<string, DirectoryUser>();
  const ensure = (email: string): DirectoryUser => {
    let u = map.get(email);
    if (!u) {
      const fromEnv: UserRole | null = adminEmails().has(email) ? 'admin' : reviewerEmails().has(email) ? 'reviewer' : null;
      u = {
        email,
        name: email.split('@')[0],
        role: 'teacher',
        assignedRole: store.users[email]?.role ?? 'teacher',
        fromEnv,
        blocked: false,
        firstSeen: null,
        lastSeen: null,
        loginCount: 0,
      };
      map.set(email, u);
    }
    return u;
  };

  for (const row of Array.isArray(sess.sessions) ? sess.sessions : []) {
    const email = normalizeEmail(row.email ?? '');
    if (!email) continue; // Bản ghi cũ chỉ có tên (chế độ khai tên) không phải tài khoản trường.
    const u = ensure(email);
    if (row.name) u.name = row.name;
    const last = row.updatedAt ?? null;
    const first = row.firstSeen ?? row.updatedAt ?? null;
    if (last && (!u.lastSeen || last > u.lastSeen)) u.lastSeen = last;
    if (first && (!u.firstSeen || first < u.firstSeen)) u.firstSeen = first;
    u.loginCount += typeof row.loginCount === 'number' && row.loginCount > 0 ? row.loginCount : 1;
  }
  for (const email of [...Object.keys(store.users), ...adminEmails(), ...reviewerEmails()]) ensure(email);

  const weekAgo = new Date(now - 7 * 864e5).toISOString();
  const users = [...map.values()];
  for (const u of users) {
    u.role = effectiveRoleFrom(u.email, store);
    u.blocked = isBlockedIn(u.email, store);
  }
  users.sort((a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? '') || a.email.localeCompare(b.email));
  const stats: UserStats = {
    total: users.length,
    newLast7Days: users.filter((u) => u.firstSeen && u.firstSeen >= weekAgo).length,
    reviewers: users.filter((u) => u.role === 'reviewer' && !u.blocked).length,
    admins: users.filter((u) => u.role === 'admin' && !u.blocked).length,
    blocked: users.filter((u) => u.blocked).length,
  };
  return { users, stats };
}

export async function listUsers(query: UserQuery = {}, now = Date.now()) {
  const { users, stats } = await buildDirectory(now);
  const q = (query.q ?? '').trim().toLowerCase();
  let rows = users;
  if (q) rows = rows.filter((u) => `${u.email} ${u.name}`.toLowerCase().includes(q));
  if (query.role) rows = rows.filter((u) => u.role === query.role);
  if (query.status) rows = rows.filter((u) => (query.status === 'blocked') === u.blocked);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, query.page ?? 1));
  return { users: rows.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, pages, stats };
}

export class AdminRuleError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AdminRuleError';
    this.status = status;
  }
}

export interface UpdateUserInput {
  email: string;
  role?: UserRole;
  blocked?: boolean;
}

/**
 * Đổi vai trò / chặn / mở chặn. Quy tắc: email thuộc tên miền cho phép; không tự chặn hoặc tự hạ mình khỏi quản trị;
 * không hạ hay chặn quản trị viên cuối cùng. Nhật ký được ghi TRƯỚC khi lưu kho vai trò.
 */
export async function updateUser(actorEmail: string, input: UpdateUserInput) {
  const actor = normalizeEmail(actorEmail);
  const target = normalizeEmail(input.email);
  if (!isAllowedEmail(target)) throw new AdminRuleError('Email phải thuộc tên miền của trường.');
  if (input.role === undefined && input.blocked === undefined) throw new AdminRuleError('Không có thay đổi nào để lưu.');
  if (input.blocked === true && target === actor) throw new AdminRuleError('Không thể tự chặn chính mình.');

  return mutateRoleStore(async (store) => {
    const before = store.users[target] ?? { role: 'teacher' as UserRole, blocked: false, updatedBy: '', updatedAt: '' };
    const next = {
      role: input.role ?? before.role,
      blocked: input.blocked ?? before.blocked,
      updatedBy: actor,
      updatedAt: new Date().toISOString(),
    };
    const changes: { action: AuditAction; from?: string; to?: string }[] = [];
    if (next.role !== before.role) changes.push({ action: 'role_change', from: before.role, to: next.role });
    if (next.blocked !== before.blocked) changes.push({ action: next.blocked ? 'block' : 'unblock' });
    if (changes.length === 0) throw new AdminRuleError('Không có thay đổi nào so với hiện tại.', 409);

    const wasAdmin = activeAdmins(store).includes(target);
    store.users[target] = next;
    if (wasAdmin && !activeAdmins(store).includes(target) && activeAdmins(store).length < 1) {
      throw new AdminRuleError('Không thể hạ vai trò hoặc chặn quản trị viên cuối cùng.', 409);
    }
    for (const c of changes) await appendAudit({ actor, action: c.action, target, detail: { from: c.from, to: c.to } });
    const effective = effectiveRoleFrom(target, store);
    return {
      email: target,
      role: effective,
      assignedRole: next.role,
      blocked: next.blocked,
      keptByEnv: input.role !== undefined && effective !== input.role,
    };
  });
}
