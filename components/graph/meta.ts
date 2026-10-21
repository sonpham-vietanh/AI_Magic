// Nhãn, mã môn và loại quan hệ dùng chung cho đồ thị liên môn.

export const SUBJECTS_META: { name: string; code: string }[] = [
  { name: 'Toán', code: 'To' },
  { name: 'Ngữ văn', code: 'Vă' },
  { name: 'Tiếng Anh', code: 'Anh' },
  { name: 'Khoa học tự nhiên', code: 'KH' },
  { name: 'Lịch sử và Địa lí', code: 'LĐ' },
  { name: 'Giáo dục công dân', code: 'CD' },
  { name: 'Tin học', code: 'Tin' },
  { name: 'Công nghệ', code: 'CN' },
  { name: 'Vật lí', code: 'Lí' },
  { name: 'Hoá học', code: 'Hoá' },
  { name: 'Sinh học', code: 'Sinh' },
  { name: 'Địa lí', code: 'Địa' },
  { name: 'Giáo dục kinh tế và pháp luật', code: 'KT' },
  { name: 'Oxford English', code: 'OE' },
];

export const SUBJECT_NAMES = SUBJECTS_META.map((s) => s.name);

const TONES = 7;

export function subjectIndex(subject: string): number {
  const i = SUBJECTS_META.findIndex((s) => s.name === subject);
  return i < 0 ? SUBJECTS_META.length : i;
}

/** Mã chữ ngắn của môn (không chỉ dựa vào màu). */
export function subjectCode(subject: string): string {
  const m = SUBJECTS_META.find((s) => s.name === subject);
  if (m) return m.code;
  return subject.trim().slice(0, 2) || '?';
}

/** 0..6: chỉ số màu (lớp CSS sd-t0..sd-t6). */
export function subjectTone(subject: string): number {
  return subjectIndex(subject) % TONES;
}

export type LinkKind = 'hard' | 'soft' | 'cross' | 'other';

export function linkKind(e: { relation: string; cross_subject?: string | null }): LinkKind {
  if (e.cross_subject) return 'cross';
  if (e.relation === 'prerequisite_hard') return 'hard';
  if (e.relation === 'prerequisite_soft') return 'soft';
  return 'other';
}

export const LINK_LABEL: Record<LinkKind, string> = {
  hard: 'Tiên quyết bắt buộc',
  soft: 'Tiên quyết bổ trợ',
  cross: 'Liên môn',
  other: 'Liên kết mở rộng',
};

/** Cắt tiêu đề thành tối đa `lines` dòng, mỗi dòng không quá `maxChars` ký tự. */
export function wrapLabel(text: string, maxChars: number, lines = 2): string[] {
  const words = cleanMath(text).replace(/\s+/g, ' ').trim().split(' ');
  const out: string[] = [];
  let cur = '';
  let i = 0;
  for (; i < words.length; i++) {
    const w = words[i];
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
      continue;
    }
    if (cur) out.push(cur);
    cur = w.length > maxChars ? w.slice(0, maxChars) : w;
    if (out.length === lines - 1) break;
  }
  if (out.length < lines && cur) {
    out.push(cur);
    i++;
  }
  const consumed = out.join(' ').split(' ').length;
  if (consumed < words.length && out.length) {
    const last = out[out.length - 1];
    out[out.length - 1] = (last.length >= maxChars ? last.slice(0, maxChars - 1) : last) + '…';
  }
  return out.slice(0, lines);
}

/** Bỏ ký hiệu LaTeX thô trong tiêu đề để nhãn dễ đọc. */
export function cleanMath(text: string): string {
  return text
    .replace(/\\mathbb\{R\}/g, 'ℝ')
    .replace(/\\mathbb\{Q\}/g, 'ℚ')
    .replace(/\\mathbb\{N\}/g, 'ℕ')
    .replace(/\\mathbb\{Z\}/g, 'ℤ')
    .replace(/\\[()]/g, '')
    .replace(/\\([a-zA-Z]+)/g, '$1');
}
