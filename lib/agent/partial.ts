// Giữ lại phần AI đã soạn khi bị ngắt giữa chừng (mất mạng, lỗi AI): dựng một bản nháp đủ để mở lại và chỉnh tiếp.
import type { AgentSlots } from './flow';
import type { AgentResult } from './result';
import type { WorkflowId } from '../workflows/types';
import { textToSections } from '../ui/soanBai';

export function workflowForFormat(format?: string): WorkflowId {
  switch (format) {
    case 'slide':
      return 'slide';
    case 'worksheet':
      return 'worksheet';
    case 'quiz':
      return 'quiz';
    case 'de_kiem_tra':
      return 'de_kiem_tra';
    case 'bo_tiet_day':
      return 'bo_tiet_day';
    case 'infographic':
    case 'mindmap':
    case 'podcast':
    case 'tranh_luan':
    case 'video':
    case 'tai_nguyen_6_dang':
      return 'tai_nguyen_6_dang';
    default:
      return 'khbd';
  }
}

/** Đủ dài để đáng giữ lại (ngắn hơn thì chỉ là vài chữ đầu). */
export const PARTIAL_MIN_CHARS = 300;

export function canKeepPartial(text: string): boolean {
  return text.trim().length >= PARTIAL_MIN_CHARS;
}

export function buildPartialResult(slots: AgentSlots, text: string, runId: string): AgentResult {
  const clean = text.trim();
  return {
    runId,
    workflow: workflowForFormat(slots.format),
    bloomLevels: [],
    standard: { status: 'khong_co', atomId: slots.baiDayId ?? '', title: slots.baiTitle },
    warnings: ['Bản soạn dở dang: AI bị ngắt giữa chừng, phần dưới đây là phần đã viết được.'],
    content: { sections: textToSections(clean), markdown: clean },
    reflection: { scores: [], average: 0, issues: [], skipped: true },
    requiresApproval: false,
    draft: true,
    draftReasons: ['Bản soạn dở dang vì AI bị ngắt giữa chừng.'],
    artifacts: [],
    structure: [],
  } as AgentResult;
}
