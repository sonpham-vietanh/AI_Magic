// Lịch sử các bản soạn gần đây, lưu trong trình duyệt của giáo viên (không gửi đi đâu).
// Mọi truy cập localStorage đều bọc try/catch: chế độ riêng tư hoặc bị chặn vẫn chạy bình thường.
import type { AgentResult } from './result';
import type { AgentSlots } from './flow';

export interface HistoryItem {
  id: string;
  title: string;
  at: string;
  slots: AgentSlots;
  result: AgentResult;
  /** Văn bản giáo viên đã chỉnh (nếu có), mặc định là bản AI soạn. */
  text: string;
  accepted?: boolean;
  /** Bản nháp chưa duyệt (lưu ngay khi AI trả xong, trước khi bấm Duyệt & dùng). */
  draft?: boolean;
}

const KEY = 'va.agent.history.v1';
const MAX_ITEMS = 12;

export const EVENT_HISTORY = 'va:history-changed';
export const EVENT_NEW_CHAT = 'va:new-chat';
export const EVENT_OPEN_HISTORY = 'va:open-history';

export function loadHistory(): HistoryItem[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is HistoryItem =>
        !!x && typeof x === 'object' && typeof (x as HistoryItem).id === 'string' && !!(x as HistoryItem).result,
    );
  } catch {
    return [];
  }
}

export function saveHistoryItem(item: HistoryItem): void {
  try {
    const rest = loadHistory().filter((h) => h.id !== item.id);
    let list = [item, ...rest].slice(0, MAX_ITEMS);
    // localStorage có hạn mức: nếu đầy thì bỏ bớt bản cũ nhất rồi thử lại.
    for (;;) {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(list));
        break;
      } catch {
        if (list.length <= 1) return;
        list = list.slice(0, -1);
      }
    }
    window.dispatchEvent(new CustomEvent(EVENT_HISTORY));
  } catch {
    /* bỏ qua */
  }
}

/** Cập nhật văn bản đã chỉnh của một bản (giữ nguyên các trường khác) để tải lại trang không mất chỉnh sửa. */
export function updateHistoryText(id: string, text: string): void {
  const cur = getHistoryItem(id);
  if (!cur) return;
  saveHistoryItem({ ...cur, text, accepted: false });
}

export function getHistoryItem(id: string): HistoryItem | undefined {
  return loadHistory().find((h) => h.id === id);
}

export function formatWhen(iso: string, now: Date = new Date()): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const mins = Math.round((now.getTime() - t.getTime()) / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return t.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}
