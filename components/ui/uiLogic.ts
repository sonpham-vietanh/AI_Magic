// Logic thuần (không phụ thuộc DOM) cho khung giao diện và các mẫu dùng chung, để kiểm thử được.

export type NavKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

/**
 * Chỉ số mục kế tiếp theo mẫu ARIA (tablist, menu): mũi tên đi vòng, Home/End về đầu/cuối.
 * Trả null nếu phím không thuộc mẫu hoặc không có mục nào.
 */
export function nextIndex(
  current: number,
  key: string,
  count: number,
  orientation: 'horizontal' | 'vertical' = 'horizontal',
): number | null {
  if (count <= 0) return null;
  const cur = current >= 0 && current < count ? current : 0;
  const fwd = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
  const back = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
  if (key === fwd) return (cur + 1) % count;
  if (key === back) return (cur - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

export type Role = 'teacher' | 'reviewer' | 'admin';

export interface MeUser {
  name: string;
  email: string;
  role: Role;
  via: string;
  initial: string;
}

export interface MeState {
  ssoEnabled: boolean;
  user: MeUser | null;
}

/** Chữ cái đầu của tên để vẽ avatar (bỏ danh xưng Cô/Thầy nếu còn tên sau đó). */
export function initialOf(name: string | undefined | null, fallback = '?'): string {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return fallback;
  // Lấy chữ đầu của tên gọi (từ cuối), nên "Cô Lan" ra "L".
  const ch = Array.from(parts[parts.length - 1])[0];
  return ch ? ch.toLocaleUpperCase('vi') : fallback;
}

export function roleLabel(role: string | undefined | null): string {
  if (role === 'admin') return 'Quản trị viên';
  if (role === 'reviewer') return 'Người duyệt';
  return 'Giáo viên';
}

/** Đọc phản hồi /api/me một cách chịu lỗi: sai hình dạng thì coi như chưa đăng nhập. */
export function parseMe(json: unknown): MeState {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const ssoEnabled = o.ssoEnabled === true;
  const u = o.user && typeof o.user === 'object' ? (o.user as Record<string, unknown>) : null;
  if (!u || typeof u.email !== 'string') return { ssoEnabled, user: null };
  const role: Role = u.role === 'admin' || u.role === 'reviewer' ? u.role : 'teacher';
  const name = typeof u.name === 'string' && u.name.trim() ? u.name.trim() : u.email;
  return {
    ssoEnabled,
    user: {
      name,
      email: u.email,
      role,
      via: typeof u.via === 'string' ? u.via : '',
      initial: typeof u.initial === 'string' && u.initial ? u.initial : initialOf(name),
    },
  };
}

/** Số lượt AI còn lại hôm nay; null nếu dữ liệu không dùng được. */
export function quotaLeft(json: unknown): number | null {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const t = o.today && typeof o.today === 'object' ? (o.today as Record<string, unknown>) : null;
  if (!t) return null;
  const used = Number(t.used);
  const limit = Number(t.limit);
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return null;
  return Math.max(0, Math.floor(limit - used));
}

export function quotaLabel(left: number): string {
  return left > 0 ? `Còn ${left} lượt hôm nay` : 'Đã hết lượt hôm nay';
}

/** Chuỗi tab mặc định: id hợp lệ đầu tiên không bị vô hiệu. */
export function firstEnabled<T extends { id: string; disabled?: boolean }>(items: T[], wanted?: string): string | undefined {
  const w = items.find((i) => i.id === wanted && !i.disabled);
  return (w ?? items.find((i) => !i.disabled))?.id;
}

/** Đường dẫn có thuộc nhóm quản trị không. */
export function isAdminPath(pathname: string): boolean {
  return pathname === '/quan-tri' || pathname.startsWith('/quan-tri/');
}
