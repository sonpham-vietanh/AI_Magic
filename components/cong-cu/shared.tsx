import type { SVGProps } from 'react';
import type { SubjectCode } from '@/lib/types';

// Bản sao cục bộ để không kéo lib/supabase.ts (xử lý khoá bí mật) vào bundle client.
export function mapSupabaseSubjectToCode(subjectName?: string): SubjectCode {
  if (!subjectName) return 'toan';
  const s = subjectName.toLowerCase();
  if (s.includes('toán')) return 'toan';
  if (s.includes('ngữ văn') || s.includes('tiếng việt')) return 'ngu_van';
  if (s.includes('tiếng anh') || s.includes('oxford')) return 'tieng_anh';
  if (s.includes('khoa học tự nhiên')) return 'khtn';
  if (s.includes('vật lí') || s.includes('vật lý')) return 'vat_ly';
  if (s.includes('hoá học') || s.includes('hóa học')) return 'hoa_hoc';
  if (s.includes('sinh học')) return 'sinh_hoc';
  if (s.includes('lịch sử và địa')) return 'lich_su_dia_ly';
  if (s.includes('địa lí') || s.includes('địa lý')) return 'dia_ly';
  if (s.includes('công dân') || s.includes('kinh tế')) return 'gdcd_gdktpl';
  if (s.includes('tin học')) return 'tin_hoc';
  if (s.includes('công nghệ')) return 'cong_nghe';
  return 'toan';
}

export async function readApiJson<T>(res: Response): Promise<T> {
  let body: (T & { error?: string }) | null = null;
  try {
    body = (await res.json()) as T & { error?: string };
  } catch {
    body = null;
  }
  if (!res.ok || !body) {
    if (res.status === 429) {
      throw new Error('Hệ thống đang quá tải, vui lòng thử lại sau ít phút.');
    }
    if (res.status === 401) {
      throw new Error('Phiên làm việc đã hết hạn, vui lòng tải lại trang rồi thử lại.');
    }
    throw new Error(
      body?.error || `Máy chủ trả về lỗi (${res.status}). Vui lòng thử lại sau.`,
    );
  }
  return body;
}

const CLASS_BY_GRADE_KEY = 'va.classByGrade';

export function readClassByGrade(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(CLASS_BY_GRADE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

export function rememberClassForGrade(gradeKey: string, classId: string) {
  try {
    const map = readClassByGrade();
    map[gradeKey] = classId;
    window.localStorage.setItem(CLASS_BY_GRADE_KEY, JSON.stringify(map));
  } catch {
    // localStorage bị chặn: bỏ qua
  }
}

export const SUPABASE_SUBJECTS = [
  'Toán',
  'Ngữ văn',
  'Tiếng Anh',
  'Khoa học tự nhiên',
  'Lịch sử và Địa lí',
  'Giáo dục công dân',
  'Tin học',
  'Công nghệ',
  'Vật lí',
  'Hoá học',
  'Sinh học',
  'Địa lí',
  'Giáo dục kinh tế và pháp luật',
  'Oxford English',
];

export const GRADES = ['6', '7', '8', '9', '10', '11', '12'];

/** Công cụ soạn lẻ nhanh, mở thẳng studio. */
export const QUICK_TOOLS: { toolId: string; label: string }[] = [
  { toolId: 'khbd-5512', label: 'Giáo án 5512' },
  { toolId: 'pht-worksheet-5512', label: 'Phiếu học tập A4' },
  { toolId: 'ktdg-15-phut', label: 'Kiểm tra 15 phút' },
  { toolId: 'ktdg-ma-tran-22', label: 'Ma trận TT22' },
];

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4" />
    </svg>
  );
}
