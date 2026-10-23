import { NextResponse } from 'next/server';
import { OAUTH_COOKIE_NAME, beginLogin, isSsoEnabled, publicUrl } from '@/lib/server/googleAuth';
import { rateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

/** Bắt đầu đăng nhập Google. Không dùng requireAccess vì đây là điều hướng của trình duyệt (GET). */
export async function GET(request: Request) {
  const base = new URL(request.url);
  if (!isSsoEnabled()) return NextResponse.redirect(publicUrl('/dang-nhap?error=not_configured', request));
  const limited = rateLimit(request, 'auth-google-start', 30, 60_000);
  if (limited) return NextResponse.redirect(publicUrl('/dang-nhap?error=rate', request));

  let begin: { url: string; cookie: string };
  try {
    begin = beginLogin(request, base.searchParams.get('returnTo'));
  } catch (err) {
    console.error('[auth google start] failed:', err);
    return NextResponse.redirect(publicUrl('/dang-nhap?error=not_configured', request));
  }
  const res = NextResponse.redirect(begin.url);
  res.cookies.set({
    name: OAUTH_COOKIE_NAME,
    value: begin.cookie,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/google',
    maxAge: 10 * 60,
  });
  return res;
}
