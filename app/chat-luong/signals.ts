// Diễn giải số liệu chất lượng thành tín hiệu dễ đọc cho giáo viên (thuần hàm, có test).

export type Tone = 'good' | 'ok' | 'low' | 'none';

export interface Signal {
  tone: Tone;
  /** Nhãn ngắn, hiện thành huy hiệu. */
  label: string;
  /** Một câu giải thích ý nghĩa cho người không rành số liệu. */
  hint: string;
}

/** Dưới ngưỡng này thì mẫu còn quá ít, chỉ nên coi là gợi ý. */
export const MIN_SAMPLE = 5;

export const vnPct = (n: number, d = 0) => `${n.toFixed(d).replace('.', ',')}%`;

/** % bài được duyệt mà không phải sửa chữ nào. Càng cao càng tốt. */
export function unchangedSignal(pct: number | null | undefined, accepted: number): Signal {
  if (typeof pct !== 'number' || !Number.isFinite(pct) || accepted <= 0) {
    return { tone: 'none', label: 'Chưa đủ dữ liệu', hint: 'Số liệu sẽ có sau khi cô/thầy bấm "Duyệt & dùng" ở Trợ lý soạn bài.' };
  }
  const few = accepted < MIN_SAMPLE ? ` Mới có ${accepted} bài nên con số này chỉ để tham khảo.` : '';
  if (pct >= 70) return { tone: 'good', label: 'Tốt', hint: `Phần lớn bài soạn dùng được ngay, cô/thầy ít phải sửa.${few}` };
  if (pct >= 40) return { tone: 'ok', label: 'Khá', hint: `Nhiều bài vẫn cần chỉnh nhẹ trước khi dùng.${few}` };
  return { tone: 'low', label: 'Cần cải thiện', hint: `Cô/thầy thường phải sửa bài sau khi AI soạn, nên cần rà lại mẫu và gói kiến thức.${few}` };
}

/** Tỷ lệ sinh lại của một tiết (0..1). Càng thấp càng tốt. */
export function regenSignal(rate: number, flagged: boolean): Signal {
  if (flagged) return { tone: 'low', label: 'Cần người vào sửa', hint: 'Tiết này bị bấm sinh lại quá nhiều, có thể mẫu hoặc gói kiến thức chưa tốt.' };
  if (rate >= 0.25) return { tone: 'ok', label: 'Theo dõi', hint: 'Khá nhiều lần phải sinh lại.' };
  return { tone: 'good', label: 'Ổn', hint: 'Hiếm khi phải sinh lại.' };
}

/** Mức chỉnh sửa trung bình (0..1): phần nội dung bị cô/thầy đổi so với bản AI. */
export function diffSignal(ratio: number | null | undefined): Signal {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) {
    return { tone: 'none', label: 'Chưa đủ dữ liệu', hint: 'Chưa có bài nào được chỉnh sửa để so sánh.' };
  }
  if (ratio < 0.1) return { tone: 'good', label: 'Rất ít chỉnh sửa', hint: 'Bài AI soạn gần như được giữ nguyên.' };
  if (ratio < 0.3) return { tone: 'ok', label: 'Chỉnh vừa phải', hint: 'Cô/thầy thường đổi một vài đoạn.' };
  return { tone: 'low', label: 'Chỉnh nhiều', hint: 'Cô/thầy thường viết lại phần lớn nội dung.' };
}

/** Chênh lệch thời gian soạn: trả null nếu thiếu số liệu. */
export function minutesSaved(baseline: number | null, target: number | null): { minutes: number; pct: number } | null {
  if (baseline === null || target === null) return null;
  if (!Number.isFinite(baseline) || !Number.isFinite(target) || baseline <= 0 || target < 0) return null;
  const minutes = baseline - target;
  return { minutes, pct: (minutes / baseline) * 100 };
}
