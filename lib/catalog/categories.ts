import type { GradeLevel, SchoolLevel, SubjectCode, ToolCategoryCode } from '../types';

export interface CategoryMeta {
  code: ToolCategoryCode;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  badgeColor: 'accent' | 'yes' | 'warn' | 'cta';
  toolCount: number;
}

export const TOOL_CATEGORIES: CategoryMeta[] = [
  {
    code: 'ke_hoach_bai_day',
    name: 'Giáo án & Kế hoạch bài dạy',
    shortName: 'Giáo án',
    description: 'Soạn giáo án Công văn 5512, bài giảng 5E, hoạt động khởi động và kịch bản bài dạy.',
    icon: '',
    badgeColor: 'accent',
    toolCount: 10,
  },
  {
    code: 'kiem_tra_danh_gia',
    name: 'Đề kiểm tra & Thang điểm',
    shortName: 'Đề kiểm tra',
    description: 'Lập ma trận đề Thông tư 22/27, đề trắc nghiệm, tự luận và bảng tiêu chí chấm điểm.',
    icon: '',
    badgeColor: 'yes',
    toolCount: 10,
  },
  {
    code: 'phieu_hoc_tap_hoat_dong',
    name: 'Phiếu học tập & Hoạt động lớp',
    shortName: 'Phiếu học tập',
    description: 'Tạo phiếu bài tập, trạm học tập, trò chơi đầu giờ và hoạt động thực hành.',
    icon: '',
    badgeColor: 'cta',
    toolCount: 10,
  },
  {
    code: 'phan_hoa_ho_tro',
    name: 'Phân hóa bài tập theo nhóm học sinh',
    shortName: 'Phân hóa học sinh',
    description: 'Chia bài tập theo 3 mức (Cơ bản, Chuẩn, Nâng cao) và gợi ý kèm cặp học sinh cần hỗ trợ.',
    icon: '',
    badgeColor: 'yes',
    toolCount: 10,
  },
  {
    code: 'tich_hop_lien_mon',
    name: 'Bài học Liên môn & Dự án STEAM',
    shortName: 'Liên môn & STEAM',
    description: 'Kết nối nội dung các môn học trong cùng tuần và thiết kế dự án học tập thực tế.',
    icon: '',
    badgeColor: 'accent',
    toolCount: 11,
  },
  {
    code: 'chuyen_doi_hoc_lieu',
    name: 'Tóm tắt & Chuyển đổi tài liệu',
    shortName: 'Chuyển đổi tài liệu',
    description: 'Tóm tắt văn bản, tạo câu hỏi từ bài đọc, làm dàn ý slide và bảng từ vựng song ngữ.',
    icon: '',
    badgeColor: 'warn',
    toolCount: 11,
  },
  {
    code: 'giao_tiep_quan_ly_lop',
    name: 'Nhận xét học bạ & Công tác chủ nhiệm',
    shortName: 'Chủ nhiệm & Học bạ',
    description: 'Viết nhận xét học bạ cuối kỳ, tin nhắn trao đổi với phụ huynh và sinh hoạt lớp.',
    icon: '',
    badgeColor: 'yes',
    toolCount: 10,
  },
  {
    code: 'tro_ly_su_pham',
    name: 'Gợi ý phương pháp & Rà soát bài dạy',
    shortName: 'Góp ý chuyên môn',
    description: 'Rà soát lại giáo án, dự đoán các lỗi học sinh hay mắc và gợi ý câu hỏi gợi mở.',
    icon: '',
    badgeColor: 'accent',
    toolCount: 10,
  },
];

export interface SubjectMeta {
  code: SubjectCode;
  name: string;
  shortName: string;
  schoolLevels: SchoolLevel[];
}

export const SUBJECTS: SubjectMeta[] = [
  { code: 'toan', name: 'Toán', shortName: 'Toán', schoolLevels: ['tieu_hoc', 'thcs', 'thpt'] },
  { code: 'ngu_van', name: 'Ngữ văn / Tiếng Việt', shortName: 'Ngữ văn', schoolLevels: ['tieu_hoc', 'thcs', 'thpt'] },
  { code: 'tieng_anh', name: 'Tiếng Anh', shortName: 'Tiếng Anh', schoolLevels: ['tieu_hoc', 'thcs', 'thpt'] },
  { code: 'khtn', name: 'Khoa học tự nhiên', shortName: 'KHTN', schoolLevels: ['tieu_hoc', 'thcs'] },
  { code: 'vat_ly', name: 'Vật lý', shortName: 'Vật lý', schoolLevels: ['thcs', 'thpt'] },
  { code: 'hoa_hoc', name: 'Hóa học', shortName: 'Hóa học', schoolLevels: ['thcs', 'thpt'] },
  { code: 'sinh_hoc', name: 'Sinh học', shortName: 'Sinh học', schoolLevels: ['thcs', 'thpt'] },
  { code: 'lich_su_dia_ly', name: 'Lịch sử & Địa lý', shortName: 'Sử - Địa', schoolLevels: ['tieu_hoc', 'thcs'] },
  { code: 'lich_su', name: 'Lịch sử', shortName: 'Lịch sử', schoolLevels: ['thcs', 'thpt'] },
  { code: 'dia_ly', name: 'Địa lý', shortName: 'Địa lý', schoolLevels: ['thcs', 'thpt'] },
  { code: 'gdcd_gdktpl', name: 'GDCD / Kinh tế & Pháp luật', shortName: 'GDCD', schoolLevels: ['tieu_hoc', 'thcs', 'thpt'] },
  { code: 'tin_hoc', name: 'Tin học', shortName: 'Tin học', schoolLevels: ['tieu_hoc', 'thcs', 'thpt'] },
  { code: 'cong_nghe', name: 'Công nghệ', shortName: 'Công nghệ', schoolLevels: ['tieu_hoc', 'thcs', 'thpt'] },
  { code: 'nghe_thuat', name: 'Nghệ thuật (Âm nhạc / Mỹ thuật)', shortName: 'Nghệ thuật', schoolLevels: ['tieu_hoc', 'thcs', 'thpt'] },
  { code: 'hd_trai_nghiem', name: 'Hoạt động trải nghiệm', shortName: 'HĐ Trải nghiệm', schoolLevels: ['tieu_hoc', 'thcs', 'thpt'] },
  { code: 'lien_mon', name: 'Chủ đề Liên môn / STEAM', shortName: 'Liên môn', schoolLevels: ['tieu_hoc', 'thcs', 'thpt'] },
];

export interface GradeMeta {
  grade: GradeLevel;
  label: string;
  schoolLevel: SchoolLevel;
  schoolLevelName: string;
}

export const GRADES: GradeMeta[] = [
  { grade: '1', label: 'Khối 1', schoolLevel: 'tieu_hoc', schoolLevelName: 'Tiểu học' },
  { grade: '2', label: 'Khối 2', schoolLevel: 'tieu_hoc', schoolLevelName: 'Tiểu học' },
  { grade: '3', label: 'Khối 3', schoolLevel: 'tieu_hoc', schoolLevelName: 'Tiểu học' },
  { grade: '4', label: 'Khối 4', schoolLevel: 'tieu_hoc', schoolLevelName: 'Tiểu học' },
  { grade: '5', label: 'Khối 5', schoolLevel: 'tieu_hoc', schoolLevelName: 'Tiểu học' },
  { grade: '6', label: 'Khối 6', schoolLevel: 'thcs', schoolLevelName: 'THCS' },
  { grade: '7', label: 'Khối 7', schoolLevel: 'thcs', schoolLevelName: 'THCS' },
  { grade: '8', label: 'Khối 8', schoolLevel: 'thcs', schoolLevelName: 'THCS' },
  { grade: '9', label: 'Khối 9', schoolLevel: 'thcs', schoolLevelName: 'THCS' },
  { grade: '10', label: 'Khối 10', schoolLevel: 'thpt', schoolLevelName: 'THPT' },
  { grade: '11', label: 'Khối 11', schoolLevel: 'thpt', schoolLevelName: 'THPT' },
  { grade: '12', label: 'Khối 12', schoolLevel: 'thpt', schoolLevelName: 'THPT' },
];

export const getCategoryMeta = (code: ToolCategoryCode): CategoryMeta =>
  TOOL_CATEGORIES.find((c) => c.code === code) ?? TOOL_CATEGORIES[0];

export const getSubjectMeta = (code: SubjectCode): SubjectMeta =>
  SUBJECTS.find((s) => s.code === code) ?? SUBJECTS[0];

export const getGradeMeta = (grade: GradeLevel): GradeMeta =>
  GRADES.find((g) => g.grade === grade) ?? GRADES[6];
