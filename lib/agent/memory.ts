// Nhớ lựa chọn lần trước (môn, khối, lớp, phong cách, dạng sản phẩm, mức tư duy) và lần soạn đang chạy dở.
// Chỉ lưu trong trình duyệt của giáo viên; mọi truy cập đều bọc try/catch nên chế độ riêng tư vẫn chạy.
import type { AgentSlots, FormatValue, StyleValue } from './flow';
import { FORMAT_ITEMS, BUNDLE_ITEM } from './flow';
import { PHONG_CACH_OPTIONS, type BloomStart } from '../ui/soanBai';

const LAST_KEY = 'va.agent.last.v1';
const PENDING_KEY = 'va.agent.pending.v1';

const SUBJECTS = ['toan', 'vat_ly', 'hoa_hoc', 'sinh_hoc', 'ngu_van', 'tieng_anh', 'tin_hoc'];
const GRADES = ['6', '7', '8', '9', '10', '11', '12'];
const FORMATS: string[] = [...FORMAT_ITEMS, BUNDLE_ITEM].map((f) => f.value);
const BLOOMS = ['nho', 'hieu', 'van_dung'];

export interface LastChoice {
  subject?: string;
  grade?: string;
  classId?: string;
  phongCach?: StyleValue;
  format?: FormatValue;
  bloom?: BloomStart;
}

/** Chỉ giữ giá trị hợp lệ: dữ liệu cũ hoặc bị sửa tay không làm vỡ giao diện. */
export function sanitizeLast(x: unknown): LastChoice {
  if (!x || typeof x !== 'object') return {};
  const o = x as Record<string, unknown>;
  const out: LastChoice = {};
  if (typeof o.subject === 'string' && SUBJECTS.includes(o.subject)) out.subject = o.subject;
  if (typeof o.grade === 'string' && GRADES.includes(o.grade)) out.grade = o.grade;
  if (typeof o.classId === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(o.classId)) out.classId = o.classId;
  if (typeof o.phongCach === 'string' && PHONG_CACH_OPTIONS.some((p) => p.value === o.phongCach)) out.phongCach = o.phongCach as StyleValue;
  if (typeof o.format === 'string' && FORMATS.includes(o.format)) out.format = o.format as FormatValue;
  if (typeof o.bloom === 'string' && BLOOMS.includes(o.bloom)) out.bloom = o.bloom as BloomStart;
  return out;
}

export function loadLastChoice(): LastChoice {
  try {
    const raw = window.localStorage.getItem(LAST_KEY);
    return raw ? sanitizeLast(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** Ghi nhớ lựa chọn từ ô hiện tại (không ghi tên bài: mỗi lần dạy bài khác). */
export function saveLastChoice(s: Pick<AgentSlots, 'subject' | 'grade' | 'classId' | 'phongCach' | 'format' | 'bloom'>): void {
  try {
    const v = sanitizeLast({
      subject: s.subject,
      grade: s.grade,
      classId: s.classId,
      phongCach: s.phongCach,
      format: s.format,
      bloom: s.bloom,
    });
    window.localStorage.setItem(LAST_KEY, JSON.stringify(v));
  } catch {
    /* bỏ qua */
  }
}

/** Áp lựa chọn lần trước lên ô hiện tại; không đè những gì đã có sẵn từ liên kết hay phiên làm việc. */
export function applyLast(s: AgentSlots, last: LastChoice, opts: { keepSubjectGrade?: boolean } = {}): AgentSlots {
  const next = { ...s };
  if (!opts.keepSubjectGrade) {
    if (last.subject) next.subject = last.subject;
    if (last.grade) next.grade = last.grade;
    if (last.classId && last.grade && next.grade === last.grade) next.classId = next.classId ?? last.classId;
  }
  if (!next.phongCach && last.phongCach) next.phongCach = last.phongCach;
  if (!next.bloom && last.bloom) next.bloom = last.bloom;
  return next;
}

export interface PendingRun {
  id: string;
  startedAt: number;
  slots: AgentSlots;
}

export function savePending(p: PendingRun): void {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    /* bỏ qua */
  }
}

export function clearPending(): void {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* bỏ qua */
  }
}

/** Lần soạn bị ngắt (tải lại trang, mất mạng). Quá 30 phút thì bỏ. */
export function loadPending(now = Date.now(), maxAgeMs = 30 * 60_000): PendingRun | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingRun;
    if (!p || typeof p.id !== 'string' || typeof p.startedAt !== 'number' || !p.slots || typeof p.slots !== 'object') return null;
    if (now - p.startedAt > maxAgeMs) {
      clearPending();
      return null;
    }
    return p;
  } catch {
    return null;
  }
}
