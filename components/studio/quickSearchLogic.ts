// Logic thuần của hộp tìm nhanh toàn cục (Ctrl+K hoặc "/"): gõ không dấu vẫn tìm được, xếp hạng theo độ khớp.

/** Bỏ dấu tiếng Việt, đưa về chữ thường, gom khoảng trắng. */
export function fold(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export type QuickKind = 'compose' | 'page' | 'history' | 'lesson';

export interface QuickItem {
  id: string;
  kind: QuickKind;
  label: string;
  hint?: string;
  /** Từ khoá thêm để tìm (đã có hoặc chưa có dấu đều được). */
  keywords?: string;
  href?: string;
  /** Mã bài trong thư viện hoặc mã lịch sử, để Shell xử lý riêng. */
  ref?: string;
}

/** Điểm khớp: 0 = không khớp. Khớp đầu cụm > khớp đầu từ > có chứa; cần đủ MỌI từ trong truy vấn. */
export function scoreItem(item: Pick<QuickItem, 'label' | 'keywords' | 'hint'>, query: string): number {
  const q = fold(query);
  if (!q) return 1;
  const label = fold(item.label);
  const rest = fold(`${item.keywords ?? ''} ${item.hint ?? ''}`);
  const words = q.split(' ');
  let score = 0;
  for (const w of words) {
    if (label.startsWith(w)) score += 6;
    else if (label.includes(` ${w}`)) score += 4;
    else if (label.includes(w)) score += 3;
    else if (rest.includes(w)) score += 1;
    else return 0;
  }
  if (label === q) score += 10;
  else if (label.startsWith(q)) score += 5;
  return score;
}

export function rankItems<T extends Pick<QuickItem, 'label' | 'keywords' | 'hint'>>(items: T[], query: string, limit = 8): T[] {
  return items
    .map((it, i) => ({ it, i, s: scoreItem(it, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.it);
}

export const COMPOSE_ITEMS: QuickItem[] = [
  { id: 'c-khbd', kind: 'compose', label: 'Soạn kế hoạch bài dạy', keywords: 'khbd giao an 5512', href: '/?new=1&dang=ke_hoach' },
  { id: 'c-slide', kind: 'compose', label: 'Soạn slide bài giảng', keywords: 'powerpoint trinh chieu', href: '/?new=1&dang=slide' },
  { id: 'c-ws', kind: 'compose', label: 'Soạn phiếu học tập', keywords: 'worksheet phieu bai tap', href: '/?new=1&dang=worksheet' },
  { id: 'c-quiz', kind: 'compose', label: 'Soạn quiz củng cố trong tiết', keywords: 'cau hoi trac nghiem', href: '/?new=1&dang=quiz' },
  { id: 'c-exam', kind: 'compose', label: 'Soạn đề kiểm tra và ma trận', keywords: 'de thi kiem tra', href: '/kiem-tra' },
];

export const PAGE_ITEMS: QuickItem[] = [
  { id: 'p-home', kind: 'page', label: 'Trợ lý soạn bài', hint: 'Trang chủ', keywords: 'chat tro ly trang chu', href: '/' },
  { id: 'p-ask', kind: 'page', label: 'Hỏi nhanh', hint: 'Hỏi đáp chuyên môn', keywords: 'hoi dap quy che thong tu', href: '/?ask=1' },
  { id: 'p-form', kind: 'page', label: 'Soạn bài bằng biểu mẫu', keywords: 'bieu mau', href: '/soan-bai' },
  { id: 'p-exam', kind: 'page', label: 'Kiểm tra và đề thi', keywords: 'de kiem tra thi', href: '/kiem-tra' },
  { id: 'p-hb', kind: 'page', label: 'Nhận xét học bạ', hint: 'Cuối kỳ, cho cả lớp', keywords: 'hoc ba nhan xet chu nhiem thong tu 22', href: '/hoc-ba' },
  { id: 'p-saved', kind: 'page', label: 'Học liệu đã lưu', keywords: 'thu vien cua toi', href: '/thu-vien' },
  { id: 'p-hist', kind: 'page', label: 'Lịch sử của tôi', keywords: 'phien ban cu', href: '/lich-su' },
  { id: 'p-kho', kind: 'page', label: 'Thư viện tiết học', keywords: 'kho hoc lieu', href: '/kho' },
  { id: 'p-tools', kind: 'page', label: 'Bộ công cụ sư phạm', keywords: 'cong cu 82', href: '/cong-cu' },
  { id: 'p-graph', kind: 'page', label: 'Sơ đồ liên môn', keywords: 'lien ket mon', href: '/so-do-lien-mon' },
  { id: 'p-class', kind: 'page', label: 'Lớp học và chương trình', keywords: 'ho so lop gdpt', href: '/ho-so-lop-hoc' },
  { id: 'p-review', kind: 'page', label: 'Duyệt học liệu mẫu', keywords: 'nguoi duyet', href: '/duyet' },
  { id: 'p-quality', kind: 'page', label: 'Chất lượng bài soạn', href: '/chat-luong' },
  { id: 'p-conn', kind: 'page', label: 'Kết nối dịch vụ ngoài', keywords: 'gamma notebooklm', href: '/ket-noi' },
  { id: 'p-acct', kind: 'page', label: 'Tài khoản của tôi', keywords: 'tiet kiem ho so', href: '/tai-khoan' },
];

export const KIND_LABEL: Record<QuickKind, string> = {
  compose: 'Soạn nhanh',
  page: 'Đi tới',
  history: 'Bản soạn gần đây',
  lesson: 'Bài trong thư viện',
};

/** Đường dẫn mở một bài của thư viện ở trợ lý (trang chủ đọc `bai` và `tenBai`). */
export function lessonHref(id: string, title: string): string {
  return `/?bai=${encodeURIComponent(id)}&tenBai=${encodeURIComponent(title.slice(0, 120))}`;
}
