import {
  CAP_HOC,
  DO_DAI,
  GIONG_VAN,
  KY_HOC,
  type CommentIssue,
  type HocBaOptions,
  type StudentInput,
} from './types';

const NAME_TOKEN = '{TEN}';

function sentenceGuide(doDai: HocBaOptions['doDai']): string {
  if (doDai === 'ngan') return '2 câu';
  if (doDai === 'vua') return '3 đến 4 câu';
  return '5 đến 6 câu';
}

function frameworkText(cap: HocBaOptions['capHoc']): string {
  if (cap === 'tieu_hoc') {
    return 'Căn cứ Thông tư 27/2020/TT-BGDĐT (đánh giá học sinh tiểu học): nêu ngắn gọn về phẩm chất chủ yếu (yêu nước, nhân ái, chăm chỉ, trung thực, trách nhiệm) và năng lực cốt lõi (tự chủ và tự học, giao tiếp và hợp tác, giải quyết vấn đề và sáng tạo; các năng lực đặc thù của môn học).';
  }
  return 'Căn cứ Thông tư 22/2021/TT-BGDĐT (đánh giá học sinh THCS, THPT): nêu ngắn gọn về phẩm chất chủ yếu (yêu nước, nhân ái, chăm chỉ, trung thực, trách nhiệm) và năng lực chung (tự chủ và tự học, giao tiếp và hợp tác, giải quyết vấn đề và sáng tạo), kết quả học tập và rèn luyện.';
}

/** Đổi dòng xuống hàng/ký tự điều khiển trong ghi chú thành khoảng trắng. */
export function cleanNote(note: string): string {
  return note
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Dựng prompt cho MỘT lô học sinh. Tên học sinh KHÔNG đi vào prompt: mỗi em chỉ có số thứ tự trong lô và các từ khoá.
 * Khi xưng hô theo tên, AI dùng ký hiệu {TEN} và máy chủ sẽ thay bằng tên thật sau khi nhận kết quả.
 */
export function buildBatchPrompt(
  students: Pick<StudentInput, 'ghiChu'>[],
  opts: HocBaOptions,
  strict = false,
): { system: string; user: string } {
  const cap = CAP_HOC.find((c) => c.id === opts.capHoc) ?? CAP_HOC[1];
  const dd = DO_DAI.find((d) => d.id === opts.doDai) ?? DO_DAI[1];
  const gv = GIONG_VAN.find((g) => g.id === opts.giong) ?? GIONG_VAN[0];
  const kh = KY_HOC.find((k) => k.id === opts.kyHoc) ?? KY_HOC[1];

  const xung =
    opts.xungHo === 'ten'
      ? `Mỗi nhận xét gọi học sinh bằng ký hiệu ${NAME_TOKEN} (viết đúng như vậy, hệ thống sẽ thay bằng tên thật), ví dụ "${NAME_TOKEN} chăm chỉ...". Không tự bịa tên.`
      : 'Mỗi nhận xét bắt đầu bằng chữ "Em" (ví dụ "Em chăm chỉ..."). Không dùng tên riêng.';

  const system = [
    'Bạn là giáo viên chủ nhiệm giàu kinh nghiệm của một trường phổ thông ở Việt Nam, đang viết nhận xét học bạ bằng tiếng Việt.',
    frameworkText(cap.id),
    `Giọng văn: ${gv.label.toLowerCase()}, tích cực và khách quan. Nêu điểm mạnh trước, điểm cần cố gắng nói nhẹ nhàng kèm hướng phát triển. Tuyệt đối không so sánh học sinh này với học sinh khác, không xếp hạng, không dùng lời chê nặng nề hay nhãn tiêu cực.`,
    `Độ dài mỗi nhận xét: ${sentenceGuide(opts.doDai)}, khoảng ${dd.min + 10} đến ${dd.max - 20} từ.`,
    xung,
    'CHỈ dựa vào các từ khoá giáo viên cung cấp cho từng em. Không bịa thêm sự kiện, điểm số, giải thưởng, tên người, tên môn hay thông tin không có trong từ khoá. Nếu từ khoá ít, viết nhận xét chung chung phù hợp, tích cực và không cụ thể hoá thêm.',
    'Không nhắc đến các học sinh khác. Mỗi nhận xét là một đoạn văn liền mạch, không gạch đầu dòng, không đánh số, không ghi chú thích.',
    strict
      ? 'LƯU Ý: lần trước kết quả có lỗi (so sánh với bạn khác, thêm số liệu không có, hoặc sai độ dài). Lần này viết thật đúng yêu cầu.'
      : '',
    'ĐẦU RA: chỉ trả về một mảng JSON hợp lệ, không thêm chữ nào khác, dạng [{"stt":1,"nhan_xet":"..."},{"stt":2,"nhan_xet":"..."}], đủ mọi số thứ tự được cung cấp.',
  ]
    .filter(Boolean)
    .join('\n');

  const list = students
    .map((s, i) => `${i + 1}. Từ khoá của giáo viên: ${cleanNote(s.ghiChu) || '(không có ghi chú, viết nhận xét chung tích cực)'}`)
    .join('\n');
  const user = `${kh.label}. Cấp ${cap.label}. Hãy viết nhận xét cho ${students.length} học sinh sau.\n\n${list}`;
  return { system, user };
}

/** Lấy tên gọi (từ cuối của họ và tên). */
export function givenName(fullName: string): string {
  const parts = fullName.normalize('NFC').trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

/** Tách mảng kết quả từ phản hồi thô của AI: ưu tiên JSON, dự phòng dạng "1. nội dung". */
export function parseBatchOutput(raw: string, expected: number): Map<number, string> {
  const out = new Map<number, string>();
  const text = (raw ?? '').trim();
  if (!text) return out;

  const tryJson = (src: string): boolean => {
    try {
      const data = JSON.parse(src) as unknown;
      const arr = Array.isArray(data) ? data : (data as { items?: unknown })?.items;
      if (!Array.isArray(arr)) return false;
      arr.forEach((it, idx) => {
        if (!it || typeof it !== 'object') return;
        const o = it as { stt?: unknown; nhan_xet?: unknown; text?: unknown };
        const n = Number(o.stt ?? idx + 1);
        const t = typeof o.nhan_xet === 'string' ? o.nhan_xet : typeof o.text === 'string' ? o.text : '';
        if (Number.isInteger(n) && n >= 1 && n <= expected && t.trim()) out.set(n, t.trim());
      });
      return out.size > 0;
    } catch {
      return false;
    }
  };

  const fenced = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  if (tryJson(fenced)) return out;
  const a = fenced.indexOf('[');
  const b = fenced.lastIndexOf(']');
  if (a >= 0 && b > a && tryJson(fenced.slice(a, b + 1))) return out;

  // Dự phòng: mỗi mục bắt đầu bằng "số." hoặc "số)" ở đầu dòng.
  const re = /^\s*(\d{1,3})[.)]\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fenced))) {
    const n = Number(m[1]);
    if (n >= 1 && n <= expected && !out.has(n)) out.set(n, m[2].trim());
  }
  return out;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const COMPARE_RE =
  /(hơn|giỏi hơn|tốt hơn|thua|kém hơn)\s+(các\s+)?(bạn|em khác|học sinh khác)|nhất\s+(lớp|khối|trường)|đứng\s+(đầu|thứ|top)|xếp\s+(thứ|hạng|đầu)|so với\s+(các\s+)?(bạn|học sinh)|top\s*\d+|dẫn đầu lớp/i;

function numbersIn(s: string): string[] {
  return (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));
}

function wordRegex(word: string): RegExp {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}(?=$|[^\\p{L}\\p{N}])`, 'iu');
}

/**
 * Kiểm tra một nhận xét: độ dài, so sánh học sinh, nhắc tên bạn khác, số liệu không có trong từ khoá, ký hiệu còn sót.
 * `otherNames` là tên gọi của các học sinh khác trong cùng lô.
 */
export function validateComment(
  text: string,
  note: string,
  opts: Pick<HocBaOptions, 'doDai'>,
  otherNames: string[],
): CommentIssue[] {
  const issues: CommentIssue[] = [];
  const t = (text ?? '').trim();
  if (!t) return [{ code: 'rong', message: 'Chưa có nội dung nhận xét.', blocking: true }];
  const dd = DO_DAI.find((d) => d.id === opts.doDai) ?? DO_DAI[1];
  const words = countWords(t);
  if (words < dd.min) issues.push({ code: 'qua_ngan', message: `Hơi ngắn (${words} từ), cô/thầy có thể bổ sung.`, blocking: false });
  if (words > dd.max) issues.push({ code: 'qua_dai', message: `Hơi dài (${words} từ), cô/thầy nên rút gọn.`, blocking: false });
  if (COMPARE_RE.test(t)) {
    issues.push({ code: 'so_sanh', message: 'Có câu so sánh với bạn khác, cô/thầy nên sửa.', blocking: true });
  }
  for (const name of otherNames) {
    if (name.length >= 2 && wordRegex(name).test(t)) {
      issues.push({ code: 'nhac_ten_ban_khac', message: `Nhắc đến tên "${name}" không thuộc em này.`, blocking: true });
      break;
    }
  }
  if (t.includes(NAME_TOKEN) || /\{[A-Z_]{2,}\}|\[TÊN\]/.test(t)) {
    issues.push({ code: 'con_ky_hieu', message: 'Còn ký hiệu chưa thay bằng tên.', blocking: true });
  }
  const known = new Set(numbersIn(note));
  const extra = numbersIn(t).filter((n) => !known.has(n));
  if (extra.length > 0) {
    issues.push({ code: 'so_lieu_la', message: `Có số liệu (${extra.slice(0, 3).join(', ')}) không có trong ghi chú, cần kiểm tra.`, blocking: true });
  }
  return issues;
}

/** Thay ký hiệu {TEN} bằng tên gọi thật. */
export function applyName(text: string, ten: string): string {
  return text.split(NAME_TOKEN).join(givenName(ten) || 'em');
}
