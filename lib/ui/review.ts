import { RUBRIC_6 } from '@/lib/eval/rubric';

/** Khớp đúng quy tắc trong lib/kho/index.ts (APPROVE_MIN_AVERAGE, APPROVE_MIN_CRITERION). */
export const MIN_AVERAGE = 4.0;
export const MIN_CRITERION = 3;

export interface Criterion {
  id: string;
  name: string;
}

export interface ReviewEvaluation {
  /** Trung bình các tiêu chí đã chấm, làm tròn 2 chữ số (0 nếu chưa chấm). */
  average: number;
  filledCount: number;
  total: number;
  /** Đã chấm đủ mọi tiêu chí. */
  complete: boolean;
  /** Tên các tiêu chí chưa chấm. */
  missing: string[];
  /** Tên các tiêu chí đang dưới ngưỡng. */
  low: string[];
  /** Đủ điều kiện duyệt vào Kho. */
  canApprove: boolean;
  /** Lý do chưa duyệt được (rỗng nếu đủ điều kiện). */
  reasons: string[];
}

const validScore = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;

export function formatScore(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

export function evaluateReview(
  scores: Record<string, number | undefined>,
  criteria: readonly Criterion[] = RUBRIC_6,
): ReviewEvaluation {
  const filled = criteria.filter((c) => validScore(scores[c.id]));
  const values = filled.map((c) => scores[c.id] as number);
  const average = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : 0;
  const missing = criteria.filter((c) => !validScore(scores[c.id])).map((c) => c.name);
  const low = filled.filter((c) => (scores[c.id] as number) < MIN_CRITERION).map((c) => c.name);
  const complete = missing.length === 0;
  const reasons: string[] = [];
  if (!complete) reasons.push(`Còn ${missing.length} tiêu chí chưa chấm.`);
  for (const n of low) reasons.push(`Tiêu chí "${n}" đang dưới ${MIN_CRITERION} điểm.`);
  if (complete && average < MIN_AVERAGE) {
    reasons.push(`Cần trung bình từ ${formatScore(MIN_AVERAGE).replace(',00', ',0')} trở lên (hiện ${formatScore(average)}).`);
  }
  return {
    average,
    filledCount: filled.length,
    total: criteria.length,
    complete,
    missing,
    low,
    canApprove: complete && low.length === 0 && average >= MIN_AVERAGE,
    reasons,
  };
}

/** Một dòng thông báo ngắn gọn cho người duyệt. */
export function approveHint(ev: ReviewEvaluation): string {
  if (ev.canApprove) return 'Đủ điều kiện duyệt vào Kho.';
  return ev.reasons.join(' ');
}
