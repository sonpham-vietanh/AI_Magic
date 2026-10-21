/** Rubric 6 tiêu chí, thang 1-5. */
export const RUBRIC_6 = [
  { id: 'dung_chuan_gdpt2018', name: 'Đúng chuẩn GDPT 2018', description: 'Mục tiêu, yêu cầu cần đạt và phẩm chất/năng lực bám Chương trình GDPT 2018.' },
  { id: 'dung_cau_truc_khbd', name: 'Đúng cấu trúc KHBD (CV 5512)', description: 'Đủ các phần và các hoạt động theo Công văn 5512, mỗi hoạt động đủ mục tiêu - nội dung - sản phẩm - tổ chức.' },
  { id: 'khong_sai_kien_thuc', name: 'Không sai kiến thức', description: 'Kiến thức, công thức, số liệu, ví dụ chính xác, không bịa.' },
  { id: 'phu_hop_lua_tuoi', name: 'Phù hợp lứa tuổi', description: 'Ngôn ngữ, độ khó, ngữ cảnh và thời lượng phù hợp học sinh của khối lớp.' },
  { id: 'dung_giong_viet_anh', name: 'Đúng giọng Việt Anh', description: 'Vui vẻ, thực dụng, gần gũi, đúng triết lý và văn phong Việt Anh.' },
  { id: 'dung_duoc_ngay', name: 'Dùng được ngay', description: 'Giáo viên có thể mang lên lớp mà gần như không phải sửa.' },
] as const;

export type RubricId = (typeof RUBRIC_6)[number]['id'];
export type RubricScores = Record<string, number>;

export const RUBRIC_IDS: string[] = RUBRIC_6.map((c) => c.id);

/** Điểm trung bình các tiêu chí rubric có mặt (bỏ qua khóa lạ / giá trị không hợp lệ). 0 nếu không có điểm. */
export function averageScore(scores: RubricScores): number {
  const vals = RUBRIC_IDS.map((id) => scores[id]).filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
