// Xác thực phiên Giáo viên & Người duyệt. Phần ký/kiểm token nằm ở sessionToken.ts (chỉ dùng crypto) để dùng được trong proxy.ts.
// Tại đây giữ ghi nhật ký phiên (cần đọc ghi tệp) và xuất lại các hàm cũ cho mã đang dùng.
import { join } from 'node:path';
import { createMutex, readJsonStrict, writeJsonAtomic } from './safeJson';
import type { TeacherSession } from './sessionToken';

export {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  createSessionToken,
  verifySessionToken,
  parseCookieValue,
  readSessionFromRequest,
  type TeacherSession,
} from './sessionToken';

interface SessionAuditStore {
  sessions: {
    name: string;
    email?: string;
    role: 'teacher' | 'reviewer';
    updatedAt: string;
  }[];
}

const sessionStoreMutex = createMutex();

function sessionStorePath(): string {
  return process.env.TEACHER_SESSION_STORE_PATH || join(process.cwd(), '.data', 'teacher-sessions.json');
}

export async function recordTeacherSessionAudit(session: TeacherSession): Promise<void> {
  await sessionStoreMutex(async () => {
    const file = sessionStorePath();
    const store = await readJsonStrict<SessionAuditStore>(file, () => ({ sessions: [] }));
    const list = Array.isArray(store.sessions) ? store.sessions : [];
    const normName = session.name.toLowerCase();
    const filtered = list.filter((x) => x.name.toLowerCase() !== normName);
    filtered.unshift({
      name: session.name,
      ...(session.email ? { email: session.email } : {}),
      role: session.role,
      updatedAt: new Date().toISOString(),
    });
    await writeJsonAtomic(file, { sessions: filtered.slice(0, 200) });
  });
}
