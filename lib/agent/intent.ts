// Hiểu câu gõ tự do bằng LUẬT XÁC ĐỊNH (từ khoá), không dùng LLM và không lập kế hoạch tự do.
// Chỉ trích ra các tham số thuộc tập lựa chọn đóng; phần còn lại là từ khoá tìm bài.
import type { BloomStart, NgonNgu } from '../ui/soanBai';
import type { FormatValue, StyleValue } from './flow';

export function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export type CommandId = 'duyet' | 'chat_luong' | 'cong_cu' | 'thu_vien' | 'lop' | 'bieu_mau' | 'reset';

export interface Intent {
  /** Câu có động từ yêu cầu làm việc (soạn, tạo, làm...). */
  verb: boolean;
  /** Môn học (mã như 'toan', 'vat_ly') nếu câu nói rõ. */
  subject?: string;
  /** Khối lớp ('6'..'12') nếu câu nói rõ ("lớp 7", "khối 7", "7A2"). */
  grade?: string;
  /** Tên lớp viết hoa như '7A2' nếu có. */
  className?: string;
  /** Số tiết ("2 tiết"). */
  soTiet?: number;
  /** Số bài ("bài 4") và số chương ("chương 2"). */
  lessonNo?: number;
  chapterNo?: number;
  format?: FormatValue;
  bloom?: BloomStart;
  phongCach?: StyleValue;
  ngonNgu?: NgonNgu;
  command?: CommandId;
  /** Phần còn lại sau khi bỏ từ khoá lệnh: dùng để tìm bài. */
  lessonQuery: string;
  /** Như lessonQuery nhưng giữ nguyên dấu tiếng Việt (dùng để tìm trong dữ liệu có dấu). */
  lessonQueryRaw: string;
}

// Thứ tự quan trọng: cụm dài/cụ thể đứng trước ("de kiem tra" trước "kiem tra").
const FORMAT_RULES: [RegExp, FormatValue][] = [
  [/\b(bo tiet day|tron bo tiet|bo bai giang|goi tiet day)\b/, 'bo_tiet_day'],
  [/\b(tron bo|6 dang|sau dang|bo tai nguyen|du 6)\b/, 'tai_nguyen_6_dang'],
  [/\b(de kiem tra|kiem tra dinh ky|de thi|ma tran)\b/, 'de_kiem_tra'],
  [/\b(quiz|trac nghiem|cung co)\b/, 'quiz'],
  [/\b(slide|slides|trinh chieu|powerpoint|ppt|pptx)\b/, 'slide'],
  [/\b(phieu hoc tap|phieu bai tap|worksheet|phieu)\b/, 'worksheet'],
  [/\b(tranh luan|hai chuyen gia|2 chuyen gia|debate)\b/, 'tranh_luan'],
  [/\b(podcast|audio)\b/, 'podcast'],
  [/\b(infographic|info graphic|do hoa thong tin)\b/, 'infographic'],
  [/\b(mindmap|mind map|so do tu duy)\b/, 'mindmap'],
  [/\b(video|clip)\b/, 'video'],
  [/\b(ke hoach bai day|ke hoach|giao an|khbd)\b/, 'ke_hoach'],
  [/\b(tai nguyen)\b/, 'tai_nguyen_6_dang'],
];

const STYLE_RULES: [RegExp, StyleValue][] = [
  [/\b(truyen thong)\b/, 'truyen_thong'],
  [/\b(kham pha|socratic)\b/, 'kham_pha'],
  [/\b(hop tac|theo nhom|thao luan nhom|hoat dong nhom|lam viec nhom)\b/, 'hop_tac'],
  [/\b(tro choi|game|gamif\w*)\b/, 'tro_choi'],
  [/\b(du an|project)\b/, 'du_an'],
];

const COMMAND_RULES: [RegExp, CommandId][] = [
  [/\b(bat dau lai|lam lai tu dau|cuoc tro chuyen moi|reset)\b/, 'reset'],
  [/\b(duyet|ban chuan|pha a)\b/, 'duyet'],
  [/\b(chat luong|tin hieu|bac dau)\b/, 'chat_luong'],
  [/\b(82 cong cu|kho cong cu|cong cu)\b/, 'cong_cu'],
  [/\b(thu vien)\b/, 'thu_vien'],
  [/\b(ho so lop|lop hoc)\b/, 'lop'],
  [/\b(bieu mau|form)\b/, 'bieu_mau'],
];

const SUBJECT_RULES: [RegExp, string][] = [
  [/\b(mon toan|toan hoc|toan(?= (lop|khoi|\d)))\b/, 'toan'],
  [/\b(vat ly|vat li|mon ly|mon li)\b/, 'vat_ly'],
  [/\b(hoa hoc|mon hoa)\b/, 'hoa_hoc'],
  [/\b(sinh hoc|mon sinh)\b/, 'sinh_hoc'],
  [/\b(ngu van|mon van|van hoc)\b/, 'ngu_van'],
  [/\b(tin hoc|mon tin)\b/, 'tin_hoc'],
];
const VERB_RE = /\b(soan|tao|lam|chuan bi|sinh|viet|thiet ke|len)\b/;

const STOP = new Set([
  'soan', 'tao', 'lam', 'cho', 'toi', 'minh', 'tui', 'em', 'co', 'thay', 'giup', 'hay', 'nhe', 'nha', 'oi',
  'bai', 'day', 've', 'mot', 'cai', 'can', 'muon', 'xin', 'vui', 'long', 'dum', 'va', 'cua', 'theo',
  'chuan', 'bi', 'chuan bi', 'sinh', 'lap', 'mau', 'bo', 'la', 'o', 'tiet', 'hoc',
  'lop', 'khoi', 'mon', 'chuong',
]);

export function parseIntent(text: string): Intent {
  const norm = stripDiacritics(text).replace(/\s+/g, ' ').trim();
  const intent: Intent = { lessonQuery: '', lessonQueryRaw: '', verb: false };
  let rest = ` ${norm} `;
  intent.verb = VERB_RE.test(norm);

  for (const [re, id] of COMMAND_RULES) {
    if (re.test(norm)) {
      intent.command = id;
      break;
    }
  }
  for (const [re, v] of FORMAT_RULES) {
    const m = re.exec(rest);
    if (m) {
      intent.format = v;
      rest = rest.replace(re, ' ');
      break;
    }
  }
  for (const [re, v] of STYLE_RULES) {
    const m = re.exec(rest);
    if (m) {
      intent.phongCach = v;
      rest = rest.replace(re, ' ');
      break;
    }
  }
  // Môn học: "môn tiếng Anh" là môn, còn "bằng tiếng Anh" / "song ngữ" là ngôn ngữ soạn.
  for (const [re, v] of SUBJECT_RULES) {
    if (re.test(rest)) {
      intent.subject = v;
      rest = rest.replace(re, ' ');
      break;
    }
  }
  if (!intent.subject && /\bmon tieng anh\b/.test(rest)) {
    intent.subject = 'tieng_anh';
    rest = rest.replace(/\bmon tieng anh\b/, ' ');
  }
  const tiet = /\b(\d{1,2}) tiet\b/.exec(rest);
  if (tiet) {
    const n = Number(tiet[1]);
    if (n >= 1 && n <= 10) intent.soTiet = n;
    rest = rest.replace(tiet[0], ' ');
  }
  const cls = /\b(?:lop |khoi )?(\d{1,2})a(\d{1,2})\b/.exec(rest);
  if (cls) {
    intent.grade = cls[1];
    intent.className = `${cls[1]}A${cls[2]}`;
    rest = rest.replace(cls[0], ' ');
  } else {
    const g = /\b(?:lop|khoi) (\d{1,2})\b/.exec(rest);
    if (g) {
      intent.grade = g[1];
      rest = rest.replace(g[0], ' ');
    }
  }
  const chap = /\bchuong (\d{1,2})\b/.exec(rest);
  if (chap) {
    intent.chapterNo = Number(chap[1]);
    rest = rest.replace(chap[0], ' ');
  }
  const les = /\bbai (?:so )?(\d{1,2})\b/.exec(rest);
  if (les) {
    intent.lessonNo = Number(les[1]);
    rest = rest.replace(les[0], ' ');
  }
  if (/\b(song ngu)\b/.test(rest)) {
    intent.ngonNgu = 'song_ngu';
    rest = rest.replace(/\bsong ngu\b/, ' ');
  } else if (/\b(tieng anh|english)\b/.test(rest)) {
    intent.ngonNgu = 'en';
    rest = rest.replace(/\b(tieng anh|english)\b/, ' ');
  }
  // Bloom chỉ nhận khi có từ dẫn ("bloom", "bậc", "mức"): "vận dụng" cũng là chữ thường gặp trong tên bài.
  const bm = /\b(bloom|bac|muc)\s+(nho|hieu|van dung)\b/.exec(rest);
  if (bm) {
    intent.bloom = bm[2] === 'nho' ? 'nho' : bm[2] === 'hieu' ? 'hieu' : 'van_dung';
    rest = rest.replace(bm[0], ' ');
  }

  const tokens = rest
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOP.has(t));
  intent.lessonQuery = tokens.join(' ');

  // Bản giữ dấu: duyệt từng từ của câu gốc, giữ những từ còn lại trong lessonQuery (đúng thứ tự).
  const want = [...tokens];
  const rawWords = text
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const kept: string[] = [];
  for (const w of rawWords) {
    const i = want.indexOf(stripDiacritics(w));
    if (i >= 0) {
      kept.push(w);
      want.splice(i, 1);
    }
  }
  intent.lessonQueryRaw = kept.join(' ');
  return intent;
}

export interface LessonLike {
  id: string;
  code: string;
  title: string;
}

export interface LessonMatch<T extends LessonLike> {
  lesson: T;
  score: number;
}

/** Xếp hạng bài theo mức trùng từ khoá (0..1). */
export function matchLessons<T extends LessonLike>(query: string, lessons: T[], limit = 6): LessonMatch<T>[] {
  const q = stripDiacritics(query)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  if (q.length === 0) return [];
  const out: LessonMatch<T>[] = [];
  for (const lesson of lessons) {
    const hay = stripDiacritics(`${lesson.code} ${lesson.title}`);
    const words = new Set(hay.split(/[^a-z0-9]+/).filter(Boolean));
    let hit = 0;
    for (const t of q) {
      if (words.has(t)) hit += 1;
      else if (t.length >= 4 && hay.includes(t)) hit += 0.6;
    }
    const score = hit / q.length;
    if (score > 0) out.push({ lesson, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Chỉ tự chọn bài khi khớp rõ ràng và vượt trội bài đứng sau; còn lại để người dùng chọn. */
export function pickConfident<T extends LessonLike>(matches: LessonMatch<T>[]): T | null {
  const [a, b] = matches;
  if (!a) return null;
  if (a.score < 0.99) return null;
  if (b && b.score >= a.score) return null;
  return a.lesson;
}
