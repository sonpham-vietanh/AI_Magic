import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAccess, timingSafeEqualStr } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { isSsoEnabled } from '@/lib/server/googleAuth';
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  readSessionFromRequest,
  recordTeacherSessionAudit,
} from '@/lib/server/auth';

export const runtime = 'nodejs';

const loginSchema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên cô/thầy').max(100),
  email: z
    .string()
    .trim()
    .max(120)
    .optional()
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      'Email không đúng định dạng (ví dụ: gv@truongvietanh.com).',
    ),
  reviewerKey: z.string().trim().max(200).optional(),
});

export async function GET(request: Request) {
  const denied = await requireAccess(request);
  if (denied) return denied;
  const session = readSessionFromRequest(request);
  const reviewerConfigured = Boolean(process.env.REVIEWER_KEY?.trim());
  return NextResponse.json({
    ok: true,
    session,
    reviewerConfigured,
    ssoEnabled: isSsoEnabled(),
  });
}

export async function POST(request: Request) {
  const denied = await requireAccess(request);
  if (denied) return denied;
  const limited = await rateLimit(request, 'auth-session', 20, 60_000);
  if (limited) return limited;
  // Đã bật đăng nhập Google thì không cho tự khai tên để lấy phiên; phải đăng nhập bằng email trường.
  if (isSsoEnabled()) {
    return NextResponse.json(
      { ok: false, error: 'Vui lòng đăng nhập bằng email của trường (Google).' },
      { status: 403 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Dữ liệu JSON không hợp lệ.' }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Thông tin phiên không hợp lệ.' },
      { status: 400 },
    );
  }

  const { name, email, reviewerKey } = parsed.data;
  let role: 'teacher' | 'reviewer' = 'teacher';

  if (reviewerKey) {
    const serverKey = process.env.REVIEWER_KEY?.trim();
    if (!serverKey) {
      return NextResponse.json(
        { ok: false, error: 'Máy chủ chưa cấu hình REVIEWER_KEY nên chưa thể cấp quyền Người duyệt.' },
        { status: 503 },
      );
    }
    if (!timingSafeEqualStr(reviewerKey, serverKey)) {
      return NextResponse.json(
        { ok: false, error: 'Mã người duyệt không đúng. Vui lòng kiểm tra lại hoặc để trống nếu là Giáo viên.' },
        { status: 403 },
      );
    }
    role = 'reviewer';
  }

  const { token, session } = createSessionToken({ name, email, role });
  await recordTeacherSessionAudit(session).catch(() => undefined);

  const res = NextResponse.json({ ok: true, session });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 14 * 24 * 60 * 60,
  });
  return res;
}

export async function DELETE(request: Request) {
  const denied = await requireAccess(request);
  if (denied) return denied;
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
