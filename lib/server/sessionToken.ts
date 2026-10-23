// Ký và kiểm phiên đăng nhập bằng HMAC-SHA256. Chỉ dùng `node:crypto` (không đọc ghi tệp) để dùng được cả trong proxy.ts.
import { createHmac, randomBytes } from 'node:crypto';
import { timingSafeEqualStr } from './guard';

export const SESSION_COOKIE_NAME = 'va_session';
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 ngày

export interface TeacherSession {
  name: string;
  email?: string;
  role: 'teacher' | 'reviewer';
  /** 'google' khi đăng nhập bằng email trường; 'name' khi chỉ tự khai tên (chế độ cũ). */
  via?: 'google' | 'name';
  iat: number;
  exp: number;
}

export function getSigningSecret(): string {
  const fromEnv =
    process.env.SESSION_SECRET?.trim() || process.env.REVIEWER_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (fromEnv) return fromEnv;
  // Khóa mặc định cứng chỉ dành cho dev/test; production mà thiếu cấu hình thì từ chối ký thay vì dùng khóa ai cũng biết.
  if (process.env.NODE_ENV === 'production') throw new Error('Chưa cấu hình SESSION_SECRET để ký phiên đăng nhập.');
  return 'va-teaching-studio-local-secret-key';
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

function sign(encoded: string, purpose: string): string {
  return createHmac('sha256', getSigningSecret()).update(`${purpose}.${encoded}`).digest('base64url');
}

/** Ký một giá trị JSON bất kỳ cho mục đích `purpose` (vd cookie OAuth). Chữ ký của mục đích này không dùng được cho mục đích khác. */
export function signValue(purpose: string, payload: unknown): string {
  const enc = b64(JSON.stringify(payload));
  return `${enc}.${sign(enc, purpose)}`;
}

export function verifyValue<T>(purpose: string, token: string | null | undefined): T | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    if (!timingSafeEqualStr(parts[1], sign(parts[0], purpose))) return null;
    return JSON.parse(unb64(parts[0])) as T;
  } catch {
    return null;
  }
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

export function createSessionToken(input: {
  name: string;
  email?: string;
  role: 'teacher' | 'reviewer';
  via?: 'google' | 'name';
  nowMs?: number;
}): { token: string; session: TeacherSession } {
  const now = input.nowMs ?? Date.now();
  const session: TeacherSession = {
    name: input.name.trim().slice(0, 100),
    ...(input.email?.trim() ? { email: input.email.trim().toLowerCase().slice(0, 120) } : {}),
    role: input.role,
    ...(input.via ? { via: input.via } : {}),
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  return { token: signValue('session', session), session };
}

export function verifySessionToken(token: string, nowMs?: number): TeacherSession | null {
  const parsed = verifyValue<Partial<TeacherSession>>('session', token);
  if (!parsed || typeof parsed.name !== 'string' || !parsed.name.trim()) return null;
  if (parsed.role !== 'teacher' && parsed.role !== 'reviewer') return null;
  if (typeof parsed.exp !== 'number' || parsed.exp <= (nowMs ?? Date.now())) return null;
  return {
    name: parsed.name.trim(),
    ...(typeof parsed.email === 'string' && parsed.email.trim() ? { email: parsed.email.trim() } : {}),
    role: parsed.role,
    ...(parsed.via === 'google' || parsed.via === 'name' ? { via: parsed.via } : {}),
    iat: typeof parsed.iat === 'number' ? parsed.iat : 0,
    exp: parsed.exp,
  };
}

export function parseCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return null;
      }
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
  return cookieToken ? verifySessionToken(cookieToken) : null;
}
