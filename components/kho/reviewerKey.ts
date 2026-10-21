// Mã người duyệt (tạm thời, cho đến khi có đăng nhập thật). Chỉ lưu trong sessionStorage của tab hiện tại.
export const REVIEWER_KEY_STORAGE = 'va-reviewer-key';
export const REVIEWER_HEADER = 'x-reviewer-key';

export function loadReviewerKey(): string {
  try {
    return sessionStorage.getItem(REVIEWER_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function saveReviewerKey(key: string): void {
  try {
    if (key) sessionStorage.setItem(REVIEWER_KEY_STORAGE, key);
    else sessionStorage.removeItem(REVIEWER_KEY_STORAGE);
  } catch {
    /* bỏ qua: trình duyệt chặn lưu trữ */
  }
}

export function reviewerHeaders(key: string): Record<string, string> {
  const k = key.trim();
  return k ? { [REVIEWER_HEADER]: k } : {};
}

/** Thông báo thân thiện bằng tiếng Việt cho lỗi cổng người duyệt (503: chưa cấu hình; 403: sai mã). */
export function reviewerErrorText(status: number, serverMessage?: string): string {
  if (status === 503) return 'Máy chủ chưa cấu hình mã người duyệt nên chưa thể duyệt. Vui lòng báo quản trị viên đặt mã.';
  if (status === 403 && /mã người duyệt/i.test(serverMessage ?? '')) {
    return 'Mã người duyệt chưa đúng hoặc còn trống. Vui lòng nhập lại mã do quản trị viên cấp.';
  }
  return serverMessage || `Lỗi HTTP ${status}`;
}
