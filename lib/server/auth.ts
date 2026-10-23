// Xác thực phiên Giáo viên & Người duyệt. Phần ký/kiểm token nằm ở sessionToken.ts (chỉ dùng crypto) để dùng được trong proxy.ts.
// Tại đây giữ ghi nhật ký phiên (cần đọc ghi tệp) và xuất lại các hàm cũ cho mã đang dùng.
import { join } from 'node:path';
import { createMutex, readJsonStrict, writeJsonAtomic } from './safeJson';
import type { TeacherSession, UserRole } from './sessionToken';

export {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  createSessionToken,
  verifySessionToken,
  parseCookieValue,
  readSessionFromRequest,
  type TeacherSession,
  type UserRole,
} from './sessionToken';

interface SessionAuditRow {
  name: string;
  email?: string;
  role: UserRole;
  /** Lần đăng nhập gần nhất (giữ tên cũ để tương thích dữ liệu đã có). */
  updatedAt: string;
  firstSeen?: string;
  loginCount?: number;
}

interface SessionAuditStore {
  sessions: SessionAuditRow[];
}

const SESSION_STORE_LIMIT = 5000;
const sessionStoreMutex = createMutex();

export function sessionStorePath(): string {
  return process.env.TEACHER_SESSION_STORE_PATH || join(process.cwd(), '.data', 'teacher-sessions.json');
}

/**
 * Ghi nhận một lần đăng nhập thành danh bạ: mỗi email một dòng (không email thì theo tên) với firstSeen, lastSeen
 * (= updatedAt), loginCount. Dữ liệu cũ thiếu firstSeen/loginCount vẫn đọc được.
 */
export async function recordTeacherSessionAudit(session: TeacherSession): Promise<void> {
  await sessionStoreMutex(async () => {
    const file = sessionStorePath();
    const store = await readJsonStrict<SessionAuditStore>(file, () => ({ sessions: [] }));
    const list = Array.isArray(store.sessions) ? store.sessions : [];
    const email = session.email?.trim().toLowerCase();
    const sameKey = (x: SessionAuditRow) =>
      email ? x.email?.trim().toLowerCase() === email : !x.email && x.name.toLowerCase() === session.name.toLowerCase();
    const prev = list.find(sameKey);
    const now = new Date().toISOString();
    const row: SessionAuditRow = {
      name: session.name,
      ...(email ? { email } : {}),
      role: session.role,
      updatedAt: now,
      firstSeen: prev?.firstSeen ?? prev?.updatedAt ?? now,
      loginCount: (typeof prev?.loginCount === 'number' && prev.loginCount > 0 ? prev.loginCount : prev ? 1 : 0) + 1,
    };
    const rest = list.filter((x) => !sameKey(x));
    await writeJsonAtomic(file, { sessions: [row, ...rest].slice(0, SESSION_STORE_LIMIT) });
  });
}
