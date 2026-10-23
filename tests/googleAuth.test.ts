import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  SsoError,
  beginLogin,
  completeLogin,
  isSsoEnabled,
  readOauthState,
  roleForEmail,
  safeReturnTo,
  verifyIdToken,
} from '@/lib/server/googleAuth';
import { createSessionToken, signValue, verifySessionToken, verifyValue } from '@/lib/server/sessionToken';
import { decideAccess } from '@/lib/server/accessPolicy';
import { effectiveActor } from '@/lib/server/identity';

const CLIENT = 'client-123.apps.googleusercontent.com';

function jwt(payload: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'RS256' })}.${enc(payload)}.sig`;
}

const good = (over: Record<string, unknown> = {}) => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT,
  exp: Math.floor(Date.now() / 1000) + 600,
  nonce: 'N1',
  email: 'Co.Lan@truongvietanh.com',
  email_verified: true,
  hd: 'truongvietanh.com',
  name: 'Cô Lan',
  ...over,
});

const saved = { ...process.env };
beforeEach(() => {
  process.env.VA_SSO_IN_TEST = '1';
  process.env.GOOGLE_CLIENT_ID = CLIENT;
  process.env.GOOGLE_CLIENT_SECRET = 'secret-xyz';
  process.env.APP_BASE_URL = 'https://magic.truongvietanh.com';
  process.env.SESSION_SECRET = 'test-session-secret-0123456789';
  delete process.env.AUTH_ALLOWED_DOMAINS;
  delete process.env.REVIEWER_EMAILS;
});
afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

describe('bật/tắt SSO', () => {
  it('bật khi có đủ client id và secret', () => {
    expect(isSsoEnabled()).toBe(true);
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(isSsoEnabled()).toBe(false);
  });
});

describe('safeReturnTo', () => {
  it('chỉ cho đường dẫn nội bộ', () => {
    expect(safeReturnTo('/kho?x=1')).toBe('/kho?x=1');
    expect(safeReturnTo('//evil.com')).toBe('/');
    expect(safeReturnTo('https://evil.com')).toBe('/');
    expect(safeReturnTo('/\\evil.com')).toBe('/');
    expect(safeReturnTo('/a\r\nSet-Cookie: x=1')).toBe('/');
    expect(safeReturnTo('/api/versions')).toBe('/');
    expect(safeReturnTo('/dang-nhap')).toBe('/');
    expect(safeReturnTo(null)).toBe('/');
  });
});

describe('verifyIdToken', () => {
  it('chấp nhận email trường hợp lệ và chuẩn hoá chữ thường', () => {
    const id = verifyIdToken(jwt(good()), 'N1');
    expect(id.email).toBe('co.lan@truongvietanh.com');
    expect(id.name).toBe('Cô Lan');
  });

  it.each([
    ['sai aud', { aud: 'khac' }],
    ['sai iss', { iss: 'https://evil.com' }],
    ['hết hạn', { exp: Math.floor(Date.now() / 1000) - 5 }],
    ['sai nonce', { nonce: 'khac' }],
    ['email chưa xác minh', { email_verified: false }],
    ['gmail thường (không có hd)', { email: 'a@gmail.com', hd: undefined }],
    ['đuôi email của trường nhưng hd khác', { hd: 'evil.com' }],
    ['hd của trường nhưng email khác miền', { email: 'a@evil.com' }],
    ['thiếu hd', { hd: undefined }],
    ['tên miền giả hậu tố', { email: 'a@truongvietanh.com.evil.com', hd: 'truongvietanh.com' }],
  ])('từ chối: %s', (_name, over) => {
    expect(() => verifyIdToken(jwt(good(over)), 'N1')).toThrow(SsoError);
  });

  it('id_token rác bị từ chối', () => {
    expect(() => verifyIdToken('khong.phai.jwt', 'N1')).toThrow(SsoError);
    expect(() => verifyIdToken('abc', 'N1')).toThrow(SsoError);
  });

  it('cho phép nhiều tên miền khi cấu hình', () => {
    process.env.AUTH_ALLOWED_DOMAINS = 'truongvietanh.com, vietanh.org';
    const id = verifyIdToken(jwt(good({ email: 'x@vietanh.org', hd: 'vietanh.org' })), 'N1');
    expect(id.email).toBe('x@vietanh.org');
  });
});

describe('quyền người duyệt theo email', () => {
  it('chỉ email nằm trong REVIEWER_EMAILS (không phân biệt hoa thường)', () => {
    process.env.REVIEWER_EMAILS = 'Tổ.Trưởng@truongvietanh.com; b@truongvietanh.com';
    expect(roleForEmail('tổ.trưởng@truongvietanh.com')).toBe('reviewer');
    expect(roleForEmail('B@truongvietanh.com')).toBe('reviewer');
    expect(roleForEmail('c@truongvietanh.com')).toBe('teacher');
  });
  it('không cấu hình thì ai cũng chỉ là giáo viên', () => {
    expect(roleForEmail('a@truongvietanh.com')).toBe('teacher');
  });
});

describe('beginLogin và completeLogin', () => {
  const req = new Request('https://magic.truongvietanh.com/api/auth/google/start');

  it('URL Google có PKCE, state, nonce, hd và redirect_uri đúng', () => {
    const { url, cookie } = beginLogin(req, '/kho');
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('client_id')).toBe(CLIENT);
    expect(u.searchParams.get('redirect_uri')).toBe('https://magic.truongvietanh.com/api/auth/google/callback');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('hd')).toBe('truongvietanh.com');
    const st = readOauthState(cookie)!;
    expect(st.returnTo).toBe('/kho');
    expect(u.searchParams.get('state')).toBe(st.state);
    expect(u.searchParams.get('nonce')).toBe(st.nonce);
    expect(u.searchParams.get('code_challenge')).toBe(createHash('sha256').update(st.verifier).digest('base64url'));
  });

  it('cookie OAuth hết hạn hoặc bị sửa thì không dùng được', () => {
    const { cookie } = beginLogin(req);
    expect(readOauthState(cookie, Date.now() + 11 * 60 * 1000)).toBeNull();
    expect(readOauthState(cookie.slice(0, -2) + 'xx')).toBeNull();
    expect(readOauthState(null)).toBeNull();
  });

  it('cookie OAuth không thể dùng làm phiên đăng nhập (khác mục đích ký)', () => {
    const { cookie } = beginLogin(req);
    expect(verifySessionToken(cookie)).toBeNull();
    const { token } = createSessionToken({ name: 'A', role: 'reviewer' });
    expect(readOauthState(token)).toBeNull();
    expect(verifyValue('oauth', token)).toBeNull();
  });

  it('completeLogin: state khớp thì đổi code lấy danh tính', async () => {
    const { cookie } = beginLogin(req, '/duyet');
    const st = readOauthState(cookie)!;
    const fetchFn = vi.fn(async (_u: unknown, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('code_verifier')).toBe(st.verifier);
      expect(body.get('redirect_uri')).toBe('https://magic.truongvietanh.com/api/auth/google/callback');
      return new Response(JSON.stringify({ id_token: jwt(good({ nonce: st.nonce })) }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await completeLogin(req, 'CODE', st.state, cookie, fetchFn);
    expect(r.identity.email).toBe('co.lan@truongvietanh.com');
    expect(r.returnTo).toBe('/duyet');
  });

  it('completeLogin: sai state, thiếu cookie, Google từ chối đều lỗi', async () => {
    const { cookie } = beginLogin(req);
    const st = readOauthState(cookie)!;
    const never = vi.fn() as unknown as typeof fetch;
    await expect(completeLogin(req, 'C', 'sai-state', cookie, never)).rejects.toMatchObject({ code: 'bad_state' });
    await expect(completeLogin(req, 'C', st.state, null, never)).rejects.toMatchObject({ code: 'bad_state' });
    expect(never).not.toHaveBeenCalled();
    const rejected = (async () => new Response('no', { status: 400 })) as unknown as typeof fetch;
    await expect(completeLogin(req, 'C', st.state, cookie, rejected)).rejects.toMatchObject({ code: 'exchange_failed' });
    const wrongNonce = (async () =>
      new Response(JSON.stringify({ id_token: jwt(good({ nonce: 'khac' })) }), { status: 200 })) as unknown as typeof fetch;
    await expect(completeLogin(req, 'C', st.state, cookie, wrongNonce)).rejects.toMatchObject({ code: 'bad_token' });
  });
});

describe('decideAccess', () => {
  const base = { ssoEnabled: true, hasSession: false, hasBearer: false };
  it('không bật SSO thì không chặn gì', () => {
    expect(decideAccess({ ...base, ssoEnabled: false, pathname: '/kho' })).toBe('allow');
  });
  it('trang cần phiên: chưa đăng nhập thì chuyển sang trang đăng nhập', () => {
    expect(decideAccess({ ...base, pathname: '/kho' })).toBe('login');
    expect(decideAccess({ ...base, pathname: '/' })).toBe('login');
    expect(decideAccess({ ...base, pathname: '/kho', hasSession: true })).toBe('allow');
  });
  it('API: không phiên thì 401, có Bearer thì cho qua (route tự kiểm token)', () => {
    expect(decideAccess({ ...base, pathname: '/api/versions' })).toBe('unauthorized');
    expect(decideAccess({ ...base, pathname: '/api/versions', hasBearer: true })).toBe('allow');
    expect(decideAccess({ ...base, pathname: '/api/versions', hasSession: true })).toBe('allow');
  });
  it('các đường mở: đăng nhập, health, major-os', () => {
    for (const p of ['/dang-nhap', '/api/auth/google/start', '/api/auth/session', '/api/health', '/api/major-os/usage']) {
      expect(decideAccess({ ...base, pathname: p })).toBe('allow');
    }
  });
  it('không bị lách bằng tiền tố giống tên', () => {
    expect(decideAccess({ ...base, pathname: '/api/healthcheck-evil' })).toBe('unauthorized');
    expect(decideAccess({ ...base, pathname: '/dang-nhap-evil' })).toBe('login');
    expect(decideAccess({ ...base, pathname: '/api/authx/foo' })).toBe('unauthorized');
  });
});

describe('effectiveActor', () => {
  const withCookie = (token: string) => new Request('https://x/y', { headers: { cookie: `va_session=${encodeURIComponent(token)}` } });

  it('SSO bật và có phiên Google: lấy email từ phiên, bỏ qua tên client khai', () => {
    const { token } = createSessionToken({ name: 'Cô Lan', email: 'co.lan@truongvietanh.com', role: 'teacher', via: 'google' });
    expect(effectiveActor(withCookie(token), 'Người Giả Mạo')).toBe('co.lan@truongvietanh.com');
  });
  it('phiên kiểu khai tên không được tin khi SSO bật', () => {
    const { token } = createSessionToken({ name: 'Ai Đó', role: 'teacher', via: 'name' });
    expect(effectiveActor(withCookie(token), 'Tên Khai')).toBe('Tên Khai');
  });
  it('SSO tắt: dùng tên khai báo như cũ', () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    const { token } = createSessionToken({ name: 'Cô Lan', email: 'co.lan@truongvietanh.com', role: 'teacher', via: 'google' });
    expect(effectiveActor(withCookie(token), '  Tên Khai  ')).toBe('Tên Khai');
  });
  it('phiên bị sửa chữ ký không được tin', () => {
    const { token } = createSessionToken({ name: 'Cô Lan', email: 'a@truongvietanh.com', role: 'reviewer', via: 'google' });
    const forged = signValue('oauth', { name: 'X', role: 'reviewer', exp: Date.now() + 1e9, via: 'google' });
    expect(effectiveActor(withCookie(forged), 'Khai')).toBe('Khai');
    expect(effectiveActor(withCookie(token.slice(0, -3) + 'abc'), 'Khai')).toBe('Khai');
  });
});
