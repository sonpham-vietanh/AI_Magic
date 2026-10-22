// Cổng "người duyệt" TỐI THIỂU cho đến khi có đăng nhập thật (SSO Google Workspace).
// Mọi hành động duyệt/quản trị (duyệt bản chuẩn Kho, duyệt đề kiểm tra, duyệt giáo án gắn thời sự, ghi số liệu đánh giá)
// phải có header `x-reviewer-key` khớp biến môi trường REVIEWER_KEY. Chưa đặt REVIEWER_KEY thì từ chối TOÀN BỘ
// (an toàn mặc định): người quản trị phải chủ động đặt mã trên máy chủ thì mới duyệt được.
// Đây vẫn chỉ là mã dùng chung, chưa phải danh tính từng người; không thay thế đăng nhập thật.
import { timingSafeEqualStr } from './guard';
import { readSessionFromRequest } from './auth';

export const REVIEWER_HEADER = 'x-reviewer-key';

/** Trả null nếu hợp lệ; ngược lại trả Response lỗi (503 chưa cấu hình, 403 sai mã). */
export function requireReviewer(request: Request): Response | null {
  const key = process.env.REVIEWER_KEY?.trim();
  if (!key) {
    return Response.json(
      { ok: false, error: 'Chưa cấu hình mã người duyệt trên máy chủ (REVIEWER_KEY), nên chưa thể duyệt.' },
      { status: 503 },
    );
  }
  const got = request.headers.get(REVIEWER_HEADER)?.trim() ?? '';
  if (got && timingSafeEqualStr(got, key)) {
    return null;
  }
  const session = readSessionFromRequest(request);
  if (session && session.role === 'reviewer') {
    return null;
  }
  return Response.json({ ok: false, error: 'Cần mã người duyệt hợp lệ để thực hiện thao tác này.' }, { status: 403 });
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
