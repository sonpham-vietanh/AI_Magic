import type { AgentSlots, AskStep, FormatValue } from '@/lib/agent/flow';
import type { AgentResult } from '@/lib/agent/result';
import type { FoundLesson } from '@/lib/agent/lessonSearch';
import type { PendingRun } from '@/lib/agent/memory';
import type { UnderstoodChip } from '@/lib/agent/nlu';

export type Msg =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'agent'; kind: 'text'; text: string }
  | { id: string; role: 'agent'; kind: 'ask'; step: AskStep }
  | { id: string; role: 'agent'; kind: 'confirm' }
  | { id: string; role: 'agent'; kind: 'run'; runKey: string }
  | { id: string; role: 'agent'; kind: 'links'; links: { href: string; label: string; desc: string }[] }
  | { id: string; role: 'agent'; kind: 'followups'; resultId: string }
  /** "Mình hiểu: ... / Chưa rõ: ..." sau khi đọc một câu gõ tự nhiên. */
  | { id: string; role: 'agent'; kind: 'understood'; chips: UnderstoodChip[]; unclear: string[] }
  /** Chưa chắc là soạn hay hỏi: 2-3 nút để cô/thầy chọn. */
  | { id: string; role: 'agent'; kind: 'mode'; text: string; note?: string }
  /** Câu trả lời hỏi đáp chuyên môn (có trạng thái đang trả lời, lỗi, thử lại). */
  | { id: string; role: 'agent'; kind: 'answer'; answerKey: string }
  /** Một lần chỉnh bằng lời. */
  | { id: string; role: 'agent'; kind: 'refine'; refineKey: string }
  /** Bài khớp hơn nằm ở khối hoặc môn khác. */
  | { id: string; role: 'agent'; kind: 'cross'; lessons: FoundLesson[]; query: string }
  /** Chọn lớp khác để soạn lại. */
  | { id: string; role: 'agent'; kind: 'classpick'; slots: AgentSlots }
  /** Lần soạn trước bị ngắt (tải lại trang, mất mạng). */
  | { id: string; role: 'agent'; kind: 'resume'; pending: PendingRun };

export interface AnswerState {
  status: 'loading' | 'done' | 'error';
  question: string;
  text?: string;
  suggestions?: string[];
  error?: string;
}

export interface RefineState {
  status: 'working' | 'done' | 'error';
  instruction: string;
  entryId: string;
  error?: string;
  /** Lỗi do AI chưa đăng nhập hay hết lượt: nút Thử lại vẫn hiện nhưng lời giải thích khác. */
  retryable: boolean;
}

export interface RunState {
  status: 'running' | 'done' | 'error';
  startedAt: number;
  resultId?: string;
  error?: string;
  details?: string[];
  hasNews: boolean;
  currentStage?: 'kho' | 'guardrail' | 'route' | 'generate' | 'reflect';
  stageMessage?: string;
  streamPreview?: string;
  /** Toàn bộ chữ AI đã soạn tới lúc này (hiện dần vào khung bản soạn). */
  streamText?: string;
  /** Lựa chọn của lần chạy này: nút Thử lại dùng đúng bộ lựa chọn này, không phụ thuộc ô hiện tại. */
  slots?: AgentSlots;
  /** Có phần soạn dở được giữ lại khi lỗi giữa chừng. */
  partialId?: string;
  /** Tiêu đề bản đang soạn, hiện trên khung bản soạn trực tiếp. */
  title?: string;
  /** Các phần đã xong của Bộ tiết dạy / trọn bộ (khi máy chủ báo từng phần). */
  doneParts?: string[];
}

export interface ResultEntry {
  id: string;
  title: string;
  at: string;
  slots: AgentSlots;
  result: AgentResult;
  /** Văn bản đang hiển thị/chỉnh sửa (ban đầu là bản AI soạn). */
  text: string;
  accepted?: boolean;
  diffRatio?: number;
  /** Phiên bản đã lưu vào Lịch sử của tôi sau khi duyệt. */
  version?: { id: string; number: number };
  versionFailed?: boolean;
  /** Bản mở lại từ một phiên bản đã lưu (không có dữ liệu tự soi/kiểm tra gốc). */
  fromVersion?: number;
  /** Các bản văn trước mỗi lần chỉnh bằng lời, để Hoàn tác. */
  undo?: string[];
  /** Yêu cầu chỉnh gần nhất, hiện trên thanh Hoàn tác. */
  lastRefine?: string;
  /** Bản lưu tự động vào Lịch sử ngay khi AI trả xong. */
  draftVersion?: { id: string; number: number };
}

export interface AtomLite {
  id: string;
  code: string;
  title: string;
  hasFactoryPackage?: boolean;
  factoryAssetCount?: number;
}

export const WORKFLOW_LABELS: Record<string, string> = {
  khbd: 'Soạn kế hoạch bài dạy (CV 5512)',
  slide: 'Soạn slide bài giảng',
  worksheet: 'Soạn phiếu học tập',
  quiz: 'Sinh quiz củng cố trong tiết',
  de_kiem_tra: 'Soạn đề kiểm tra và ma trận',
  tai_nguyen_6_dang: 'Sinh tài nguyên đa dạng',
  bo_tiet_day: 'Soạn bộ tiết dạy (giáo án, slide, phiếu, quiz)',
};

export const SUBJECT_OPTIONS: { value: string; label: string }[] = [
  { value: 'toan', label: 'Toán' },
  { value: 'vat_ly', label: 'Vật lý' },
  { value: 'hoa_hoc', label: 'Hoá học' },
  { value: 'sinh_hoc', label: 'Sinh học' },
  { value: 'ngu_van', label: 'Ngữ văn' },
  { value: 'tieng_anh', label: 'Tiếng Anh' },
  { value: 'tin_hoc', label: 'Tin học' },
];

export const GRADE_OPTIONS = ['6', '7', '8', '9', '10', '11', '12'];

export function subjectLabel(v: string): string {
  return SUBJECT_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function formatIcon(v: FormatValue): 'book' | 'slides' | 'file' | 'quiz' | 'exam' | 'podcast' | 'video' | 'layers' {
  switch (v) {
    case 'ke_hoach':
      return 'book';
    case 'slide':
      return 'slides';
    case 'worksheet':
      return 'file';
    case 'quiz':
      return 'quiz';
    case 'de_kiem_tra':
      return 'exam';
    case 'podcast':
    case 'tranh_luan':
      return 'podcast';
    case 'infographic':
    case 'mindmap':
      return 'layers';
    case 'video':
      return 'video';
    default:
      return 'layers';
  }
}
