import type { AgentSlots, AskStep, FormatValue } from '@/lib/agent/flow';
import type { WorkflowResult } from '@/lib/workflows/types';

export type Msg =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'agent'; kind: 'text'; text: string }
  | { id: string; role: 'agent'; kind: 'ask'; step: AskStep }
  | { id: string; role: 'agent'; kind: 'confirm' }
  | { id: string; role: 'agent'; kind: 'run'; runKey: string }
  | { id: string; role: 'agent'; kind: 'links'; links: { href: string; label: string; desc: string }[] }
  | { id: string; role: 'agent'; kind: 'followups'; resultId: string };

export interface RunState {
  status: 'running' | 'done' | 'error';
  startedAt: number;
  resultId?: string;
  error?: string;
  details?: string[];
  hasNews: boolean;
}

export interface ResultEntry {
  id: string;
  title: string;
  at: string;
  slots: AgentSlots;
  result: WorkflowResult;
  /** Văn bản đang hiển thị/chỉnh sửa (ban đầu là bản AI soạn). */
  text: string;
  accepted?: boolean;
  diffRatio?: number;
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
    case 'audio':
      return 'podcast';
    case 'video':
      return 'video';
    default:
      return 'layers';
  }
}
