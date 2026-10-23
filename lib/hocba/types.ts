// Nhận xét học bạ: kiểu dữ liệu dùng chung cho máy chủ và trình duyệt.
// QUYỀN RIÊNG TƯ: danh sách học sinh chỉ tồn tại trong phiên của trình duyệt và trong bộ nhớ máy chủ lúc xử lý.
// Tên học sinh KHÔNG được gửi tới AI, KHÔNG được ghi vào kho dữ liệu hay bảng đo.

export const CAP_HOC = [
  { id: 'tieu_hoc', label: 'Tiểu học', ref: 'Thông tư 27/2020/TT-BGDĐT' },
  { id: 'thcs', label: 'THCS', ref: 'Thông tư 22/2021/TT-BGDĐT' },
  { id: 'thpt', label: 'THPT', ref: 'Thông tư 22/2021/TT-BGDĐT' },
] as const;
export type CapHoc = (typeof CAP_HOC)[number]['id'];

export const DO_DAI = [
  { id: 'ngan', label: 'Ngắn (khoảng 2 câu)', min: 15, max: 55 },
  { id: 'vua', label: 'Vừa (3 đến 4 câu)', min: 35, max: 100 },
  { id: 'dai', label: 'Đầy đủ (5 đến 6 câu)', min: 65, max: 170 },
] as const;
export type DoDai = (typeof DO_DAI)[number]['id'];

export const GIONG_VAN = [
  { id: 'am_ap', label: 'Ấm áp, gần gũi' },
  { id: 'trang_trong', label: 'Trang trọng, khách quan' },
  { id: 'khich_le', label: 'Khích lệ, truyền động lực' },
] as const;
export type GiongVan = (typeof GIONG_VAN)[number]['id'];

export const KY_HOC = [
  { id: 'giua_hk1', label: 'Giữa học kỳ I' },
  { id: 'cuoi_hk1', label: 'Cuối học kỳ I' },
  { id: 'giua_hk2', label: 'Giữa học kỳ II' },
  { id: 'cuoi_nam', label: 'Cuối năm học' },
] as const;
export type KyHoc = (typeof KY_HOC)[number]['id'];

export const XUNG_HO = [
  { id: 'em', label: 'Mở đầu bằng "Em"' },
  { id: 'ten', label: 'Gọi bằng tên của học sinh' },
] as const;
export type XungHo = (typeof XUNG_HO)[number]['id'];

export interface HocBaOptions {
  capHoc: CapHoc;
  doDai: DoDai;
  giong: GiongVan;
  kyHoc: KyHoc;
  xungHo: XungHo;
}

export interface StudentInput {
  id: string;
  /** Họ và tên (hoặc mã). Chỉ dùng ở máy chủ để ghép tên vào nhận xét, không gửi tới AI. */
  ten: string;
  /** Từ khoá của giáo viên: điểm mạnh, cần cố gắng, thái độ, ghi chú. */
  ghiChu: string;
}

export interface CommentIssue {
  code: 'rong' | 'qua_ngan' | 'qua_dai' | 'so_sanh' | 'nhac_ten_ban_khac' | 'so_lieu_la' | 'con_ky_hieu';
  message: string;
  /** true: lỗi nặng, máy chủ tự thử soạn lại một lần. */
  blocking: boolean;
}

export interface CommentResult {
  id: string;
  text?: string;
  issues?: CommentIssue[];
  error?: string;
}

/** Giới hạn cứng (cũng được máy chủ kiểm tra). */
export const MAX_STUDENTS_PER_RUN = 45;
export const MAX_STUDENTS_PER_BATCH = 12;
export const DEFAULT_BATCH_SIZE = 8;
export const MAX_NOTE_CHARS = 400;
export const MAX_NAME_CHARS = 60;
