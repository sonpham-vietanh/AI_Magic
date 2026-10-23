// Nhận ra ý định của một câu gõ trong ô chat duy nhất: SOẠN (luồng từng bước), HỎI (hỏi đáp chuyên môn)
// hay CHỈNH (sửa bản đang mở bằng lời). Luật xác định theo từ khoá, không gọi AI; khi chưa chắc thì hỏi lại.
import { needsResourceChoice, needsStyle, formatLabel, styleLabel, bloomLabel, type AgentSlots, type AskStep } from './flow';
import { parseIntent, stripDiacritics, type Intent } from './intent';

const SUBJECT_NAMES: Record<string, string> = {
  toan: 'Toán',
  vat_ly: 'Vật lý',
  hoa_hoc: 'Hoá học',
  sinh_hoc: 'Sinh học',
  ngu_van: 'Ngữ văn',
  tieng_anh: 'Tiếng Anh',
  tin_hoc: 'Tin học',
};
const subjectLabel = (v: string) => SUBJECT_NAMES[v] ?? v;

export type ChatMode = 'soan' | 'hoi' | 'chinh' | 'khong_ro';

export interface ClassifyContext {
  /** Đang có bản soạn mở trong khung bên phải. */
  hasResult: boolean;
  /** Trợ lý đang chờ cô/thầy chọn bài (bước "bài dạy"). */
  waitingLesson?: boolean;
}

export interface Classified {
  mode: ChatMode;
  intent: Intent;
  /** Với mode 'khong_ro': câu trông giống yêu cầu chỉnh nhưng chưa có bản soạn nào. */
  refineWithoutResult?: boolean;
}

// Động từ chỉnh sửa. Chỉ có nghĩa khi đã có bản soạn đang mở.
const REFINE_RE =
  /\b(rut (gon|con|ngan|bot)|ngan (gon )?hon|ngan lai|gon lai|dai hon|chi tiet hon|them|bot di|bot|bo (bot|di|sung)|doi|thay|viet lai|soan lai doan|sua (lai)?|chinh (lai|sua)?|tang|giam|don gian hon|de hon|kho hon|nang cao hon|ha thap|cho lop (yeu|kem|gioi|kha|dong|it)|lam ro|lam gon|con \d{1,3} phut|\d{1,3} phut|bang \d{1,3} phut|bo di|them vao|xoa|giu nguyen)\b/;

// Cách nói "soạn bản mới" hoặc "đổi sang việc khác", không phải chỉnh bản đang mở.
const NEW_WORK_RE = /\b(bai khac|bai moi|bat dau lai|cuoc tro chuyen moi|lam lai tu dau|doi bai|doi lop|doi mon|doi khoi)\b/;

const Q_START_RE =
  /^\s*(lam sao|lam the nao|nhu the nao|tai sao|vi sao|la gi|co nen|nen\b|cach\b|huong dan|goi y|giai thich|khac nhau|bao nhieu|the nao|co the|co phai|cho (em|toi|minh|co|thay) hoi|hoi\b|quy dinh|quy che|tt ?22|thong tu|cong van|5512|nhan xet|hoat dong khoi dong|khoi dong|phan hoa|ket noi|lien mon|vi du|tai lieu|y nghia|dinh nghia|phan biet|so sanh)/;

const SMALLTALK_RE = /^\s*(xin chao|chao|hello|hi|alo|cam on|ok|oke|duoc roi|tam biet)\b[\s!.,]*(ban|em|minh|co|thay|nhe|nha|a)?[\s!.,]*$/;

/** Lời chào hay cảm ơn: trả lời tại chỗ, không tốn lượt AI. */
export function isSmallTalk(text: string): boolean {
  return SMALLTALK_RE.test(stripDiacritics(text).replace(/\s+/g, ' ').trim());
}
const Q_ANY_RE = /(\?|\b(la gi|tai sao|vi sao|nhu the nao|lam sao|lam the nao|co nen|khac nhau|bao nhieu)\b)/;
const Q_TOPIC_RE = /\b(tt ?22|thong tu 22|5512|cong van|quy che|nhan xet hoc ba|hoc ba|ket noi lien mon|phan hoa)\b/;

/** Phân loại câu gõ. Thứ tự: chỉnh bản đang mở, hỏi đáp, soạn; còn lại là chưa rõ. */
export function classifyMessage(text: string, ctx: ClassifyContext): Classified {
  const norm = stripDiacritics(text).replace(/\s+/g, ' ').trim();
  const intent = parseIntent(text);
  const createsProduct = Boolean(intent.format) && intent.verb;

  if (intent.command) return { mode: 'soan', intent };

  const looksRefine = REFINE_RE.test(norm) && !NEW_WORK_RE.test(norm) && !intent.format;
  if (looksRefine) {
    if (ctx.hasResult) return { mode: 'chinh', intent };
    // Chưa có bản soạn để chỉnh: để câu hỏi lại ngắn xử lý, nhưng ghi nhớ để giải thích đúng.
    if (!intent.format && !intent.verb && !Q_START_RE.test(norm)) return { mode: 'khong_ro', intent, refineWithoutResult: true };
  }

  if (ctx.waitingLesson && !Q_START_RE.test(norm) && !norm.endsWith('?')) return { mode: 'soan', intent };

  const startsWithQuestion = Q_START_RE.test(norm);
  if (startsWithQuestion && !createsProduct) return { mode: 'hoi', intent };
  if (createsProduct) return { mode: 'soan', intent };
  if (intent.verb && (intent.format || intent.lessonQuery)) return { mode: 'soan', intent };
  if (intent.format && !Q_ANY_RE.test(norm)) return { mode: 'soan', intent };
  if (Q_ANY_RE.test(norm) || Q_TOPIC_RE.test(norm)) return { mode: 'hoi', intent };
  return { mode: 'khong_ro', intent };
}

/** Mọi bước còn thiếu theo đúng thứ tự hỏi. */
export function missingSteps(s: AgentSlots): AskStep[] {
  const out: AskStep[] = [];
  if (!s.format) out.push('format');
  if (needsResourceChoice(s.format) && !s.dangTaiNguyen?.length) out.push('dangTaiNguyen');
  if (!s.baiDayId) out.push('bai');
  if (!s.bloom) out.push('bloom');
  if (needsStyle(s.format) && !s.phongCach) out.push('phongCach');
  return out;
}

export const STEP_NAMES: Record<AskStep, string> = {
  format: 'sản phẩm cần soạn',
  dangTaiNguyen: 'các dạng tài nguyên',
  bai: 'bài dạy',
  bloom: 'mức tư duy của lớp',
  phongCach: 'phong cách dạy',
};

export type ChipKey = 'format' | 'subject' | 'grade' | 'class' | 'bai' | 'soTiet' | 'phongCach' | 'bloom';

export interface UnderstoodChip {
  key: ChipKey;
  /** Bước sẽ được hỏi lại khi bấm "Sửa"; null nếu sửa bằng ô chọn môn/khối ở thanh trên. */
  step: AskStep | null;
  label: string;
  value: string;
}

export interface Understanding {
  understood: UnderstoodChip[];
  unclear: string[];
}

/**
 * Tóm tắt "Mình hiểu: ... / Chưa rõ: ..." sau khi đã điền ô từ câu gõ.
 * Chỉ liệt kê những gì CÂU GÕ này nói (hoặc tìm được), không liệt kê lựa chọn cũ.
 */
export function buildUnderstanding(intent: Intent, slots: AgentSlots, extra: { lessonFound?: boolean } = {}): Understanding {
  const understood: UnderstoodChip[] = [];
  if (intent.format && slots.format) understood.push({ key: 'format', step: 'format', label: 'Sản phẩm', value: formatLabel(slots.format) });
  if (intent.subject) understood.push({ key: 'subject', step: null, label: 'Môn', value: subjectLabel(slots.subject) });
  if (intent.className) understood.push({ key: 'class', step: null, label: 'Lớp', value: intent.className });
  else if (intent.grade) understood.push({ key: 'grade', step: null, label: 'Khối', value: `Lớp ${slots.grade}` });
  if (extra.lessonFound && slots.baiTitle) understood.push({ key: 'bai', step: 'bai', label: 'Bài', value: slots.baiTitle });
  if (intent.soTiet) understood.push({ key: 'soTiet', step: null, label: 'Số tiết', value: `${intent.soTiet} tiết` });
  if (intent.phongCach && slots.phongCach) understood.push({ key: 'phongCach', step: 'phongCach', label: 'Phong cách', value: styleLabel(slots.phongCach) });
  if (intent.bloom && slots.bloom) understood.push({ key: 'bloom', step: 'bloom', label: 'Mức tư duy', value: bloomLabel(slots.bloom) });
  const unclear = missingSteps(slots).map((s) => STEP_NAMES[s]);
  return { understood, unclear };
}

/** Câu gợi ý nhanh ở màn chào: lấy từ các câu hỏi sẵn của hộp Hỏi đáp chuyên môn trước đây. */
export const QUICK_QUESTIONS: { icon: 'sparkles' | 'users' | 'clipboard' | 'book' | 'graph'; title: string; question: string }[] = [
  { icon: 'sparkles', title: 'Hoạt động khởi động', question: 'Gợi ý hoạt động khởi động 5 phút đầu giờ' },
  { icon: 'users', title: 'Phân hoá bài tập', question: 'Cách giao bài phân hóa cho nhóm Cơ bản và Nâng cao' },
  { icon: 'clipboard', title: 'Nhận xét học bạ TT22', question: 'Cách viết nhận xét học bạ cuối kỳ theo Thông tư 22' },
  { icon: 'book', title: 'Giải thích khái niệm', question: 'Giải thích khái niệm khó cho học sinh bằng ví dụ gần gũi' },
  { icon: 'graph', title: 'Kết nối liên môn', question: 'Kết nối bài học này với môn học khác' },
];

/** Gợi ý chỉnh nhanh hiện dưới bản soạn. */
export const REFINE_SUGGESTIONS = [
  'Rút còn 35 phút',
  'Thêm hoạt động nhóm',
  'Đổi ví dụ cho lớp yếu',
  'Viết lại ngắn hơn',
];
