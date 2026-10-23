// "Đã tiết kiệm": ước lượng số phút giáo viên tiết kiệm được nhờ MagicStudio.
// ĐÂY LÀ ƯỚC LƯỢNG theo quy ước dưới đây, KHÔNG phải số đo thực tế. Muốn đổi quy ước chỉ cần sửa bảng SAVING_MINUTES.
// File chỉ chứa mã thuần (dùng được cả ở máy chủ lẫn trình duyệt).

/** Số phút ước tính một giáo viên mất để tự soạn tay một sản phẩm cùng loại (theo từng dạng đầu ra). */
export const SAVING_MINUTES: Record<string, number> = {
  ke_hoach: 40,
  slide: 25,
  worksheet: 20,
  quiz: 15,
  de_kiem_tra: 60,
  infographic: 15,
  mindmap: 15,
  podcast: 15,
  tranh_luan: 15,
  video: 15,
  tai_nguyen_6_dang: 45,
  bo_tiet_day: 100,
};

/** Phút tiết kiệm cho mỗi học sinh khi viết nhận xét học bạ. */
export const HOC_BA_MINUTES_PER_STUDENT = 3;

/** Dạng chưa có trong bảng vẫn được tính một mức tối thiểu để không bỏ sót. */
export const DEFAULT_SAVING_MINUTES = 10;

export const SAVINGS_DISCLAIMER =
  'Đây là con số ước lượng: mỗi bản soạn lưu được quy ra số phút cô/thầy thường mất khi tự soạn (kế hoạch bài dạy 40 phút, slide 25, phiếu học tập 20, quiz 15, đề kiểm tra 60, mỗi dạng tài nguyên 15; nhận xét học bạ 3 phút mỗi em). Cùng một bài, cùng dạng, trong cùng một ngày chỉ tính một lần.';

export interface SavingsVersion {
  createdAt: string;
  format: string;
  lessonKey?: string;
}

export interface SavingsBucket {
  minutes: number;
  count: number;
}

export interface SavingsSummary {
  week: SavingsBucket;
  month: SavingsBucket;
  total: SavingsBucket;
  byFormat: Record<string, SavingsBucket>;
}

export function minutesFor(format: string): number {
  return SAVING_MINUTES[format] ?? DEFAULT_SAVING_MINUTES;
}

const DAY = 24 * 60 * 60 * 1000;

/** Chuỗi "x giờ y phút" ngắn gọn từ số phút. */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} giờ` : `${h} giờ ${r} phút`;
}

/** "≈ 3,5 giờ" (làm tròn 0,5 giờ) hoặc "≈ 40 phút" khi dưới một giờ. */
export function formatApprox(minutes: number): string {
  const m = Math.max(0, minutes);
  if (m < 60) return `≈ ${Math.round(m / 5) * 5 || (m > 0 ? 5 : 0)} phút`;
  const h = Math.round((m / 60) * 2) / 2;
  return `≈ ${String(h).replace('.', ',')} giờ`;
}

/**
 * Tổng hợp từ danh sách bản đã lưu của chính người dùng. Tuần = 7 ngày gần nhất, tháng = 30 ngày gần nhất.
 * Các bản trùng (cùng bài, cùng dạng, cùng ngày) chỉ tính một lần.
 */
export function summarizeSavings(versions: SavingsVersion[], now = Date.now()): SavingsSummary {
  const empty = (): SavingsBucket => ({ minutes: 0, count: 0 });
  const out: SavingsSummary = { week: empty(), month: empty(), total: empty(), byFormat: {} };
  const seen = new Set<string>();
  for (const v of versions) {
    const t = Date.parse(v.createdAt);
    if (!Number.isFinite(t) || t > now + DAY) continue;
    const key = `${v.lessonKey ?? ''}|${v.format}|${new Date(t).toISOString().slice(0, 10)}`;
    if (v.lessonKey && seen.has(key)) continue;
    seen.add(key);
    const mins = minutesFor(v.format);
    const age = now - t;
    const add = (b: SavingsBucket) => {
      b.minutes += mins;
      b.count += 1;
    };
    add(out.total);
    if (age <= 30 * DAY) add(out.month);
    if (age <= 7 * DAY) add(out.week);
    const f = (out.byFormat[v.format] ??= empty());
    f.minutes += mins;
    f.count += 1;
  }
  return out;
}
