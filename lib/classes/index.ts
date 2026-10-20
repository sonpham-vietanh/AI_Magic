import type { ClassProfile, GradeLevel, SchoolLevel } from '../types';
import { CLASS_PROFILES } from './profiles';

export { CLASS_PROFILES };

export const CAMPUS_LIST = ['Cơ sở AHT (Gò Vấp)', 'Cơ sở BT (Bình Tân)'] as const;

export const getClassById = (idOrName?: string): ClassProfile | undefined => {
  if (!idOrName) return undefined;
  const normalized = idOrName.trim().toLowerCase();
  return CLASS_PROFILES.find(
    (c) => c.id.toLowerCase() === normalized || c.className.toLowerCase() === normalized,
  );
};

export const getClassesByFilter = (options?: {
  grade?: GradeLevel | 'all';
  campus?: string | 'all';
  schoolLevel?: SchoolLevel | 'all';
}): ClassProfile[] =>
  CLASS_PROFILES.filter((c) => {
    if (options?.grade && options.grade !== 'all' && c.grade !== options.grade) return false;
    if (options?.campus && options.campus !== 'all' && c.campus !== options.campus) return false;
    if (
      options?.schoolLevel &&
      options.schoolLevel !== 'all' &&
      c.schoolLevel !== options.schoolLevel
    ) {
      return false;
    }
    return true;
  });

export const buildClassPedagogicalContext = (profile: ClassProfile): string => {
  const groupLines = profile.groups
    .map(
      (g) =>
        `- ${g.label}: ${g.count}/${profile.studentCount} HS (${g.percentage}%). Đặc điểm: ${g.characteristics.join('; ')}. Chiến lược đề xuất: ${g.recommendedStrategies.join('; ')}.`,
    )
    .join('\n');

  const supportLines = profile.specialSupportStudents
    .map(
      (s) =>
        `- Mã HS ${s.studentCode} (Phong cách học: ${s.learningStyle}): Điểm mạnh: ${s.strengths} | Cần hỗ trợ: ${s.supportNeeded} -> Điều chỉnh sư phạm: ${s.pedagogicalAccommodation}`,
    )
    .join('\n');

  return [
    `HỒ SƠ ĐẶC ĐIỂM LỚP HỌC (CLASS DNA - TRƯỜNG VIỆT ANH):`,
    `- Lớp: ${profile.className} (Khối ${profile.grade}) · ${profile.campus}`,
    `- Sĩ số: ${profile.studentCount} học sinh · GVCN: ${profile.homeroomTeacher.name}`,
    `- Năng lực Tiếng Anh: ${profile.englishProficiencyLevel}`,
    `- Thời lượng tập trung tối ưu mỗi chặng: ~${profile.attentionSpanMinutes} phút`,
    `- Sở thích chủ đạo của tập thể lớp: ${profile.dominantInterests.join(', ')}`,
    `- Tổng quan tâm lý & nhịp độ lớp: ${profile.classDynamicSummary}`,
    `PHÂN HÓA 3 NHÓM TRÌNH ĐỘ TRONG LỚP:`,
    groupLines,
    `LƯU Ý HỖ TRỢ CÁ NHÂN HÓA (CHỈ DÙNG MÃ ĐỊNH DANH BẢO MẬT):`,
    supportLines,
  ].join('\n');
};
