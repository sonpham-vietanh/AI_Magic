// Luồng hội thoại của trợ lý soạn bài: máy trạng thái XÁC ĐỊNH, không có Planner tự do.
// Trợ lý chỉ điền 7 tham số theo thứ tự cố định bằng thẻ chọn có ràng buộc; mọi bước
// đều quy về đúng API /api/workflows/run (router cứng 6 workflow ở phía máy chủ).
import { WorkflowParamsSchema, type WorkflowParams } from '../workflows/types';
import {
  BLOOM_CHOICES,
  FORMAT_OPTIONS,
  NGON_NGU_OPTIONS,
  PHONG_CACH_OPTIONS,
  bloomPreview,
  type BloomStart,
  type NgonNgu,
} from '../ui/soanBai';

export type FormatValue = (typeof FORMAT_OPTIONS)[number]['value'];
export type StyleValue = (typeof PHONG_CACH_OPTIONS)[number]['value'];
export type AskStep = 'format' | 'bai' | 'bloom' | 'phongCach';
export type Step = AskStep | 'confirm';

export interface NewsEvent {
  tieuDe: string;
  url: string;
  ngayDang: string;
  noiDung?: string;
}

export interface AgentSlots {
  format?: FormatValue;
  subject: string;
  grade: string;
  baiDayId?: string;
  baiTitle?: string;
  bloom?: BloomStart;
  phongCach?: StyleValue;
  ngonNgu: NgonNgu;
  ngayDay: string;
  classId?: string;
  suKien?: NewsEvent;
  /** Bài thứ hai để soạn tích hợp liên môn (đến từ Sơ đồ liên môn). */
  lienKetId?: string;
  lienKetTitle?: string;
}

/** Quiz và đề kiểm tra không phụ thuộc phong cách dạy: dùng mặc định, bớt một câu hỏi. */
const FORMATS_WITHOUT_STYLE: readonly FormatValue[] = ['quiz', 'de_kiem_tra'];
const DEFAULT_STYLE: StyleValue = 'truyen_thong';

export function needsStyle(format?: FormatValue): boolean {
  return !format || !FORMATS_WITHOUT_STYLE.includes(format);
}

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vn.toISOString().slice(0, 10);
}

export function initialSlots(now: Date = new Date()): AgentSlots {
  return { subject: 'toan', grade: '10', ngonNgu: 'vi', ngayDay: todayISO(now) };
}

/** Bước tiếp theo còn thiếu. Thứ tự cố định: dạng sản phẩm → bài → Bloom → phong cách → xác nhận. */
export function nextStep(s: AgentSlots): Step {
  if (!s.format) return 'format';
  if (!s.baiDayId) return 'bai';
  if (!s.bloom) return 'bloom';
  if (needsStyle(s.format) && !s.phongCach) return 'phongCach';
  return 'confirm';
}

/** Xoá câu trả lời của một bước (khi người dùng bấm "Sửa") để hỏi lại đúng bước đó. */
export function clearStep(s: AgentSlots, step: AskStep): AgentSlots {
  const next = { ...s };
  if (step === 'format') delete next.format;
  if (step === 'bai') {
    delete next.baiDayId;
    delete next.baiTitle;
  }
  if (step === 'bloom') delete next.bloom;
  if (step === 'phongCach') delete next.phongCach;
  return next;
}

export const STEP_PROMPTS: Record<AskStep, string> = {
  format: 'Cô/thầy muốn mình chuẩn bị sản phẩm nào?',
  bai: 'Dạy bài nào? Gõ tên bài hoặc chọn trong danh sách.',
  bloom: 'Lớp đang ở mức tư duy nào? Mình sẽ lấy thêm 3 bậc cao hơn, luôn có bậc Phân tích.',
  phongCach: 'Cô/thầy muốn tiết học theo phong cách nào?',
};

export function formatLabel(v?: string): string {
  return FORMAT_OPTIONS.find((o) => o.value === v)?.label ?? '';
}
export function styleLabel(v?: string): string {
  return PHONG_CACH_OPTIONS.find((o) => o.value === v)?.label ?? '';
}
export function bloomLabel(v?: string): string {
  return BLOOM_CHOICES.find((o) => o.value === v)?.label ?? '';
}
export function languageLabel(v?: string): string {
  return NGON_NGU_OPTIONS.find((o) => o.value === v)?.label ?? '';
}

/** Dòng người dùng "nói" sau khi chọn một thẻ, hiển thị như tin nhắn của họ. */
export function answerText(step: AskStep, s: AgentSlots): string {
  if (step === 'format') return formatLabel(s.format);
  if (step === 'bai') return s.baiTitle ?? '';
  if (step === 'bloom') return `Mức ${bloomLabel(s.bloom)} (${bloomPreview(s.bloom).join(' → ')})`;
  return styleLabel(s.phongCach);
}

export interface SummaryRow {
  step: AskStep | null;
  label: string;
  value: string;
}

/** Các dòng tóm tắt trước khi soạn. `step` cho biết bấm "Sửa" sẽ hỏi lại bước nào. */
export function summaryRows(s: AgentSlots): SummaryRow[] {
  const rows: SummaryRow[] = [
    { step: 'format', label: 'Sản phẩm', value: formatLabel(s.format) },
    { step: 'bai', label: 'Bài dạy', value: s.baiTitle ?? '' },
    { step: 'bloom', label: 'Các bậc tư duy', value: bloomPreview(s.bloom).join(' → ') },
  ];
  if (needsStyle(s.format)) rows.push({ step: 'phongCach', label: 'Phong cách', value: styleLabel(s.phongCach) });
  if (s.lienKetId) rows.push({ step: null, label: 'Bài liên kết (liên môn)', value: s.lienKetTitle ?? s.lienKetId });
  return rows;
}

export type ParamsResult =
  | { ok: true; params: WorkflowParams }
  | { ok: false; error: string };

/** Ghép các tham số gửi API và kiểm tra bằng đúng schema của máy chủ. */
export function toParams(
  s: AgentSlots,
  extra: { regenerationOf?: string; teacher?: { name: string; email?: string } } = {},
): ParamsResult {
  const raw: Record<string, unknown> = {
    ngayDay: s.ngayDay,
    baiDayId: s.baiDayId,
    bloomThapNhat: s.bloom,
    ngonNgu: s.ngonNgu,
    phongCach: s.phongCach ?? (needsStyle(s.format) ? undefined : DEFAULT_STYLE),
    formatDauRa: s.format,
  };
  if (s.classId) raw.classId = s.classId;
  if (s.lienKetId) raw.lienKetId = s.lienKetId;
  if (s.suKien) raw.suKienThoiSu = s.suKien;
  if (extra.teacher) raw.teacher = extra.teacher;
  if (extra.regenerationOf) raw.regenerationOf = extra.regenerationOf;
  const parsed = WorkflowParamsSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `${first.path.join('.') || 'tham số'}: ${first.message}` };
  }
  return { ok: true, params: parsed.data };
}

/** Gợi ý tiếp theo sau khi soạn xong: đổi sản phẩm nhưng giữ nguyên bài và lớp. */
export function followUpFormats(current?: FormatValue): { value: FormatValue; label: string }[] {
  const wanted: FormatValue[] = ['quiz', 'worksheet', 'slide', 'de_kiem_tra'];
  return wanted
    .filter((v) => v !== current)
    .slice(0, 3)
    .map((v) => ({ value: v, label: formatLabel(v) }));
}
