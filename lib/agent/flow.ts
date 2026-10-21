// Luồng hội thoại của trợ lý soạn bài: máy trạng thái XÁC ĐỊNH, không có Planner tự do.
// Trợ lý chỉ điền 7 tham số theo thứ tự cố định bằng thẻ chọn có ràng buộc; mọi bước
// đều quy về đúng API /api/workflows/run (router cứng 6 workflow ở phía máy chủ).
import { WorkflowParamsSchema, type WorkflowParams } from '../workflows/types';
import { RESOURCE_KINDS, RESOURCE_LABELS, type ResourceKind } from '../resources/types';
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
export type AskStep = 'format' | 'dangTaiNguyen' | 'bai' | 'bloom' | 'phongCach';
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
  /** Chỉ dùng khi sản phẩm là "Trọn bộ 6 dạng": các dạng cô/thầy muốn sinh (tối thiểu 1). */
  dangTaiNguyen?: ResourceKind[];
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

/** 11 sản phẩm của sơ đồ v2.1, nhóm theo cách giáo viên dùng. `desc` nói rõ ĐẦU RA nhận được. */
export interface FormatItem {
  value: FormatValue;
  label: string;
  desc: string;
}
export const FORMAT_GROUPS: { title: string; items: FormatItem[] }[] = [
  {
    title: 'Văn bản & tài liệu',
    items: [
      { value: 'ke_hoach', label: 'Kế hoạch bài dạy', desc: 'Giáo án theo Công văn 5512, tải về Word (.docx)' },
      { value: 'slide', label: 'Slide', desc: 'Bộ slide tải về PowerPoint (.pptx)' },
      { value: 'worksheet', label: 'Phiếu học tập', desc: 'Phiếu cho học sinh kèm đáp án riêng cho giáo viên, tải Word hoặc in PDF' },
    ],
  },
  {
    title: 'Đánh giá',
    items: [
      { value: 'quiz', label: 'Quiz củng cố trong tiết', desc: 'Bộ câu hỏi nhanh dùng ngay trong tiết, tải về Word' },
      { value: 'de_kiem_tra', label: 'Đề kiểm tra + ma trận', desc: 'Đề kèm ma trận theo Thông tư 22, tải về Word' },
    ],
  },
  {
    title: 'Tài nguyên đa dạng',
    items: [
      { value: 'infographic', label: 'Infographic', desc: 'Ảnh tóm tắt ý chính của bài, tải về PNG' },
      { value: 'mindmap', label: 'Mindmap', desc: 'Sơ đồ tư duy của bài, tải về ảnh PNG' },
      { value: 'podcast', label: 'Podcast', desc: 'Kịch bản podcast 1–2 người dẫn, tải về Word (chưa dựng file âm thanh)' },
      { value: 'tranh_luan', label: 'Audio tranh luận 2 chuyên gia', desc: 'Kịch bản tranh luận giữa 2 chuyên gia, tải về Word (chưa dựng file âm thanh)' },
      { value: 'video', label: 'Video 1–8 phút', desc: 'Kịch bản từng cảnh cho video 1–8 phút, tải về Word (chưa dựng video)' },
      { value: 'tai_nguyen_6_dang', label: 'Trọn bộ 6 dạng', desc: 'Bài đọc, infographic, mindmap, video, tranh luận, podcast cho một bài; chọn dạng cần ở bước sau' },
    ],
  },
];

export const FORMAT_ITEMS: FormatItem[] = FORMAT_GROUPS.flatMap((g) => g.items);

export function formatDesc(v?: string): string {
  return FORMAT_ITEMS.find((o) => o.value === v)?.desc ?? '';
}

/** Chuẩn hoá danh sách dạng tài nguyên: bỏ trùng/sai, giữ thứ tự chuẩn của sơ đồ. */
export function normalizeResources(list?: readonly string[] | null): ResourceKind[] {
  const set = new Set(list ?? []);
  return RESOURCE_KINDS.filter((k) => set.has(k));
}

/** Bật/tắt một dạng; không cho bỏ dạng cuối cùng (tối thiểu 1). */
export function toggleResource(current: readonly ResourceKind[], kind: ResourceKind): ResourceKind[] {
  const has = current.includes(kind);
  if (has && current.length <= 1) return normalizeResources(current);
  return normalizeResources(has ? current.filter((k) => k !== kind) : [...current, kind]);
}

export const ALL_RESOURCES: ResourceKind[] = [...RESOURCE_KINDS];

export function needsResourceChoice(format?: string): boolean {
  return format === 'tai_nguyen_6_dang';
}

export function resourcesLabel(list?: readonly ResourceKind[]): string {
  const l = normalizeResources(list);
  if (l.length === RESOURCE_KINDS.length) return 'Cả 6 dạng';
  return l.map((k) => RESOURCE_LABELS[k]).join(', ');
}

/** Gắn dangTaiNguyen vào tham số gửi API (chỉ khi sản phẩm là trọn bộ). Lỗi nếu chọn rỗng. */
export function attachResources(
  params: Record<string, unknown>,
  format: string | undefined,
  kinds: readonly string[] | undefined,
): { ok: true; params: Record<string, unknown> } | { ok: false; error: string } {
  if (!needsResourceChoice(format)) return { ok: true, params };
  const list = normalizeResources(kinds ?? ALL_RESOURCES);
  if (list.length < 1) return { ok: false, error: 'dangTaiNguyen: chọn ít nhất 1 dạng tài nguyên' };
  return { ok: true, params: { ...params, dangTaiNguyen: list } };
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
  if (needsResourceChoice(s.format) && !s.dangTaiNguyen?.length) return 'dangTaiNguyen';
  if (!s.baiDayId) return 'bai';
  if (!s.bloom) return 'bloom';
  if (needsStyle(s.format) && !s.phongCach) return 'phongCach';
  return 'confirm';
}

/** Xoá câu trả lời của một bước (khi người dùng bấm "Sửa") để hỏi lại đúng bước đó. */
export function clearStep(s: AgentSlots, step: AskStep): AgentSlots {
  const next = { ...s };
  if (step === 'format') {
    delete next.format;
    delete next.dangTaiNguyen;
  }
  if (step === 'dangTaiNguyen') delete next.dangTaiNguyen;
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
  dangTaiNguyen: 'Trong trọn bộ, cô/thầy cần những dạng nào? Mặc định là cả 6 dạng, bỏ dạng nào không cần.',
  bai: 'Dạy bài nào? Gõ tên bài hoặc chọn trong danh sách.',
  bloom: 'Lớp đang ở mức tư duy nào? Mình sẽ lấy thêm 3 bậc cao hơn, luôn có bậc Phân tích.',
  phongCach: 'Cô/thầy muốn tiết học theo phong cách nào?',
};

export function formatLabel(v?: string): string {
  return FORMAT_ITEMS.find((o) => o.value === v)?.label ?? FORMAT_OPTIONS.find((o) => o.value === v)?.label ?? '';
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
  if (step === 'dangTaiNguyen') return `Các dạng: ${resourcesLabel(s.dangTaiNguyen)}`;
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
  if (needsResourceChoice(s.format)) {
    rows.splice(1, 0, { step: 'dangTaiNguyen', label: 'Các dạng tài nguyên', value: resourcesLabel(s.dangTaiNguyen) });
  }
  if (needsStyle(s.format)) rows.push({ step: 'phongCach', label: 'Phong cách', value: styleLabel(s.phongCach) });
  if (s.lienKetId) rows.push({ step: null, label: 'Bài liên kết (liên môn)', value: s.lienKetTitle ?? s.lienKetId });
  return rows;
}

/** Tham số gửi API: WorkflowParams cộng phần mở rộng `dangTaiNguyen` (chỉ có với trọn bộ 6 dạng). */
export type RunParams = WorkflowParams & { dangTaiNguyen?: ResourceKind[] };

export type ParamsResult =
  | { ok: true; params: RunParams }
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
  const withRes = attachResources({ ...parsed.data }, s.format, s.dangTaiNguyen);
  if (!withRes.ok) return withRes;
  return { ok: true, params: withRes.params as RunParams };
}

/** Gợi ý tiếp theo sau khi soạn xong: đổi sản phẩm nhưng giữ nguyên bài và lớp. */
export function followUpFormats(current?: FormatValue): { value: FormatValue; label: string }[] {
  const wanted: FormatValue[] = ['quiz', 'worksheet', 'slide', 'de_kiem_tra'];
  return wanted
    .filter((v) => v !== current)
    .slice(0, 3)
    .map((v) => ({ value: v, label: formatLabel(v) }));
}
