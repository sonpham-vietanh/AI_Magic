import type { FormatId, WorkflowId } from './types';

const TABLE: Record<FormatId, WorkflowId> = {
  ke_hoach: 'khbd',
  slide: 'slide',
  worksheet: 'worksheet',
  quiz: 'quiz',
  de_kiem_tra: 'de_kiem_tra',
  audio: 'tai_nguyen_6_dang',
  video: 'tai_nguyen_6_dang',
  tai_nguyen_6_dang: 'tai_nguyen_6_dang',
};

/** Router xác định (bảng tra cứu cố định, không LLM, không Planner). */
export function routeWorkflow(format: FormatId): WorkflowId {
  const w = TABLE[format];
  if (!w) throw new Error(`formatDauRa không hợp lệ: ${String(format)}`);
  return w;
}
