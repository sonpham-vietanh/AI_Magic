import { RESOURCE_KINDS, type ResourceKind } from '@/lib/resources/types';
import type { FormatId, WorkflowId } from './types';

const TABLE: Record<FormatId, WorkflowId> = {
  ke_hoach: 'khbd',
  slide: 'slide',
  worksheet: 'worksheet',
  quiz: 'quiz',
  de_kiem_tra: 'de_kiem_tra',
  infographic: 'tai_nguyen_6_dang',
  mindmap: 'tai_nguyen_6_dang',
  podcast: 'tai_nguyen_6_dang',
  tranh_luan: 'tai_nguyen_6_dang',
  video: 'tai_nguyen_6_dang',
  tai_nguyen_6_dang: 'tai_nguyen_6_dang',
};

/** Router xác định (bảng tra cứu cố định, không LLM, không Planner). */
export function routeWorkflow(format: FormatId): WorkflowId {
  const w = TABLE[format];
  if (!w) throw new Error(`formatDauRa không hợp lệ: ${String(format)}`);
  return w;
}

/** Dạng tài nguyên cần sinh cho workflow thứ 6: tham số tường minh, nếu không thì theo formatDauRa. */
export function resourceKindsFor(format: FormatId, explicit?: ResourceKind[]): ResourceKind[] {
  if (explicit && explicit.length) return [...new Set(explicit)];
  if (format === 'infographic' || format === 'mindmap' || format === 'podcast' || format === 'tranh_luan' || format === 'video') {
    return [format];
  }
  return [...RESOURCE_KINDS];
}
