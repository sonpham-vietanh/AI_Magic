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

/** Ký tự vô hình hay dùng để lách bộ lọc (zero-width, soft hyphen, BOM). */
const INVISIBLE_RE = /[\u00AD\u200B-\u200F\u2060\uFEFF]/g;

/** Chuẩn hoá Unicode NFC, bỏ ký tự vô hình, hạ chữ thường (giữ dấu). */
export function normalizeNfc(s: string): string {
  return s.normalize('NFKC').replace(INVISIBLE_RE, '').toLowerCase();
}

/** Bỏ dấu tiếng Việt (kể cả chữ tổ hợp rời), đ -> d, hạ chữ thường. */
export function normalizeVi(s: string): string {
  return s
    .normalize('NFKC')
    .replace(INVISIBLE_RE, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

export function isWhitelistedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return NEWS_WHITELIST.some((d) => h === d || h.endsWith('.' + d));
}

const BLOCKED_TOPICS: { label: string; patterns: string[] }[] = [
  { label: 'tình dục', patterns: ['tinh duc', 'quan he tinh duc', 'khieu dam', 'sex', 'porn', 'ma dam'] },
  { label: 'chính trị', patterns: ['chinh tri', 'bau cu', 'bieu tinh', 'phan dong', 'tham nhung'] },
  { label: 'tôn giáo', patterns: ['ton giao', 'tin nguong', 'phat giao', 'thien chua giao', 'cong giao', 'hoi giao'] },
  { label: 'dân tộc', patterns: ['dan toc', 'ky thi sac toc', 'phan biet chung toc', 'ky thi chung toc'] },
  {
    label: 'chủ quyền biển đảo',
    patterns: ['chu quyen', 'bien dong', 'hoang sa', 'truong sa', 'bien dao', 'duong luoi bo'],
  },
  {
    label: 'đánh giá nhân vật lịch sử',
    patterns: [
      'danh gia[^.\n]{0,40}nhan vat lich su',
      'nhan vat lich su[^.\n]{0,40}danh gia',
      'cong toi cua[^.\n]{0,40}(?:vua|tong thong|lanh tu)',
    ],
  },
  { label: 'bạo lực, khủng bố', patterns: ['khung bo', 'giet nguoi', 'bao luc hoc duong', 'tu tu', 'tu sat', 'danh bom'] },
  { label: 'ma tuý, cờ bạc', patterns: ['ma tuy', 'heroin', 'co bac', 'ca do', 'danh bac'] },
];

/**
 * Cụm chỉ khớp khi viết ĐÚNG dấu, vì khi bỏ dấu trùng với cụm vô hại
 * ("đảng phái" và "đang phải" cùng thành "dang phai"). Nếu cả văn bản không có dấu
 * (gõ không dấu) thì dạng không dấu vẫn được chặn, ưu tiên an toàn.
 */
const ACCENT_SENSITIVE: { label: string; accented: string; ascii: string }[] = [
  { label: 'chính trị', accented: 'đảng phái', ascii: 'dang phai' },
];

function hasPattern(norm: string, pattern: string): boolean {
  // "word-ish": không dính liền chữ/số ở hai đầu.
  return new RegExp(`(?<![a-z0-9])(?:${pattern})(?![a-z0-9])`).test(norm);
}

export function findBlockedTopics(text: string): string[] {
  const norm = normalizeVi(text);
  const nfc = normalizeNfc(text);
  const hasVietnameseMarks = /[^\x00-\x7f]/.test(nfc);
  const out = new Set<string>();
  for (const t of BLOCKED_TOPICS) {
    if (t.patterns.some((p) => hasPattern(norm, p))) out.add(t.label);
  }
  for (const a of ACCENT_SENSITIVE) {
    const hit = new RegExp(`(?<![\\p{L}\\p{N}])${a.accented}(?![\\p{L}\\p{N}])`, 'u').test(nfc)
      || (!hasVietnameseMarks && hasPattern(norm, a.ascii));
    if (hit) out.add(a.label);
  }
  return [...out];
}

/** Đọc ngày đăng; trả mốc thời gian (ms) hoặc NaN. Ngày không tồn tại bị từ chối. */
export function parseNewsDate(raw: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(raw);
  if (!m) return NaN;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const chk = new Date(Date.UTC(y, mo - 1, d));
  if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return NaN;
  if (m[4] === undefined) {
    // Chỉ có ngày: tính đến CUỐI ngày (giờ Việt Nam) để không đánh giá sự kiện cũ hơn thực tế.
    return Date.parse(`${m[1]}-${m[2]}-${m[3]}T23:59:59.999+07:00`);
  }
  if (Number(m[4]) > 23 || Number(m[5]) > 59 || (m[6] !== undefined && Number(m[6]) > 59)) return NaN;
  let tz = m[7] ?? '+07:00';
  if (/^[+-]\d{4}$/.test(tz)) tz = `${tz.slice(0, 3)}:${tz.slice(3)}`;
  return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}${m[0].includes('.') ? '.' + /\.(\d+)/.exec(m[0])![1] : ''}${tz}`);
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
  const t = parseNewsDate(raw);
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
