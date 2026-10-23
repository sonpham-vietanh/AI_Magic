// Đăng nhập bằng Google Workspace giới hạn email của trường (OAuth 2.0 Authorization Code + PKCE).
// Chỉ bật khi có GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET. Chưa cấu hình thì ứng dụng giữ chế độ khai tên cũ.
import { createHash } from 'node:crypto';
import { randomToken, signValue, verifyValue, type UserRole } from './sessionToken';

export const OAUTH_COOKIE_NAME = 'va_oauth';
const OAUTH_TTL_MS = 10 * 60 * 1000;

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function isSsoEnabled(): boolean {
  if (process.env.VITEST && process.env.VA_SSO_IN_TEST !== '1') return false;
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function allowedDomains(): string[] {
  const raw = process.env.AUTH_ALLOWED_DOMAINS?.trim() || 'truongvietanh.com';
  return raw
    .split(/[,\s]+/)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/** Email được cấp quyền Người duyệt (phân cách bằng dấu phẩy), so khớp không phân biệt hoa/thường. */
export function reviewerEmails(): Set<string> {
  return new Set(
    (process.env.REVIEWER_EMAILS || '')
      .split(/[,\s;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Email quản trị (ADMIN_EMAILS, cách nhau bằng dấu phẩy). Admin có mọi quyền của người duyệt cộng quyền quản trị. */
export function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS || '')
      .split(/[,\s;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Vai trò mặc định theo biến môi trường. Vai trò do quản trị gán trong ứng dụng (lib/users) được cộng thêm ở nơi gọi. */
export function roleForEmail(email: string): UserRole {
  const e = email.trim().toLowerCase();
  if (adminEmails().has(e)) return 'admin';
  return reviewerEmails().has(e) ? 'reviewer' : 'teacher';
}

/** Địa chỉ gốc của ứng dụng, dùng làm redirect_uri. Ưu tiên APP_BASE_URL để không tin header do client gửi. */
export function appBaseUrl(request?: Request): string {
  const env = process.env.APP_BASE_URL?.trim().replace(/\/+$/, '');
  if (env) return env;
  if (process.env.NODE_ENV === 'production') throw new Error('Chưa cấu hình APP_BASE_URL.');
  const u = request ? new URL(request.url) : new URL('http://localhost:3080');
  return `${u.protocol}//${u.host}`;
}

/** URL công khai để chuyển hướng (không tin request.url vì sau proxy có thể là địa chỉ nội bộ). */
export function publicUrl(path: string, request: Request): URL {
  let base: string;
  try {
    base = appBaseUrl(request);
  } catch {
    base = new URL(request.url).origin;
  }
  return new URL(path, base);
}

export function redirectUri(request?: Request): string {
  return `${appBaseUrl(request)}/api/auth/google/callback`;
}

/** Chỉ cho quay lại đường dẫn nội bộ; chặn "//evil.com", đường dẫn có dấu gạch ngược và URL tuyệt đối. */
export function safeReturnTo(raw: string | null | undefined): string {
  const v = (raw ?? '').trim();
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\') || v.includes('\n') || v.includes('\r')) return '/';
  if (v.startsWith('/api/') || v.startsWith('/dang-nhap')) return '/';
  return v.slice(0, 300);
}

interface OauthState {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  exp: number;
}

export function beginLogin(request: Request, returnTo?: string | null): { url: string; cookie: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
  const state = randomToken(18);
  const nonce = randomToken(18);
  const verifier = randomToken(48);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const domains = allowedDomains();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(request),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  if (domains.length === 1) params.set('hd', domains[0]);
  const payload: OauthState = { state, nonce, verifier, returnTo: safeReturnTo(returnTo), exp: Date.now() + OAUTH_TTL_MS };
  return { url: `${AUTH_URL}?${params.toString()}`, cookie: signValue('oauth', payload) };
}

export function readOauthState(cookieValue: string | null | undefined, nowMs = Date.now()): OauthState | null {
  const s = verifyValue<OauthState>('oauth', cookieValue);
  if (!s || typeof s.exp !== 'number' || s.exp <= nowMs) return null;
  if (!s.state || !s.nonce || !s.verifier) return null;
  return s;
}

export interface GoogleIdentity {
  email: string;
  name: string;
  hd: string;
}

export type SsoErrorCode = 'bad_state' | 'exchange_failed' | 'bad_token' | 'wrong_domain' | 'unverified';

export class SsoError extends Error {
  code: SsoErrorCode;
  constructor(code: SsoErrorCode, message: string) {
    super(message);
    this.name = 'SsoError';
    this.code = code;
  }
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Kiểm id_token nhận trực tiếp từ điểm cuối token của Google qua TLS (theo OIDC có thể bỏ kiểm chữ ký).
 * Bắt buộc: iss, aud, exp, nonce, email_verified, và CẢ `hd` lẫn đuôi email thuộc tên miền được phép.
 */
export function verifyIdToken(idToken: string, expectedNonce: string, nowMs = Date.now()): GoogleIdentity {
  const p = decodeJwtPayload(idToken);
  if (!p) throw new SsoError('bad_token', 'id_token không hợp lệ.');
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (p.iss !== 'https://accounts.google.com' && p.iss !== 'accounts.google.com') throw new SsoError('bad_token', 'Sai nơi phát hành.');
  if (p.aud !== clientId) throw new SsoError('bad_token', 'Sai ứng dụng.');
  if (typeof p.exp !== 'number' || p.exp * 1000 <= nowMs) throw new SsoError('bad_token', 'Phiên Google đã hết hạn.');
  if (p.nonce !== expectedNonce) throw new SsoError('bad_token', 'Sai nonce.');
  if (p.email_verified !== true) throw new SsoError('unverified', 'Email chưa được xác minh.');
  const email = typeof p.email === 'string' ? p.email.trim().toLowerCase() : '';
  const domain = email.split('@')[1] ?? '';
  const hd = typeof p.hd === 'string' ? p.hd.trim().toLowerCase() : '';
  const allowed = allowedDomains();
  if (!email || !allowed.includes(domain) || !allowed.includes(hd)) {
    throw new SsoError('wrong_domain', 'Chỉ email của trường mới đăng nhập được.');
  }
  const fullName = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : email.split('@')[0];
  return { email, name: fullName.slice(0, 100), hd };
}

export async function completeLogin(
  request: Request,
  code: string,
  stateFromQuery: string,
  oauthCookie: string | null,
  fetchFn: typeof fetch = fetch,
): Promise<{ identity: GoogleIdentity; returnTo: string }> {
  const st = readOauthState(oauthCookie);
  if (!st || !stateFromQuery || st.state !== stateFromQuery) {
    throw new SsoError('bad_state', 'Phiên đăng nhập không khớp, hãy thử lại.');
  }
  let res: Response;
  try {
    res = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirect_uri: redirectUri(request),
        grant_type: 'authorization_code',
        code_verifier: st.verifier,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SsoError('exchange_failed', 'Không kết nối được Google.');
  }
  if (!res.ok) throw new SsoError('exchange_failed', 'Google từ chối đăng nhập.');
  const json = (await res.json().catch(() => ({}))) as { id_token?: string };
  if (!json.id_token) throw new SsoError('exchange_failed', 'Google không trả id_token.');
  return { identity: verifyIdToken(json.id_token, st.nonce), returnTo: st.returnTo };
}
