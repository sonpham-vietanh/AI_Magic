/**
 * Guardrail thời sự: tiết gắn sự kiện thời sự LUÔN cần người duyệt.
 * Nguồn theo danh sách trắng, loại chủ đề nhạy cảm, không dùng sự kiện < 48 giờ.
 */

/** Hậu tố tên miền được duyệt (khớp theo ranh giới dấu chấm, không khớp chuỗi con). */
export const NEWS_WHITELIST: string[] = [
  'vnexpress.net',
  'tuoitre.vn',
  'thanhnien.vn',
  'vtv.vn',
  'reuters.com',
  'apnews.com',
];

export const MIN_EVENT_AGE_HOURS = 48;

export interface NewsEventInput {
  tieuDe: string;
  url: string;
  ngayDang: string;
  noiDung?: string;
}

export interface NewsCheckResult {
  ok: boolean;
  reasons: string[];
  requiresApproval: true;
}

/** Bỏ dấu tiếng Việt, hạ chữ thường. */
export function normalizeVi(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

export function isWhitelistedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return NEWS_WHITELIST.some((d) => h === d || h.endsWith('.' + d));
}

const BLOCKED_TOPICS: { label: string; patterns: string[] }[] = [
  { label: 'tình dục', patterns: ['tinh duc', 'quan he tinh duc', 'khieu dam', 'sex', 'porn'] },
  { label: 'chính trị', patterns: ['chinh tri', 'bau cu', 'dang phai'] },
  { label: 'tôn giáo', patterns: ['ton giao', 'tin nguong'] },
  { label: 'dân tộc', patterns: ['dan toc', 'ky thi sac toc'] },
  {
    label: 'chủ quyền biển đảo',
    patterns: ['chu quyen', 'bien dong', 'hoang sa', 'truong sa', 'bien dao'],
  },
  {
    label: 'đánh giá nhân vật lịch sử',
    patterns: [
      'danh gia[^.\\n]{0,40}nhan vat lich su',
      'nhan vat lich su[^.\\n]{0,40}danh gia',
      'cong toi cua[^.\\n]{0,40}(?:vua|tong thong|lanh tu)',
    ],
  },
];

function hasPattern(norm: string, pattern: string): boolean {
  // "word-ish": không dính liền chữ/số ở hai đầu.
  return new RegExp(`(?<![a-z0-9])(?:${pattern})(?![a-z0-9])`).test(norm);
}

export function findBlockedTopics(text: string): string[] {
  const norm = normalizeVi(text);
  return BLOCKED_TOPICS.filter((t) => t.patterns.some((p) => hasPattern(norm, p))).map((t) => t.label);
}

export function checkNewsEvent(input: NewsEventInput, now: Date = new Date()): NewsCheckResult {
  const reasons: string[] = [];

  let parsed: URL | null = null;
  try {
    parsed = new URL(String(input.url ?? ''));
  } catch {
    parsed = null;
  }
  if (!parsed) {
    reasons.push('Đường dẫn nguồn tin không hợp lệ.');
  } else {
    if (parsed.protocol !== 'https:') reasons.push('Nguồn tin phải dùng đường dẫn https.');
    if (!isWhitelistedHost(parsed.hostname)) {
      reasons.push(
        `Nguồn "${parsed.hostname}" không nằm trong danh sách trắng (VnExpress, Tuổi Trẻ, Thanh Niên, VTV, Reuters, AP).`,
      );
    }
  }

  const raw = String(input.ngayDang ?? '').trim();
  const t = /^\d{4}-\d{2}-\d{2}/.test(raw) ? Date.parse(raw) : NaN;
  if (Number.isNaN(t)) {
    reasons.push('Ngày đăng không hợp lệ (cần định dạng ISO).');
  } else {
    const ageMs = now.getTime() - t;
    if (ageMs < 0) reasons.push('Ngày đăng nằm ở tương lai.');
    else if (ageMs < MIN_EVENT_AGE_HOURS * 3600_000) {
      reasons.push(`Sự kiện mới dưới ${MIN_EVENT_AGE_HOURS} giờ, chưa được dùng trong bài giảng.`);
    }
  }

  for (const b of findBlockedTopics(`${input.tieuDe ?? ''}\n${input.noiDung ?? ''}`)) {
    reasons.push(`Chủ đề bị loại: ${b}.`);
  }

  return { ok: reasons.length === 0, reasons, requiresApproval: true };
}
