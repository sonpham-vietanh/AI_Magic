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
  format?: FormatValue;
  bloom?: BloomStart;
  phongCach?: StyleValue;
  ngonNgu?: NgonNgu;
  command?: CommandId;
  /** Phần còn lại sau khi bỏ từ khoá lệnh: dùng để tìm bài. */
  lessonQuery: string;
}

// Thứ tự quan trọng: cụm dài/cụ thể đứng trước ("de kiem tra" trước "kiem tra").
const FORMAT_RULES: [RegExp, FormatValue][] = [
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
  [/\b(hop tac|theo nhom|thao luan nhom)\b/, 'hop_tac'],
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

const STOP = new Set([
  'soan', 'tao', 'lam', 'cho', 'toi', 'minh', 'tui', 'em', 'co', 'thay', 'giup', 'hay', 'nhe', 'nha', 'oi',
  'bai', 'day', 've', 'mot', 'cai', 'can', 'muon', 'xin', 'vui', 'long', 'dum', 'va', 'cua', 'theo',
  'chuan', 'bi', 'chuan bi', 'sinh', 'lap', 'mau', 'bo', 'la', 'o', 'tiet', 'hoc',
]);

export function parseIntent(text: string): Intent {
  const norm = stripDiacritics(text).replace(/\s+/g, ' ').trim();
  const intent: Intent = { lessonQuery: '' };
  let rest = ` ${norm} `;

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
