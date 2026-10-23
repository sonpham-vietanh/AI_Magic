// Tuỳ chọn mặc định của người dùng (từ GET /api/me) và thông tin tài khoản dùng ở trợ lý.
import type { AgentSlots, StyleValue } from './flow';
import { PHONG_CACH_OPTIONS } from '../ui/soanBai';

export interface MeUser {
  name: string;
  email: string;
  role: 'teacher' | 'reviewer' | 'admin' | string;
  via?: string;
  initial?: string;
}
export interface MePrefs {
  mon?: string;
  khoi?: string;
  phongCach?: string;
}
export interface MeInfo {
  ssoEnabled: boolean;
  user: MeUser | null;
  prefs: MePrefs;
  quota?: { used: number; limit: number };
}
export const EMPTY_ME: MeInfo = { ssoEnabled: false, user: null, prefs: {} };

const SUBJECTS = ['toan', 'vat_ly', 'hoa_hoc', 'sinh_hoc', 'ngu_van', 'tieng_anh', 'tin_hoc'];
const GRADES = ['6', '7', '8', '9', '10', '11', '12'];

/** Đọc phản hồi /api/me thành MeInfo; chịu mọi dạng sai (thiếu trường, kiểu lạ). */
export function parseMe(j: unknown): MeInfo {
  if (!j || typeof j !== 'object') return EMPTY_ME;
  const o = j as Record<string, unknown>;
  if (o.ok !== true) return EMPTY_ME;
  const u = o.user as Record<string, unknown> | null | undefined;
  const user: MeUser | null =
    u && typeof u === 'object' && typeof u.name === 'string' && u.name.trim()
      ? {
          name: u.name.trim(),
          email: typeof u.email === 'string' ? u.email : '',
          role: typeof u.role === 'string' ? u.role : 'teacher',
          via: typeof u.via === 'string' ? u.via : undefined,
          initial: typeof u.initial === 'string' ? u.initial : undefined,
        }
      : null;
  const p = (o.prefs && typeof o.prefs === 'object' ? o.prefs : {}) as Record<string, unknown>;
  const prefs: MePrefs = {};
  for (const k of ['mon', 'khoi', 'phongCach'] as const) if (typeof p[k] === 'string' && p[k]) prefs[k] = p[k] as string;
  const q = o.quota as Record<string, unknown> | undefined;
  const quota = q && typeof q.used === 'number' && typeof q.limit === 'number' ? { used: q.used, limit: q.limit } : undefined;
  return { ssoEnabled: o.ssoEnabled === true, user, prefs, quota };
}

/** Áp môn/khối/phong cách mặc định. Mặc định không đè lựa chọn đã có (phong cách) và có thể giữ môn/khối. */
export function applyPrefs(s: AgentSlots, prefs: MePrefs, opts: { keepSubjectGrade?: boolean } = {}): AgentSlots {
  const next = { ...s };
  if (!opts.keepSubjectGrade) {
    if (prefs.mon && SUBJECTS.includes(prefs.mon)) next.subject = prefs.mon;
    if (prefs.khoi && GRADES.includes(prefs.khoi)) next.grade = prefs.khoi;
  }
  if (!next.phongCach && prefs.phongCach && PHONG_CACH_OPTIONS.some((o) => o.value === prefs.phongCach)) {
    next.phongCach = prefs.phongCach as StyleValue;
  }
  return next;
}

export function roleLabel(role?: string): string {
  if (role === 'admin') return 'Quản trị viên';
  if (role === 'reviewer') return 'Người duyệt';
  return 'Giáo viên';
}

/** Admin cũng là người duyệt. */
export function isReviewerRole(role?: string): boolean {
  return role === 'admin' || role === 'reviewer';
}

export function greetingByHour(now: Date = new Date()): string {
  const h = new Date(now.getTime() + 7 * 3600_000).getUTCHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

/** Tên gọi ngắn để chào: "Cô Lan" giữ nguyên, email/tên đầy đủ giữ nguyên. */
export function greetingName(name?: string): string {
  const t = (name ?? '').trim();
  return t.slice(0, 40);
}
