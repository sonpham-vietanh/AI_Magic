import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decideAccess } from '@/lib/server/accessPolicy';
import { isSsoEnabled, publicUrl } from '@/lib/server/googleAuth';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/server/sessionToken';

// Khi bật đăng nhập Google: mọi trang cần phiên hợp lệ; API cần phiên hoặc Bearer APP_API_TOKEN.
// Chưa cấu hình Google thì không chặn gì (giữ nguyên chế độ cũ).
export function proxy(request: NextRequest) {
  const ssoEnabled = isSsoEnabled();
  if (!ssoEnabled) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? '';
  let hasSession = false;
  try {
    hasSession = Boolean(token && verifySessionToken(token));
  } catch {
    hasSession = false;
  }
  const hasBearer = /^Bearer\s+\S+/i.test(request.headers.get('authorization') ?? '');

  const decision = decideAccess({ pathname: request.nextUrl.pathname, ssoEnabled, hasSession, hasBearer });
  if (decision === 'allow') return NextResponse.next();
  if (decision === 'unauthorized') {
    return NextResponse.json({ ok: false, error: 'Cần đăng nhập bằng email của trường.' }, { status: 401 });
  }
  const login = publicUrl('/dang-nhap', request);
  const here = request.nextUrl.pathname + request.nextUrl.search;
  if (here !== '/') login.searchParams.set('returnTo', here);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|map|woff2?)$).*)'],
};
