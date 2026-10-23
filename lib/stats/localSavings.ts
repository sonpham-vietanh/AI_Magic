// Phút tiết kiệm từ nhận xét học bạ được cộng ngay trong trình duyệt (chỉ lưu SỐ em và thời điểm, không lưu tên hay nội dung),
// vì danh sách học sinh là dữ liệu nhạy cảm nên không gửi lên máy chủ.
import { HOC_BA_MINUTES_PER_STUDENT } from './savings';

const KEY = 'va.hb.saved.v1';
const MAX_ENTRIES = 200;
const DAY = 24 * 60 * 60 * 1000;

interface Entry {
  at: number;
  n: number;
}

function read(): Entry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter((e): e is Entry => !!e && typeof e.at === 'number' && typeof e.n === 'number' && e.n > 0)
      : [];
  } catch {
    return [];
  }
}

/** Ghi nhận đã soạn xong `n` nhận xét. */
export function recordHocBa(n: number, now = Date.now()): void {
  if (!(n > 0)) return;
  try {
    const list = [...read(), { at: now, n: Math.min(n, 100) }].slice(-MAX_ENTRIES);
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* bỏ qua */
  }
}

/** Số phút tiết kiệm từ học bạ trong `days` ngày gần nhất. */
export function hocBaMinutes(days: number, now = Date.now()): number {
  return read()
    .filter((e) => now - e.at <= days * DAY)
    .reduce((sum, e) => sum + e.n * HOC_BA_MINUTES_PER_STUDENT, 0);
}
