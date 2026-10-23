/**
 * Danh sách bài cho giáo viên: tên thân thiện, xếp theo chương, gom theo bài, tìm kiếm không dấu.
 * Thuần hàm (không phụ thuộc máy chủ hay trình duyệt) nên dùng chung cho API, giao diện và test.
 */

export interface LessonAtom {
  id: string;
  /** Mã kỹ thuật (ví dụ TO07-C04-D03). Không hiện cho giáo viên, chỉ để xếp thứ tự và tooltip. */
  code: string;
  title: string;
  subject?: string;
  grade?: number | string;
  chapter?: string | null;
  lesson?: string | null;
  ord?: number | null;
  hasFactoryPackage?: boolean;
  factoryAssetCount?: number;
}

/* ---------------- Chuẩn hoá chuỗi ---------------- */

/** Bỏ dấu, hạ chữ thường, gom khoảng trắng; đ -> d. */
export function fold(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cách đọc tên riêng khác nhau quy về một dạng để khớp từ khoá tiếng Việt. */
const PHRASE_SYNONYMS: [RegExp, string][] = [
  [/\bpy\s*-?\s*ta\s*-?\s*go(?:ras|re|rean)?\b/g, 'pythagore'],
  [/\b(?:pythagoras|pythagorean|pythagore|pytago|pitago|pitagor|pitagore|pythago|pi\s*ta\s*go)\b/g, 'pythagore'],
  [/\bco\s*-?\s*sin(?:e)?\b/g, 'cosin'],
  [/\bcosine\b/g, 'cosin'],
  [/\bsine\b/g, 'sin'],
  [/\bbpt\b/g, 'bat phuong trinh'],
  [/\bpt\b/g, 'phuong trinh'],
  [/\bhpt\b/g, 'he phuong trinh'],
  [/\bbac\s*2\b/g, 'bac hai'],
  [/\bbac\s*1\b/g, 'bac nhat'],
  [/\bbac\s*3\b/g, 'bac ba'],
  [/\bdinh\s+ly\b/g, 'dinh li'],
  [/\bly\s+thuyet\b/g, 'li thuyet'],
];

/** Chuẩn hoá để so khớp: bỏ dấu, thay dấu câu bằng khoảng trắng, áp đồng nghĩa, y -> i ở "li/ly". */
export function normalizeForSearch(s: string): string {
  let t = fold(s)
    .replace(/[“”"'`’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  for (const [re, to] of PHRASE_SYNONYMS) t = t.replace(re, to);
  // "lí/lý" đứng riêng thành "li"
  t = t.replace(/\bly\b/g, 'li');
  return t.replace(/\s+/g, ' ').trim();
}

export function queryTokens(q: string): string[] {
  const n = normalizeForSearch(q);
  if (!n) return [];
  return Array.from(new Set(n.split(' ').filter(Boolean)));
}

/* ---------------- Mã kỹ thuật, chương, bài ---------------- */

export interface ParsedCode {
  chapterNo: number | null;
  group: string;
  item: number | null;
}

/** TO07-C04-D03 -> chương 4, nhóm D, mục 3. Mã lạ thì trả null từng phần. */
export function parseAtomCode(code: string): ParsedCode {
  const parts = (code ?? '').split('-');
  const ch = parts[1] ? /(\d+)\s*$/.exec(parts[1]) : null;
  const gi = parts[2] ? /^([A-Za-z]*)(\d*)/.exec(parts[2]) : null;
  return {
    chapterNo: ch ? Number(ch[1]) : null,
    group: gi ? gi[1].toUpperCase() : '',
    item: gi && gi[2] ? Number(gi[2]) : null,
  };
}

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
export function romanToInt(s: string): number | null {
  const u = s.toUpperCase();
  if (!/^[IVXLC]+$/.test(u)) return null;
  let total = 0;
  for (let i = 0; i < u.length; i++) {
    const v = ROMAN[u[i]];
    const next = ROMAN[u[i + 1]] ?? 0;
    total += v < next ? -v : v;
  }
  return total > 0 ? total : null;
}

const CHAPTER_RE = /^\s*(Chương|Chủ đề|Chuyên đề|Unit|Bài|Phần|Module|Mạch|Bộ)\s+([IVXLC]+|\d+)\s*[:.\-–—]?\s*(.*)$/i;

export interface ChapterInfo {
  /** Số chương (để xếp thứ tự), null nếu không suy ra được. */
  no: number | null;
  /** Nhãn hiển thị: "Chương 4 · Tam giác bằng nhau". */
  label: string;
  /** Chỉ phần tên: "Tam giác bằng nhau". */
  name: string;
}

export function chapterInfo(chapter: string | null | undefined, code?: string): ChapterInfo {
  const raw = (chapter ?? '').trim();
  const fromCode = code ? parseAtomCode(code).chapterNo : null;
  if (!raw) {
    return fromCode != null
      ? { no: fromCode, label: `Chương ${fromCode}`, name: '' }
      : { no: null, label: 'Chưa phân chương', name: '' };
  }
  const m = CHAPTER_RE.exec(raw);
  if (m) {
    const n = /^\d+$/.test(m[2]) ? Number(m[2]) : romanToInt(m[2]);
    const prefix = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    const name = m[3].trim();
    const no = n ?? fromCode;
    const head = n != null ? `${prefix} ${n}` : prefix;
    return { no, label: name ? `${head} · ${name}` : head, name };
  }
  return { no: fromCode, label: raw, name: raw };
}

/** Tên hiển thị của một điểm tri thức: luôn là tên bài, không bao giờ là mã. */
export function displayTitle(a: Pick<LessonAtom, 'title' | 'lesson' | 'chapter'>): string {
  const t = (a.title ?? '').trim();
  if (t && !/^[A-Z]{2,4}\d{2}-C\d+/.test(t)) return t;
  return (a.lesson ?? '').trim() || (a.chapter ?? '').trim() || 'Bài chưa đặt tên';
}

/** Dòng ngữ cảnh nhỏ dưới tên bài: "Chương 4 · Tam giác bằng nhau". */
export function contextLine(a: Pick<LessonAtom, 'chapter' | 'code' | 'grade'>): string {
  const c = chapterInfo(a.chapter, a.code);
  return c.label;
}

/** Tooltip cho người quản trị / giáo viên muốn biết mã. */
export function codeHint(a: Pick<LessonAtom, 'code'>): string {
  return a.code ? `Mã kỹ thuật: ${a.code}` : '';
}

/* ---------------- Sắp xếp và gom nhóm ---------------- */

function natural(a: string, b: string): number {
  return a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' });
}

/** Khối rồi môn rồi chương rồi nhóm bài rồi thứ tự mục. */
export function compareAtoms(a: LessonAtom, b: LessonAtom): number {
  const ga = Number(a.grade ?? 0);
  const gb = Number(b.grade ?? 0);
  if (ga !== gb) return ga - gb;
  const sa = a.subject ?? '';
  const sb = b.subject ?? '';
  if (sa !== sb) return natural(sa, sb);
  const pa = parseAtomCode(a.code);
  const pb = parseAtomCode(b.code);
  const ca = pa.chapterNo ?? chapterInfo(a.chapter, a.code).no;
  const cb = pb.chapterNo ?? chapterInfo(b.chapter, b.code).no;
  if (ca == null || cb == null) {
    // Mã không theo kiểu TO07-C04-D03 (ví dụ S12B1_001): xếp theo mã, số đọc theo giá trị.
    const c = natural(a.code ?? '', b.code ?? '');
    if (c !== 0) return c;
  } else if (ca !== cb) return ca - cb;
  if (pa.group !== pb.group) return natural(pa.group, pb.group);
  const ia = pa.item ?? a.ord ?? 0;
  const ib = pb.item ?? b.ord ?? 0;
  if (ia !== ib) return ia - ib;
  const oa = a.ord ?? 0;
  const ob = b.ord ?? 0;
  if (oa !== ob) return oa - ob;
  return natural(a.code ?? '', b.code ?? '');
}

export interface LessonGroup<T extends LessonAtom = LessonAtom> {
  key: string;
  /** Tên bài (cột "lesson" của dữ liệu); các điểm tri thức cùng bài nằm chung một nhóm. */
  label: string;
  atoms: T[];
}
export interface ChapterGroup<T extends LessonAtom = LessonAtom> {
  key: string;
  label: string;
  no: number | null;
  lessons: LessonGroup<T>[];
  count: number;
}

/** Gom theo chương rồi theo bài; giữ thứ tự chuẩn chương trình. */
export function groupByChapter<T extends LessonAtom>(atoms: T[]): ChapterGroup<T>[] {
  const sorted = [...atoms].sort(compareAtoms);
  const chapters: ChapterGroup<T>[] = [];
  const chapIndex = new Map<string, ChapterGroup<T>>();
  for (const a of sorted) {
    const info = chapterInfo(a.chapter, a.code);
    const ck = `${a.grade ?? ''}|${a.subject ?? ''}|${info.no ?? ''}|${info.label}`;
    let ch = chapIndex.get(ck);
    if (!ch) {
      ch = { key: ck, label: info.label, no: info.no, lessons: [], count: 0 };
      chapIndex.set(ck, ch);
      chapters.push(ch);
    }
    const p = parseAtomCode(a.code);
    const lessonLabel = (a.lesson ?? '').trim();
    const lk = `${ck}|${p.group}|${lessonLabel}`;
    let ls = ch.lessons.find((l) => l.key === lk);
    if (!ls) {
      ls = { key: lk, label: lessonLabel, atoms: [] };
      ch.lessons.push(ls);
    }
    ls.atoms.push(a);
    ch.count += 1;
  }
  return chapters;
}

/* ---------------- Tìm kiếm ---------------- */

export interface SearchHit<T extends LessonAtom = LessonAtom> {
  atom: T;
  score: number;
}

interface Prepared {
  title: string;
  lesson: string;
  chapter: string;
  code: string;
}

function wordStart(hay: string, tok: string): boolean {
  return hay.startsWith(tok) || hay.includes(' ' + tok);
}

/** Điểm khớp một bài với bộ từ khoá; 0 nghĩa là không khớp (mọi từ khoá phải xuất hiện). */
export function scoreAtom(a: LessonAtom, tokens: string[], phrase: string, preferGrade?: string): number {
  if (!tokens.length) return 0;
  const p: Prepared = {
    title: normalizeForSearch(a.title ?? ''),
    lesson: normalizeForSearch(a.lesson ?? ''),
    chapter: normalizeForSearch(a.chapter ?? ''),
    code: fold(a.code ?? '').replace(/[^a-z0-9]/g, ''),
  };
  let score = 0;
  for (const tok of tokens) {
    let s = 0;
    if (wordStart(p.title, tok)) s = 12;
    else if (p.title.includes(tok)) s = 6;
    else if (wordStart(p.lesson, tok)) s = 5;
    else if (p.lesson.includes(tok)) s = 3;
    else if (wordStart(p.chapter, tok)) s = 2;
    else if (p.chapter.includes(tok)) s = 1;
    else if (tok.length >= 3 && p.code.includes(tok.replace(/[^a-z0-9]/g, ''))) s = 4;
    if (s === 0) return 0;
    score += s;
  }
  if (phrase) {
    if (p.title === phrase) score += 60;
    else if (p.title.includes(phrase)) score += 30;
    else if (p.lesson.includes(phrase)) score += 12;
  }
  const rawCode = fold(a.code ?? '');
  if (rawCode && rawCode === fold(phrase)) score += 100;
  if (preferGrade && String(a.grade ?? '') === preferGrade) score += 3;
  if (a.hasFactoryPackage) score += 2;
  return score;
}

/** Tìm không dấu, không phân biệt hoa thường, hiểu đồng nghĩa; xếp theo độ khớp rồi thứ tự chương trình. */
export function searchAtoms<T extends LessonAtom>(
  atoms: T[],
  q: string,
  opts: { limit?: number; preferGrade?: string } = {},
): SearchHit<T>[] {
  const phrase = normalizeForSearch(q);
  const tokens = queryTokens(q);
  if (!tokens.length) return [];
  const hits: SearchHit<T>[] = [];
  for (const atom of atoms) {
    const score = scoreAtom(atom, tokens, phrase, opts.preferGrade);
    if (score > 0) hits.push({ atom, score });
  }
  hits.sort((x, y) => y.score - x.score || compareAtoms(x.atom, y.atom));
  return hits.slice(0, Math.max(1, opts.limit ?? 50));
}

/* ---------------- Nhãn chất lượng nhẹ nhàng ---------------- */

export function packageBadge(a: Pick<LessonAtom, 'hasFactoryPackage'>): { text: string; ready: boolean } {
  return a.hasFactoryPackage
    ? { text: 'Có gói kiến thức', ready: true }
    : { text: 'AI soạn từ dữ liệu cơ bản', ready: false };
}

export const BADGE_EXPLAIN =
  'Bài có gói kiến thức đã được dựng sẵn nên bám sát chương trình hơn. Bài còn lại vẫn soạn bình thường, cô/thầy chỉ cần xem lại trước khi dùng.';

export const EMPTY_SUBJECT_MESSAGE =
  'Môn này chưa có bài trong Kho. Cô/thầy vẫn soạn được bằng cách nhập tên bài.';

/* ---------------- Bài gần đây (lưu trong trình duyệt của từng người) ---------------- */

export const RECENT_KEY = 'va_recent_lessons_v1';
const RECENT_MAX = 8;

export interface RecentLesson {
  id: string;
  code: string;
  title: string;
  subject?: string;
  grade?: string;
  chapter?: string;
  hasFactoryPackage?: boolean;
}

export function readRecent(storage?: Pick<Storage, 'getItem'> | null): RecentLesson[] {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s) return [];
    const raw = s.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is RecentLesson => !!x && typeof x === 'object' && typeof (x as RecentLesson).id === 'string' && typeof (x as RecentLesson).title === 'string')
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function pushRecent(item: RecentLesson, storage?: Pick<Storage, 'getItem' | 'setItem'> | null): RecentLesson[] {
  const list = [item, ...readRecent(storage).filter((x) => x.id !== item.id)].slice(0, RECENT_MAX);
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    s?.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* trình duyệt chặn lưu trữ: bỏ qua, danh sách vẫn dùng được trong phiên */
  }
  return list;
}

/* ---------------- Bài do giáo viên tự nhập tên ---------------- */

/** Tiền tố mã bài khi giáo viên tự nhập tên bài (không có trong Kho). Phần sau là tên bài mã hoá base64url (UTF-8). */
export const FREE_LESSON_PREFIX = 'tu-do:';
/** baiDayId của luồng soạn tối đa 128 ký tự. */
const FREE_ID_MAX = 128;

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function isFreeLesson(id: string | undefined | null): boolean {
  return typeof id === 'string' && id.startsWith(FREE_LESSON_PREFIX) && id.length > FREE_LESSON_PREFIX.length;
}

/** Tên bài tự nhập -> mã an toàn (chỉ gồm A-Z a-z 0-9 - _ :), không dài quá 128 ký tự. */
export function encodeFreeLesson(title: string): string {
  let t = title.replace(/\s+/g, ' ').trim();
  while (t && FREE_LESSON_PREFIX.length + toBase64Url(t).length > FREE_ID_MAX) t = t.slice(0, -1);
  return FREE_LESSON_PREFIX + toBase64Url(t);
}

/** Mã -> tên bài tự nhập; null nếu không phải mã tự nhập hoặc hỏng. */
export function decodeFreeLesson(id: string | undefined | null): string | null {
  if (!isFreeLesson(id)) return null;
  try {
    const t = fromBase64Url((id as string).slice(FREE_LESSON_PREFIX.length)).replace(/\s+/g, ' ').trim();
    return t || null;
  } catch {
    return null;
  }
}
