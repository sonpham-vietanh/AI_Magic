import { NextResponse } from 'next/server';
import { OAUTH_COOKIE_NAME, SsoError, completeLogin, isSsoEnabled, publicUrl, roleForEmail } from '@/lib/server/googleAuth';
import { SESSION_COOKIE_NAME, createSessionToken, parseCookieValue, recordTeacherSessionAudit } from '@/lib/server/auth';
import { rateLimit } from '@/lib/server/rateLimit';

export const runtime = 'nodejs';

function back(request: Request, error: string): NextResponse {
  const res = NextResponse.redirect(publicUrl(`/dang-nhap?error=${encodeURIComponent(error)}`, request));
  res.cookies.set({ name: OAUTH_COOKIE_NAME, value: '', path: '/api/auth/google', maxAge: 0 });
  return res;
}

export async function GET(request: Request) {
  if (!isSsoEnabled()) return back(request, 'not_configured');
  const limited = rateLimit(request, 'auth-google-callback', 30, 60_000);
  if (limited) return back(request, 'rate');

  const url = new URL(request.url);
  if (url.searchParams.get('error')) return back(request, 'denied');
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  if (!code) return back(request, 'bad_state');

  try {
    const { identity, returnTo } = await completeLogin(
      request,
      code,
      state,
      parseCookieValue(request.headers.get('cookie'), OAUTH_COOKIE_NAME),
    );
    const { token, session } = createSessionToken({
      name: identity.name,
      email: identity.email,
      role: roleForEmail(identity.email),
      via: 'google',
    });
    await recordTeacherSessionAudit(session).catch(() => undefined);
    const res = NextResponse.redirect(publicUrl(returnTo, request));
    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 14 * 24 * 60 * 60,
    });
    res.cookies.set({ name: OAUTH_COOKIE_NAME, value: '', path: '/api/auth/google', maxAge: 0 });
    return res;
  } catch (err) {
    if (err instanceof SsoError) return back(request, err.code);
    console.error('[auth google callback] failed:', err);
    return back(request, 'exchange_failed');
  }
}
