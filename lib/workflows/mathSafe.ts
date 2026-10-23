// Giữ nguyên công thức LaTeX ($...$, $$...$$) khi làm sạch văn bản, và chuẩn hoá ngày dd/mm/yyyy.
import { cleanPedagogicalText } from '@/lib/text/clean';

// Công thức khối $$...$$ (được xuống dòng) hoặc công thức dòng $...$ (không xuống dòng, không bắt đầu bằng khoảng trắng).
const MATH_RE = /\$\$[\s\S]+?\$\$|\$(?=[^\s$])[^$\n]+?(?<=[^\s])\$(?!\d)/g;
// Ký tự vùng riêng (private use) làm dấu chỗ giữ: không bao giờ xuất hiện trong văn bản bài giảng.
const OPEN = String.fromCharCode(0xe000);
const CLOSE = String.fromCharCode(0xe001);
const RESTORE_RE = new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g');

/** Làm sạch như cleanPedagogicalText nhưng các đoạn công thức được cất đi rồi trả nguyên văn. */
export function cleanKeepMath(raw: string): string {
  if (!raw) return '';
  const saved: string[] = [];
  const masked = raw.replace(MATH_RE, (m) => {
    saved.push(m);
    return `${OPEN}${saved.length - 1}${CLOSE}`;
  });
  const cleaned = cleanPedagogicalText(masked);
  return cleaned.replace(RESTORE_RE, (_m, i: string) => saved[Number(i)] ?? '');
}

const ISO_DATE_RE = /(?<![\d/-])(\d{4})-(\d{2})-(\d{2})(?![\d-])/g;

/** 2026-10-23 -> 23/10/2026 (chỉ khi là ngày thật), dùng cho văn bản hiển thị cho giáo viên. */
export function toVnDates(text: string): string {
  if (!text) return text;
  return text.replace(ISO_DATE_RE, (m, y: string, mo: string, d: string) => {
    const dt = new Date(`${y}-${mo}-${d}T00:00:00Z`);
    if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== m) return m;
    return `${d}/${mo}/${y}`;
  });
}

/** Áp toVnDates cho mọi chuỗi trong một cấu trúc JSON (sản phẩm có cấu trúc). */
export function mapStrings<T>(value: T): T {
  if (typeof value === 'string') return toVnDates(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => mapStrings(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = mapStrings(v);
    return out as T;
  }
  return value;
}

export function isoToVn(iso: string): string {
  return toVnDates(iso);
}
