// Xác thực phiên Giáo viên & Tổ trưởng chuyên môn (Reviewer) bằng chữ ký HMAC-SHA256 (`va_session`).
// Cho phép giáo viên đăng nhập tên + email trường (@truongvietanh.com) và xác thực quyền Người duyệt một lần
// thay vì phải nhập lại mã REVIEWER_KEY ở từng trang (/duyet, /kiem-tra, /danh-gia).

import { createHmac } from 'node:crypto';
import { join } from 'node:path';
import { timingSafeEqualStr } from './guard';
import { createMutex, readJsonStrict, writeJsonAtomic } from './safeJson';

export const SESSION_COOKIE_NAME = 'va_session';
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 ngày

export interface TeacherSession {
  name: string;
  email?: string;
  role: 'teacher' | 'reviewer';
  iat: number;
  exp: number;
}

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

function getSigningSecret(): string {
  return (
    process.env.SESSION_SECRET?.trim() ||
    process.env.REVIEWER_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    'va-teaching-studio-local-secret-key'
  );
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signPayload(encodedPayload: string): string {
  return createHmac('sha256', getSigningSecret()).update(encodedPayload).digest('base64url');
}

export function createSessionToken(input: {
  name: string;
  email?: string;
  role: 'teacher' | 'reviewer';
  nowMs?: number;
}): { token: string; session: TeacherSession } {
  const now = input.nowMs ?? Date.now();
  const session: TeacherSession = {
    name: input.name.trim().slice(0, 100),
    ...(input.email?.trim() ? { email: input.email.trim().toLowerCase().slice(0, 120) } : {}),
    role: input.role,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const encoded = base64UrlEncode(JSON.stringify(session));
  const sig = signPayload(encoded);
  return { token: `${encoded}.${sig}`, session };
}

export function verifySessionToken(token: string, nowMs?: number): TeacherSession | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = signPayload(encoded);
  if (!timingSafeEqualStr(sig, expectedSig)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as Partial<TeacherSession>;
    if (!parsed || typeof parsed.name !== 'string' || !parsed.name.trim()) return null;
    if (parsed.role !== 'teacher' && parsed.role !== 'reviewer') return null;
    if (typeof parsed.exp !== 'number' || parsed.exp <= (nowMs ?? Date.now())) return null;
    return {
      name: parsed.name.trim(),
      ...(typeof parsed.email === 'string' && parsed.email.trim() ? { email: parsed.email.trim() } : {}),
      role: parsed.role,
      iat: typeof parsed.iat === 'number' ? parsed.iat : 0,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export function parseCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export function readSessionFromRequest(request: Request): TeacherSession | null {
  const headerToken = request.headers.get('x-va-session')?.trim();
  if (headerToken) {
    const s = verifySessionToken(headerToken);
    if (s) return s;
  }
  const cookieToken = parseCookieValue(request.headers.get('cookie'), SESSION_COOKIE_NAME);
  if (cookieToken) {
    return verifySessionToken(cookieToken);
  }
  return null;
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
