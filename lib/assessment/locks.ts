import type { OrgData } from './types';

export const DEDUP_YEARS = 3;

export function dedupCutoff(at: Date): string {
  const d = new Date(at.getTime());
  d.setUTCFullYear(d.getUTCFullYear() - DEDUP_YEARS);
  return d.toISOString();
}

/** Ngày theo giờ Việt Nam (UTC+7), dạng YYYY-MM-DD, tại thời điểm `at`. */
export function ymdVN(at: Date): string {
  return new Date(at.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Câu đã dùng trong đề được duyệt (3 năm) hoặc đang nằm trong đề chờ duyệt: không được rút lại. */
export function usedRecently(org: OrgData, at: Date): Set<string> {
  const cutoff = dedupCutoff(at);
  const s = new Set<string>();
  for (const u of org.usage) if (u.usedAt > cutoff) s.add(u.questionId);
  for (const e of org.exams) if (e.status === 'cho_duyet') e.questionIds.forEach((id) => s.add(id));
  return s;
}

/**
 * Câu KHÔNG được lộ đáp án/lời giải và không được đưa vào quiz: câu đang bị khoá chống trùng, cộng các câu thuộc
 * đề (nháp, chờ duyệt, đã duyệt) mà ngày thi chưa tới (hoặc chưa đặt ngày thi), tức đề chưa công bố.
 */
export function lockedQuestionIds(org: OrgData, at: Date): Set<string> {
  const s = usedRecently(org, at);
  const today = ymdVN(at);
  for (const e of org.exams) {
    if (e.status === 'tu_choi') continue;
    const published = !!e.examDate && today >= e.examDate;
    if (!published) e.questionIds.forEach((id) => s.add(id));
  }
  return s;
}
