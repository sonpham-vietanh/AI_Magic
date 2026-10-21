// Helper thuần cho trang /soan-bai (không phụ thuộc React).

export type BloomStart = 'nho' | 'hieu' | 'van_dung';
export type NgonNgu = 'vi' | 'en' | 'song_ngu';

export const BLOOM_ORDER = ['Nhớ', 'Hiểu', 'Vận dụng', 'Phân tích', 'Đánh giá', 'Sáng tạo'] as const;

export const BLOOM_CHOICES: { value: BloomStart; label: string; hint: string }[] = [
  { value: 'nho', label: 'Nhớ', hint: 'Lớp cần củng cố nền tảng' },
  { value: 'hieu', label: 'Hiểu', hint: 'Lớp đã nắm khái niệm cơ bản' },
  { value: 'van_dung', label: 'Vận dụng', hint: 'Lớp khá, cần nâng cao' },
];

export const PHONG_CACH_OPTIONS = [
  { value: 'truyen_thong', label: 'Truyền thống', hint: 'Giảng – ví dụ – luyện tập' },
  { value: 'kham_pha', label: 'Khám phá', hint: 'Học sinh tự phát hiện qua tình huống' },
  { value: 'hop_tac', label: 'Hợp tác', hint: 'Làm việc nhóm, thảo luận' },
  { value: 'tro_choi', label: 'Trò chơi hoá', hint: 'Thử thách, điểm thưởng' },
  { value: 'du_an', label: 'Dự án', hint: 'Sản phẩm thực tế theo chủ đề' },
] as const;

export const FORMAT_OPTIONS = [
  { value: 'ke_hoach', label: 'Kế hoạch bài dạy' },
  { value: 'slide', label: 'Slide bài giảng' },
  { value: 'worksheet', label: 'Phiếu bài tập (worksheet)' },
  { value: 'quiz', label: 'Quiz nhanh' },
  { value: 'de_kiem_tra', label: 'Đề kiểm tra' },
  { value: 'infographic', label: 'Infographic' },
  { value: 'mindmap', label: 'Sơ đồ tư duy (Mindmap)' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'tranh_luan', label: 'Audio tranh luận 2 chuyên gia' },
  { value: 'video', label: 'Video 1–8 phút' },
  { value: 'tai_nguyen_6_dang', label: 'Trọn bộ 6 dạng tài nguyên' },
] as const;

export const NGON_NGU_OPTIONS: { value: NgonNgu; label: string }[] = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
  { value: 'song_ngu', label: 'Song ngữ Việt – Anh' },
];

/** Bloom: bậc thấp nhất + 3 bậc trên (luôn chứa Phân tích). */
export function bloomPreview(start: BloomStart | '' | undefined): string[] {
  const idx = start === 'nho' ? 0 : start === 'hieu' ? 1 : start === 'van_dung' ? 2 : -1;
  if (idx < 0) return [];
  return BLOOM_ORDER.slice(idx, idx + 4) as unknown as string[];
}

export interface SoanBaiForm {
  ngayDay: string;
  baiDayId: string;
  bloomThapNhat: BloomStart | '';
  ngonNgu: NgonNgu;
  phongCach: string;
  formatDauRa: string;
  classId: string;
  suKien: { bat: boolean; tieuDe: string; url: string; ngayDang: string; noiDung: string };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateForm(f: SoanBaiForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.ngayDay || !DATE_RE.test(f.ngayDay)) e.ngayDay = 'Vui lòng chọn ngày dạy.';
  if (!f.baiDayId) e.baiDayId = 'Vui lòng chọn bài dạy theo PPCT.';
  if (!f.bloomThapNhat) e.bloomThapNhat = 'Vui lòng chọn bậc Bloom thấp nhất.';
  if (!f.phongCach) e.phongCach = 'Vui lòng chọn phong cách dạy.';
  if (!f.formatDauRa) e.formatDauRa = 'Vui lòng chọn định dạng đầu ra.';
  if (f.suKien.bat) {
    if (!f.suKien.tieuDe.trim()) e.suKienTieuDe = 'Nhập tiêu đề sự kiện thời sự.';
    if (!/^https?:\/\/\S+$/i.test(f.suKien.url.trim())) e.suKienUrl = 'Nhập đường dẫn (http/https) tới bài báo.';
    if (!DATE_RE.test(f.suKien.ngayDang)) e.suKienNgay = 'Chọn ngày đăng bài báo.';
  }
  return e;
}

export function buildParams(f: SoanBaiForm, extra: { regenerationOf?: string; teacher?: { name: string; email?: string } } = {}) {
  const params: Record<string, unknown> = {
    ngayDay: f.ngayDay,
    baiDayId: f.baiDayId,
    bloomThapNhat: f.bloomThapNhat,
    ngonNgu: f.ngonNgu,
    phongCach: f.phongCach,
    formatDauRa: f.formatDauRa,
  };
  if (f.classId) params.classId = f.classId;
  if (f.suKien.bat) {
    const sk: Record<string, string> = {
      tieuDe: f.suKien.tieuDe.trim(),
      url: f.suKien.url.trim(),
      ngayDang: f.suKien.ngayDang,
    };
    if (f.suKien.noiDung.trim()) sk.noiDung = f.suKien.noiDung.trim();
    params.suKienThoiSu = sk;
  }
  if (extra.teacher) params.teacher = extra.teacher;
  if (extra.regenerationOf) params.regenerationOf = extra.regenerationOf;
  return params;
}

export function formatApiError(status: number, error?: string): string {
  const detail = (error || '').trim();
  switch (status) {
    case 400:
      return `Thông tin chưa hợp lệ${detail ? `: ${detail}` : '.'} Vui lòng kiểm tra lại biểu mẫu.`;
    case 403:
      return 'Bạn chưa có quyền thực hiện thao tác này.';
    case 404:
      return 'Không tìm thấy bài dạy hoặc bản chuẩn trong Kho. Hãy chọn bài khác.';
    case 422:
      return formatGuardrail(detail ? detail.split(/\s*[;\n]\s*/) : []).join('\n');
    case 429:
      return 'Hệ thống đang bận hoặc bạn gửi quá nhiều yêu cầu. Vui lòng đợi ít phút rồi thử lại.';
    case 502:
      return 'Dịch vụ AI tạm thời không phản hồi. Vui lòng thử lại sau ít phút.';
    default:
      return detail || `Có lỗi xảy ra (mã ${status}). Vui lòng thử lại.`;
  }
}

/** 422: danh sách lý do guardrail chặn, dạng gạch đầu dòng. */
export function formatGuardrail(reasons: string[]): string[] {
  const list = reasons.map((r) => r.trim()).filter(Boolean);
  return [
    'Nội dung bị chặn bởi bộ kiểm soát an toàn:',
    ...(list.length ? list.map((r) => `- ${r}`) : ['- (không có chi tiết)']),
  ];
}

export function buildFinalText(sections: { heading: string; body: string }[], fallbackMarkdown = ''): string {
  if (!sections || sections.length === 0) return fallbackMarkdown;
  return sections
    .map((s) => (s.heading ? `${s.heading}\n${s.body}` : s.body))
    .join('\n\n')
    .trim();
}

/** Tách văn bản đã chỉnh thành các mục cho .docx: dòng "# Tiêu đề" hoặc tiêu đề đã biết bắt đầu mục mới. */
export function textToSections(text: string, knownHeadings: string[] = []): { heading: string; body: string }[] {
  const known = new Set(knownHeadings.map((h) => h.trim()).filter(Boolean));
  const out: { heading: string; body: string[] }[] = [];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const md = /^#{1,3}\s+(.+)$/.exec(line);
    const h = md ? md[1].trim() : known.has(line.trim()) ? line.trim() : null;
    if (h) out.push({ heading: h, body: [] });
    else {
      if (out.length === 0) out.push({ heading: 'Nội dung', body: [] });
      out[out.length - 1].body.push(line);
    }
  }
  return out.map((s) => ({ heading: s.heading, body: s.body.join('\n').trim() }));
}
