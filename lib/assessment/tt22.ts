/** Ánh xạ thang Bloom <-> mức đánh giá TT 22/2021/TT-BGDĐT. */
export type Tt22Level = 'nhan_biet' | 'thong_hieu' | 'van_dung' | 'van_dung_cao';

export const TT22_LEVELS: Tt22Level[] = ['nhan_biet', 'thong_hieu', 'van_dung', 'van_dung_cao'];

export const TT22_LABEL: Record<Tt22Level, string> = {
  nhan_biet: 'Nhận biết',
  thong_hieu: 'Thông hiểu',
  van_dung: 'Vận dụng',
  van_dung_cao: 'Vận dụng cao',
};

export const BLOOM_ORDER = ['Nhớ', 'Hiểu', 'Vận dụng', 'Phân tích', 'Đánh giá', 'Sáng tạo'] as const;
export type Bloom = (typeof BLOOM_ORDER)[number];

export const BLOOM_TO_TT22: Record<string, Tt22Level> = {
  'Nhớ': 'nhan_biet',
  'Hiểu': 'thong_hieu',
  'Vận dụng': 'van_dung',
  'Phân tích': 'van_dung',
  'Đánh giá': 'van_dung_cao',
  'Sáng tạo': 'van_dung_cao',
};

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLowerCase();
}

/** Chuẩn hóa tên bậc Bloom do người dùng nhập (bỏ dấu, hoa/thường). */
export function normalizeBloom(input: string): Bloom | null {
  const f = fold(input);
  for (const b of BLOOM_ORDER) if (fold(b) === f) return b;
  return null;
}

/** Bloom -> mức TT 22 (null nếu không nhận ra). */
export function bloomToTt22(bloom: string): Tt22Level | null {
  const b = normalizeBloom(bloom);
  return b ? BLOOM_TO_TT22[b] : null;
}
