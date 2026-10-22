// Tên cô/thầy đang soạn: hỏi một lần, lưu trong trình duyệt, dùng chung với trang Lịch sử.
export const ACTOR_KEY = 'va.actor';

export function readActor(): string {
  try {
    return (window.localStorage.getItem(ACTOR_KEY) ?? '').trim().slice(0, 100);
  } catch {
    return '';
  }
}

export function writeActor(name: string): void {
  try {
    const v = name.trim().slice(0, 100);
    if (v) window.localStorage.setItem(ACTOR_KEY, v);
    else window.localStorage.removeItem(ACTOR_KEY);
  } catch {
    /* bỏ qua */
  }
}

/** Tên dùng khi ghi phiên bản nhưng cô/thầy chưa nhập tên. */
export const ANONYMOUS_ACTOR = 'Giáo viên (chưa nhập tên)';

export const REVIEWER_STORAGE_KEY = 'va.reviewerKey';

export function readReviewerKey(): string {
  try {
    return (window.localStorage.getItem(REVIEWER_STORAGE_KEY) ?? '').trim();
  } catch {
    return '';
  }
}

export function writeReviewerKey(key: string): void {
  try {
    const v = key.trim().slice(0, 200);
    if (v) window.localStorage.setItem(REVIEWER_STORAGE_KEY, v);
    else window.localStorage.removeItem(REVIEWER_STORAGE_KEY);
  } catch {
    /* bỏ qua */
  }
}
