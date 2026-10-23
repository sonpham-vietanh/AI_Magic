// Tìm bài từ câu gõ tự nhiên: ưu tiên môn/khối đang chọn, nhưng TÌM CHÉO khối và môn khi bài nằm ở nơi khác
// ("Định lí Pythagore" gõ ở Toán 10 thì thấy ở Toán 7). Dùng API tra cứu của Kho (GET /api/kho/library,
// subject=all & grade=all, tìm không dấu, có xếp hạng), không bịa dữ liệu.
import { matchLessons, pickConfident, stripDiacritics, type Intent } from './intent';

export interface FoundLesson {
  id: string;
  code: string;
  title: string;
  /** Mã môn của ứng dụng ('toan', 'vat_ly'...). */
  subject: string;
  subjectLabel: string;
  grade: string;
  chapter?: string;
  chapterNo?: number;
  hasFactoryPackage?: boolean;
}

export type LessonSearchResult =
  /** Bài đúng và duy nhất ở môn/khối đang chọn: có thể chọn luôn. */
  | { kind: 'sure'; lesson: FoundLesson }
  /** Vài bài gần giống ở môn/khối đang chọn. */
  | { kind: 'here'; lessons: FoundLesson[] }
  /** Bài khớp hơn nằm ở môn/khối khác: gợi ý chuyển. */
  | { kind: 'cross'; lessons: FoundLesson[]; hereCount: number }
  | { kind: 'none' }
  | { kind: 'error'; message: string };

type Fetcher = (input: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

interface RawItem {
  atomId?: unknown;
  code?: unknown;
  title?: unknown;
  subject?: unknown;
  subjectName?: unknown;
  grade?: unknown;
  chapterLabel?: unknown;
  chapterNo?: unknown;
  hasPackage?: unknown;
}

export function toFound(a: RawItem): FoundLesson | null {
  if (typeof a.atomId !== 'string' || typeof a.title !== 'string' || !a.atomId || !a.title) return null;
  return {
    id: a.atomId,
    code: typeof a.code === 'string' ? a.code : '',
    title: a.title,
    subject: typeof a.subject === 'string' ? a.subject : '',
    subjectLabel: typeof a.subjectName === 'string' ? a.subjectName : '',
    grade: a.grade === undefined || a.grade === null ? '' : String(a.grade),
    chapter: typeof a.chapterLabel === 'string' ? a.chapterLabel : undefined,
    chapterNo: typeof a.chapterNo === 'number' ? a.chapterNo : undefined,
    hasFactoryPackage: a.hasPackage === true,
  };
}

async function fetchLibrary(f: Fetcher, params: Record<string, string>, signal?: AbortSignal): Promise<FoundLesson[]> {
  const qs = new URLSearchParams(params).toString();
  const res = await f(`/api/kho/library?${qs}`, { signal });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: RawItem[] };
  if (!res.ok || !j.ok) throw new Error(`HTTP ${res.status}`);
  return (j.items ?? []).map(toFound).filter((x): x is FoundLesson => x !== null);
}

/** Số cuối cùng trong mã bài (TO07-C04-D03 → 3): dùng khi gõ "bài 3 chương 4". */
export function lessonOrdinal(code: string): number | null {
  const m = /(\d+)\s*$/.exec(code);
  return m ? Number(m[1]) : null;
}

const asLike = (l: FoundLesson) => ({ id: l.id, code: l.code, title: l.title });

export interface SearchScope {
  subject: string;
  grade: string;
}

/**
 * Tìm bài theo ý định. `scope` là môn/khối đang chọn; nếu câu nói rõ môn hoặc khối thì lấy cái đã nói làm phạm vi.
 */
export async function searchLessons(
  intent: Intent,
  scope: SearchScope,
  opts: { fetcher?: Fetcher; signal?: AbortSignal } = {},
): Promise<LessonSearchResult> {
  const f: Fetcher = opts.fetcher ?? ((u, i) => fetch(u, i));
  const target: SearchScope = { subject: intent.subject ?? scope.subject, grade: intent.grade ?? scope.grade };
  try {
    // Theo số chương / số bài: tra trong đúng môn và khối.
    if ((intent.chapterNo || intent.lessonNo) && !intent.lessonQuery) {
      let list = await fetchLibrary(f, { subject: target.subject, grade: target.grade, limit: '500' }, opts.signal);
      if (intent.chapterNo) list = list.filter((l) => l.chapterNo === intent.chapterNo);
      if (intent.lessonNo) {
        const byNo = list.filter((l) => lessonOrdinal(l.code) === intent.lessonNo);
        if (byNo.length) list = byNo;
      }
      if (list.length === 0) return { kind: 'none' };
      return list.length === 1 && intent.lessonNo ? { kind: 'sure', lesson: list[0] } : { kind: 'here', lessons: list.slice(0, 6) };
    }
    if (!intent.lessonQuery) return { kind: 'none' };

    const all = await fetchLibrary(
      f,
      { subject: 'all', grade: 'all', q: intent.lessonQuery, preferGrade: target.grade, limit: '40' },
      opts.signal,
    );
    const ranked = matchLessons(intent.lessonQuery, all.map(asLike), 40);
    const byId = new Map(all.map((l) => [l.id, l]));
    let scored = ranked.map((r) => ({ lesson: byId.get(r.lesson.id)!, score: r.score }));
    scored.sort((x, y) => y.score - x.score || x.lesson.title.length - y.lesson.title.length);
    if (intent.chapterNo) scored = scored.filter((s) => s.lesson.chapterNo === intent.chapterNo);
    if (intent.lessonNo) {
      const byNo = scored.filter((s) => lessonOrdinal(s.lesson.code) === intent.lessonNo);
      if (byNo.length) scored = byNo;
    }
    if (scored.length === 0) return { kind: 'none' };

    const isHere = (l: FoundLesson) => (!l.subject || l.subject === target.subject) && l.grade === target.grade;
    const here = scored.filter((s) => isHere(s.lesson));
    const bestAny = scored[0].score;
    const bestHere = here[0]?.score ?? 0;
    const explicit = Boolean(intent.subject || intent.grade);

    if (here.length > 0 && (explicit || bestHere >= bestAny - 0.001)) {
      const sure = pickConfident(here.map((h) => ({ lesson: asLike(h.lesson), score: h.score })));
      if (sure) return { kind: 'sure', lesson: byId.get(sure.id)! };
      return { kind: 'here', lessons: here.slice(0, 6).map((h) => h.lesson) };
    }
    // Bài khớp hơn nằm ở nơi khác: gợi ý các bài đứng đầu ngoài phạm vi đang chọn.
    const top = scored.filter((s) => s.score >= bestAny - 0.001 && !isHere(s.lesson)).slice(0, 4);
    return { kind: 'cross', lessons: top.map((t) => t.lesson), hereCount: here.length };
  } catch {
    if (opts.signal?.aborted) return { kind: 'none' };
    return { kind: 'error', message: 'Mình chưa tra được danh sách bài lúc này. Cô/thầy thử lại hoặc gõ tên bài ở ô tìm bên dưới.' };
  }
}

/** "Toán lớp 7" cho nút gợi ý. */
export function lessonPlace(l: FoundLesson): string {
  return `${l.subjectLabel || 'Môn khác'} lớp ${l.grade}`;
}

/** Bài kế tiếp trong danh sách theo thứ tự mã bài (chương trước, bài sau); null nếu hết hoặc không thấy bài hiện tại. */
export function nextLessonAfter<T extends { id: string; code: string }>(list: T[], currentId: string): T | null {
  const sorted = [...list].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
  const i = sorted.findIndex((l) => l.id === currentId);
  if (i < 0 || i + 1 >= sorted.length) return null;
  return sorted[i + 1];
}

/** Bài đầu tiên của danh sách theo thứ tự mã bài. */
export function firstLesson<T extends { code: string }>(list: T[]): T | null {
  if (list.length === 0) return null;
  return [...list].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))[0];
}

/** Tải toàn bộ bài của một môn và khối (tối đa 500) để tìm "bài tiếp theo". */
export async function loadLessonList(
  subject: string,
  grade: string,
  opts: { fetcher?: Fetcher; signal?: AbortSignal } = {},
): Promise<FoundLesson[]> {
  const f: Fetcher = opts.fetcher ?? ((u, i) => fetch(u, i));
  try {
    return await fetchLibrary(f, { subject, grade, limit: '500' }, opts.signal);
  } catch {
    return [];
  }
}

export { stripDiacritics };
