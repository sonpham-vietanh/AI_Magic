// Danh tính người thao tác phía máy chủ. Khi bật đăng nhập Google, lấy từ phiên đã ký (email trường),
// bỏ qua tên do client tự khai. Chưa bật thì dùng tên khai báo như cũ.
import { isSsoEnabled } from './googleAuth';
import { readSessionFromRequest } from './sessionToken';

export function effectiveActor(request: Request, declared: string | null | undefined): string {
  if (isSsoEnabled()) {
    const s = readSessionFromRequest(request);
    if (s && s.via === 'google') return (s.email || s.name).slice(0, 100);
  }
  return (declared ?? '').trim().slice(0, 100);
}
