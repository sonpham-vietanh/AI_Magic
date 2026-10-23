// Cổng "người duyệt" TỐI THIỂU cho đến khi có đăng nhập thật (SSO Google Workspace).
// Mọi hành động duyệt/quản trị (duyệt bản chuẩn Kho, duyệt đề kiểm tra, duyệt giáo án gắn thời sự, ghi số liệu đánh giá)
// phải có header `x-reviewer-key` khớp biến môi trường REVIEWER_KEY. Chưa đặt REVIEWER_KEY thì từ chối TOÀN BỘ
// (an toàn mặc định): người quản trị phải chủ động đặt mã trên máy chủ thì mới duyệt được.
// Đây vẫn chỉ là mã dùng chung, chưa phải danh tính từng người; không thay thế đăng nhập thật.
import { timingSafeEqualStr } from './guard';
import { readSessionFromRequest, type TeacherSession, type UserRole } from './auth';
import { effectiveSessionRole } from '@/lib/users/roles';

export const REVIEWER_HEADER = 'x-reviewer-key';

/**
 * Vai trò phiên được áp dụng thật: phiên Google được tính lại từ kho vai trò (đổi vai trò/chặn có hiệu lực ngay,
 * không phải đợi cookie 14 ngày); tài khoản bị chặn bị từ chối.
 */
function sessionRole(request: Request): { session: TeacherSession | null; role: UserRole | null } {
  const session = readSessionFromRequest(request);
  return { session, role: session ? effectiveSessionRole(session) : null };
}

/** Trả null nếu hợp lệ; ngược lại trả Response lỗi (503 chưa cấu hình, 403 sai mã). */
export function requireReviewer(request: Request): Response | null {
  const { role } = sessionRole(request);
  if (role === 'reviewer' || role === 'admin') return null;

  const key = process.env.REVIEWER_KEY?.trim();
  if (!key) {
    return Response.json(
      { ok: false, error: 'Chưa cấu hình mã người duyệt trên máy chủ (REVIEWER_KEY), nên chưa thể duyệt.' },
      { status: 503 },
    );
  }
  const got = request.headers.get(REVIEWER_HEADER)?.trim() ?? '';
  if (got && timingSafeEqualStr(got, key)) return null;
  return Response.json({ ok: false, error: 'Cần mã người duyệt hợp lệ để thực hiện thao tác này.' }, { status: 403 });
}

/** Chỉ quản trị viên (email trong ADMIN_EMAILS hoặc được gán quyền admin). Trả null nếu hợp lệ, ngược lại Response 401/403. */
export function requireAdmin(request: Request): Response | null {
  const { session, role } = sessionRole(request);
  if (!session) return Response.json({ ok: false, error: 'Cần đăng nhập.' }, { status: 401 });
  if (role === null) return Response.json({ ok: false, error: 'Tài khoản này đã bị chặn.' }, { status: 403 });
  if (role !== 'admin') return Response.json({ ok: false, error: 'Chỉ quản trị viên mới thực hiện được.' }, { status: 403 });
  return null;
}

/** Chuẩn hoá tên người thao tác để so sánh (NFC, bỏ khoảng trắng thừa, không phân biệt hoa/thường). */
export function normalizeActorName(name: string): string {
  return String(name ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('vi');
}

export function sameActor(a: string, b: string): boolean {
  const x = normalizeActorName(a);
  return x !== '' && x === normalizeActorName(b);
}
