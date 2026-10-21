import type { ClassProfile, GradeLevel, SubjectCode } from '../types';

/**
 * Chọn lớp mặc định theo khối.
 * Ưu tiên: preferredId (hợp lệ và cùng khối) -> lớp đầu tiên của khối -> lớp đầu tiên.
 * `subject` dành cho mở rộng sau này (hiện chưa dùng để lọc).
 */
export function pickDefaultClass(
  classes: readonly ClassProfile[],
  grade: GradeLevel | string,
  _subject?: SubjectCode | string,
  preferredId?: string | null,
): ClassProfile | undefined {
  if (!classes || classes.length === 0) return undefined;
  if (preferredId) {
    const preferred = classes.find((c) => c.id === preferredId);
    if (preferred && preferred.grade === grade) return preferred;
  }
  return classes.find((c) => c.grade === grade) ?? classes[0];
}
