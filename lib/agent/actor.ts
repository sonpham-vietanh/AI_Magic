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
