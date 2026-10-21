import { z } from 'zod';

export const BLOOM_LEVELS = ['Nhớ', 'Hiểu', 'Vận dụng', 'Phân tích', 'Đánh giá', 'Sáng tạo'] as const;

export type BloomLowest = 'nho' | 'hieu' | 'van_dung';

/** Mức thấp nhất + 3 mức trên; luôn chứa "Phân tích". */
export function bloomLevelsFor(lowest: BloomLowest): string[] {
  const starts: Record<BloomLowest, number> = { nho: 0, hieu: 1, van_dung: 2 };
  const start = starts[lowest];
  if (start === undefined) throw new Error('bloomThapNhat không hợp lệ');
  return BLOOM_LEVELS.slice(start, start + 4) as unknown as string[];
}

export const PHONG_CACH = [
  { id: 'truyen_thong', label: 'Truyền thống chặt chẽ' },
  { id: 'kham_pha', label: 'Khám phá – Socratic' },
  { id: 'hop_tac', label: 'Hợp tác nhóm' },
  { id: 'tro_choi', label: 'Trò chơi hoá – Vui vẻ' },
  { id: 'du_an', label: 'Dự án thực dụng' },
] as const;

export const FORMAT_DAU_RA = [
  { id: 'ke_hoach', label: 'Kế hoạch bài dạy' },
  { id: 'slide', label: 'Slide' },
  { id: 'worksheet', label: 'Phiếu học tập' },
  { id: 'quiz', label: 'Quiz củng cố trong tiết' },
  { id: 'de_kiem_tra', label: 'Đề kiểm tra + ma trận' },
  { id: 'audio', label: 'Audio / Podcast' },
  { id: 'video', label: 'Video' },
  { id: 'tai_nguyen_6_dang', label: '6 dạng tài nguyên' },
] as const;

export type FormatId = (typeof FORMAT_DAU_RA)[number]['id'];
export type PhongCachId = (typeof PHONG_CACH)[number]['id'];
export type WorkflowId = 'khbd' | 'slide' | 'worksheet' | 'quiz' | 'de_kiem_tra' | 'tai_nguyen_6_dang';

export const WorkflowParamsSchema = z.object({
  ngayDay: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'ngayDay phải có dạng YYYY-MM-DD')
    .refine((s) => {
      const d = new Date(`${s}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, 'ngayDay không phải ngày hợp lệ'),
  baiDayId: z.string().trim().min(1).max(128),
  /** Bài thứ hai để soạn bài tích hợp liên môn (tuỳ chọn). */
  lienKetId: z
    .string()
    .regex(/^[A-Za-z0-9_.:-]{1,64}$/)
    .optional(),
  bloomThapNhat: z.enum(['nho', 'hieu', 'van_dung']),
  ngonNgu: z.enum(['vi', 'en', 'song_ngu']),
  phongCach: z.enum(['truyen_thong', 'kham_pha', 'hop_tac', 'tro_choi', 'du_an']),
  suKienThoiSu: z
    .object({
      tieuDe: z.string().trim().min(1).max(300),
      url: z.string().trim().min(1).max(2000),
      ngayDang: z.string().trim().min(1).max(40),
      noiDung: z.string().max(6000).optional(),
    })
    .optional(),
  formatDauRa: z.enum([
    'ke_hoach',
    'slide',
    'worksheet',
    'quiz',
    'de_kiem_tra',
    'audio',
    'video',
    'tai_nguyen_6_dang',
  ]),
  classId: z
    .string()
    .regex(/^[A-Za-z0-9_.:-]{1,64}$/)
    .optional(),
  teacher: z
    .object({ name: z.string().trim().min(1).max(100), email: z.string().max(200).optional() })
    .optional(),
  regenerationOf: z.string().max(128).optional(),
});

export type WorkflowParams = z.infer<typeof WorkflowParamsSchema>;

export interface Section {
  heading: string;
  body: string;
}
export interface ReflectionScore {
  id: string;
  name: string;
  score: number;
  note: string;
}
export interface Reflection {
  scores: ReflectionScore[];
  average: number;
  issues: string[];
  skipped?: boolean;
}
export interface WorkflowResult {
  runId: string;
  workflow: WorkflowId;
  bloomLevels: string[];
  standard: {
    status: 'approved' | 'chua_duyet' | 'khong_co';
    atomId: string;
    title?: string;
    reviewedBy?: string;
  };
  warnings: string[];
  content: { sections: Section[]; markdown: string };
  reflection: Reflection;
  guardrail?: { ok: boolean; reasons: string[] };
  requiresApproval: boolean;
}
