// Shared TypeScript contracts for Công cụ Sinh Tài nguyên Dạy học Trường Việt Anh

export type GradeLevel =
  | '1' | '2' | '3' | '4' | '5'
  | '6' | '7' | '8' | '9'
  | '10' | '11' | '12';

export type SchoolLevel = 'tieu_hoc' | 'thcs' | 'thpt';

export type SubjectCode =
  | 'toan'
  | 'ngu_van'
  | 'tieng_anh'
  | 'khtn'
  | 'vat_ly'
  | 'hoa_hoc'
  | 'sinh_hoc'
  | 'lich_su_dia_ly'
  | 'lich_su'
  | 'dia_ly'
  | 'gdcd_gdktpl'
  | 'tin_hoc'
  | 'cong_nghe'
  | 'nghe_thuat'
  | 'hd_trai_nghiem'
  | 'lien_mon';

export type ToolCategoryCode =
  | 'ke_hoach_bai_day'       // Kế hoạch bài dạy (Công văn 5512) & Thiết kế bài giảng
  | 'kiem_tra_danh_gia'      // Đề kiểm tra, Ma trận đặc tả & Rubrics (Thông tư 22/27)
  | 'phieu_hoc_tap_hoat_dong'// Phiếu học tập, Trò chơi & Hoạt động lớp ("Vui vẻ & Thực dụng")
  | 'phan_hoa_ho_tro'        // Phân hóa học sinh theo lớp & Hỗ trợ cá nhân hóa
  | 'tich_hop_lien_mon'      // Liên kết liên môn, STEAM & Học tập dự án (PBL)
  | 'chuyen_doi_hoc_lieu'    // Chuyển đổi, Tóm tắt, Phân bậc văn bản & Đa phương tiện
  | 'giao_tiep_quan_ly_lop'  // Giao tiếp Phụ huynh, Nhận xét học bạ & Quản lý lớp
  | 'tro_ly_su_pham';        // Công cụ Tư duy, Phản biện & Trợ lý Sư phạm chuyên sâu

export interface ToolInputField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'number' | 'checkbox';
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string | number | boolean;
}

export interface PedagogicalTool {
  id: string;
  slug: string;
  name: string;
  magicSchoolEquivalent: string; // Đối chiếu công cụ tương đương trên MagicSchool AI
  category: ToolCategoryCode;
  shortDescription: string;
  vietAnhValueAdd: string; // Điểm nâng cấp riêng cho chuẩn Bộ GD & Trường Việt Anh
  supportedSubjects: SubjectCode[] | 'all';
  supportedGrades: GradeLevel[] | 'all';
  estimatedMinutesSaved: number;
  moetStandardRef: string; // VD: "Công văn 5512/BGDĐT-GDTrH", "Thông tư 22/2021/TT-BGDĐT"
  supportsClassContext: boolean;
  supportsCrossSubjectGraph: boolean;
  inputFields: ToolInputField[];
  outputSections: string[];
  systemPromptTemplate: string;
  sampleInput: Record<string, string>;
  featured?: boolean;
  /** Nguồn dữ liệu thực mà công cụ nhận (xem docs/TOOL_AUDIT.md) */
  dataSource?: 'supabase_rich' | 'class_profile' | 'prompt_only';
  maturity?: 'ready' | 'experimental';
  maturityNote?: string;
}

export interface StudentGroupProfile {
  tier: 'co_ban' | 'chuan' | 'nang_cao';
  label: string;
  count: number;
  percentage: number;
  characteristics: string[];
  recommendedStrategies: string[];
  sampleStudentCodes: string[]; // Chỉ lưu mã học sinh VA-YYYY-NNNNN theo chuẩn bảo mật Major OS
}

export interface SpecialSupportNote {
  studentCode: string; // VD: VA-2026-00417
  learningStyle: 'thi_giac' | 'thinh_giac' | 'van_dong' | 'doc_viet';
  strengths: string;
  supportNeeded: string;
  pedagogicalAccommodation: string;
}

export interface ClassProfile {
  id: string;
  className: string; // VD: "7A1", "10A2"
  grade: GradeLevel;
  schoolLevel: SchoolLevel;
  campus: 'Cơ sở AHT (Gò Vấp)' | 'Cơ sở BT (Bình Tân)';
  homeroomTeacher: {
    name: string;
    email: string;
  };
  studentCount: number;
  englishProficiencyLevel: string; // Chuẩn IELTS/CEFR tại Việt Anh
  classDynamicSummary: string;
  dominantInterests: string[]; // VD: ["Bóng đá", "Robotics", "Truyện tranh", "Thí nghiệm thực hành"]
  attentionSpanMinutes: number;
  groups: StudentGroupProfile[];
  specialSupportStudents: SpecialSupportNote[];
  activeWeeklyThemes: {
    week: number;
    subject: SubjectCode;
    topicNodeId: string;
    topicTitle: string;
  }[];
}

export interface KnowledgeNode {
  id: string; // VD: "kg-7-toan-thong-ke"
  grade: GradeLevel;
  subject: SubjectCode;
  subjectName: string;
  semester: 1 | 2;
  weekRange: [number, number];
  title: string;
  moetRequiredOutcomes: string[]; // Yêu cầu cần đạt theo CT GDPT 2018
  coreCompetencies: string[];     // Năng lực cốt lõi (Tự chủ, Giao tiếp, Giải quyết vấn đề, Năng lực đặc thù)
  coreQualities: string[];        // 5 Phẩm chất (Yêu nước, Nhân ái, Chăm chỉ, Trung thực, Trách nhiệm)
  vietAnhPracticalHook: string;   // Gợi ý hoạt động "Vui vẻ và Thực dụng" tại Việt Anh
  keywords: string[];
}

export type KnowledgeEdgeRelation =
  | 'cung_chu_de_tuan'      // Cùng chủ đề/tuần học giữa các môn
  | 'ung_dung_thuc_te'      // Kiến thức môn A làm công cụ/ứng dụng cho môn B
  | 'tien_quyet'            // Kiến thức nền tảng cần có trước
  | 'du_an_steam_lien_mon'; // Có thể gộp thành dự án STEAM / Học tập trải nghiệm

export interface KnowledgeEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relation: KnowledgeEdgeRelation;
  integrationIdea: string; // Gợi ý kết nối liên môn cụ thể cho giáo viên
  suggestedSharedActivity: string;
}

export interface GenerationRequest {
  toolId: string;
  teacherEmail?: string;
  teacherName?: string;
  grade: GradeLevel;
  subject: SubjectCode;
  classId?: string;
  knowledgeNodeId?: string;
  linkedNodeIds?: string[];
  inputs: Record<string, string | number | boolean>;
  postAction?:
    | 'rut_ngan'
    | 'tang_do_kho'
    | 'giam_do_kho'
    | 'tao_rubric'
    | 'tao_phieu_hoc_tap'
    | 'song_ngu_anh_viet'
    | 'them_hoat_dong_vui_ve';
  previousContent?: string;
}

export interface GeneratedResource {
  id: string;
  createdAt: string; // ISO 8601 +07:00
  toolId: string;
  toolName: string;
  category: ToolCategoryCode;
  teacher: {
    email: string;
    name: string;
  };
  grade: GradeLevel;
  subject: SubjectCode;
  classId?: string;
  className?: string;
  knowledgeNodeId?: string;
  linkedNodeIds: string[];
  title: string;
  markdownContent: string;
  structuredSections: {
    heading: string;
    body: string;
  }[];
  differentiationSummary?: {
    coBan: string;
    chuan: string;
    nangCao: string;
  };
  crossSubjectHighlights?: {
    targetSubject: SubjectCode;
    targetTopic: string;
    integrationActivity: string;
  }[];
  moetComplianceChecklist: {
    criterion: string;
    passed: boolean;
    note: string;
  }[];
  generationMode: 'llm_live' | 'smart_template';
  modelUsed: string;
  estimatedMinutesSaved: number;
}

export interface MajorOsUsageEvent {
  id: string;
  luc: string; // ISO 8601 +07:00
  nguoi?: {
    email: string;
    ten: string;
  };
  hoc_sinh?: {
    ma: string;
  };
  tinh_nang:
    | 'sinh_hoc_lieu'
    | 'tinh_chinh_hau_ky'
    | 'ket_noi_lien_mon'
    | 'phan_hoa_lop_hoc'
    | 'xuat_hoc_lieu'
    | 'luu_thu_vien'
    | 'hoi_tro_ly_su_pham';
  so_lan: number;
  so_phut?: number;
  cong_cu_id?: string;
  mon_hoc?: SubjectCode;
  khoi_lop?: GradeLevel;
  lop_hoc?: string;
}
