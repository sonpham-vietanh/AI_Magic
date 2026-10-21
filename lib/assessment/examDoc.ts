/**
 * Bộ dựng tài liệu đề kiểm tra (hàm thuần, chạy được ở trình duyệt lẫn máy chủ):
 * ma trận + bảng đặc tả + đề + đáp án, tổng điểm luôn đúng 10.
 */
import { TT22_LABEL, TT22_LEVELS, type Tt22Level } from './tt22';
import type { ExamItemSnapshot } from './types';

export const EXAM_TOTAL_POINTS = 10;

export interface ExamDocMeta {
  school: string;
  subject: string;
  grade: string;
  minutes: number;
  examDate: string | null;
  examId: string;
}

export interface ExamDocQuestion {
  n: number;
  part: 'trac_nghiem' | 'tu_luan';
  points: number;
  text: string;
  options: string[];
  level: Tt22Level;
  atomId: string;
  atomCode: string;
  answer: string;
  solution: string;
}

export interface ExamDocCell {
  count: number;
  points: number;
}

export interface ExamDocMatrixRow {
  atomId: string;
  atomCode: string;
  title: string;
  cells: Record<Tt22Level, ExamDocCell>;
  count: number;
  points: number;
}

export interface ExamDocSpecRow {
  atomCode: string;
  title: string;
  levels: { level: Tt22Level; label: string; requirement: string; questionNos: number[] }[];
}

export interface ExamDocument {
  meta: ExamDocMeta;
  questions: ExamDocQuestion[];
  matrix: { rows: ExamDocMatrixRow[]; totals: Record<Tt22Level, ExamDocCell>; count: number; points: number };
  spec: ExamDocSpecRow[];
  shortfall: string[];
  totalPoints: number;
}

export const LEVEL_REQUIREMENT: Record<Tt22Level, string> = {
  nhan_biet: 'Nhận biết, nhớ lại, nêu hoặc nhận ra khái niệm, công thức, tính chất đã học.',
  thong_hieu: 'Giải thích, mô tả, so sánh, diễn đạt lại bằng lời của mình; áp dụng trực tiếp kiến thức.',
  van_dung: 'Vận dụng kiến thức giải quyết bài toán hoặc tình huống quen thuộc; phân tích các thành phần.',
  van_dung_cao: 'Đánh giá, sáng tạo; giải quyết vấn đề mới hoặc tình huống thực tiễn phức hợp.',
};

export const SPEC_NOTE =
  'Mô tả mức độ theo Thông tư 22/2021/TT-BGDĐT ở dạng chung. Yêu cầu cần đạt chi tiết của từng bài do tổ chuyên môn đối chiếu với Chương trình GDPT 2018 khi duyệt đề.';

/** Chia đúng `total` điểm cho n câu theo bước 0,01 (tổng luôn đúng). Trả về mảng điểm từng câu. */
export function allocatePoints(n: number, total = EXAM_TOTAL_POINTS): number[] {
  if (n <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const rem = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < rem ? 1 : 0)) / 100);
}

export const sumPoints = (xs: number[]): number => Math.round(xs.reduce((s, x) => s + Math.round(x * 100), 0)) / 100;

export const fmtPoints = (p: number): string => String(Math.round(p * 100) / 100).replace('.', ',');

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  n: 'ⁿ', '-': '⁻', '+': '⁺',
};
const SYMBOLS: [RegExp, string][] = [
  [/\\leqslant|\\leq|\\le(?![a-z])/g, '≤'],
  [/\\geqslant|\\geq|\\ge(?![a-z])/g, '≥'],
  [/\\neq|\\ne(?![a-z])/g, '≠'],
  [/\\cdot/g, '·'],
  [/\\times/g, '×'],
  [/\\div/g, '÷'],
  [/\\pm/g, '±'],
  [/\\notin/g, '∉'],
  [/\\in(?![a-z])/g, '∈'],
  [/\\cup/g, '∪'],
  [/\\cap/g, '∩'],
  [/\\subseteq|\\subset/g, '⊂'],
  [/\\infty/g, '∞'],
  [/\\pi(?![a-z])/g, 'π'],
  [/\\alpha/g, 'α'],
  [/\\beta/g, 'β'],
  [/\\Delta/g, 'Δ'],
  [/\\forall/g, '∀'],
  [/\\exists/g, '∃'],
  [/\\Rightarrow|\\implies/g, '⇒'],
  [/\\Leftrightarrow|\\iff/g, '⇔'],
  [/\\to(?![a-z])|\\rightarrow/g, '→'],
  [/\\emptyset|\\varnothing/g, '∅'],
  [/\\mathbb\{R\}/g, 'ℝ'],
  [/\\mathbb\{N\}/g, 'ℕ'],
  [/\\mathbb\{Z\}/g, 'ℤ'],
  [/\\mathbb\{Q\}/g, 'ℚ'],
  [/\\(?:,|;|:|!|quad|qquad)/g, ' '],
  [/\\(?:ldots|dots|cdots)/g, '…'],
];
const wrapIfComplex = (s: string) => (/^[\w.,]+$/.test(s.trim()) ? s.trim() : `(${s.trim()})`);

/** Đổi LaTeX đơn giản sang chữ Unicode để dùng trong Word/bản in (không cần KaTeX). */
export function latexToPlain(input: string): string {
  let s = String(input ?? '');
  s = s.replace(/\$\$|\$|\\\(|\\\)|\\\[|\\\]/g, '');
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, a: string, b: string) => `${wrapIfComplex(a)}/${wrapIfComplex(b)}`);
    s = s.replace(/\\sqrt\{([^{}]*)\}/g, (_m, a: string) => `√${wrapIfComplex(a)}`);
  }
  s = s.replace(/\\left|\\right/g, '').replace(/\\sqrt/g, '√');
  for (const [re, to] of SYMBOLS) s = s.replace(re, to);
  s = s.replace(/\^\{([^{}]*)\}|\^([0-9n+-])/g, (_m, a: string | undefined, b: string | undefined) => {
    const e = a ?? b ?? '';
    return [...e].every((c) => c in SUP) ? [...e].map((c) => SUP[c]).join('') : `^(${e})`;
  });
  s = s.replace(/[{}]/g, '').replace(/\\([a-zA-Z]+)/g, '$1');
  return s.replace(/[ \t]{2,}/g, ' ').trim();
}

const hasChoices = (it: ExamItemSnapshot) => Array.isArray(it.options) && it.options.filter((o) => o.trim()).length >= 2;

/** Dựng tài liệu đề từ các câu đã chọn. Trắc nghiệm xếp trước, tự luận sau; điểm chia để tổng đúng 10. */
export function buildExamDocument(
  items: ExamItemSnapshot[],
  matrixRows: { atomId: string; atomCode: string; title: string }[],
  shortfall: string[],
  meta: Partial<ExamDocMeta> & { examId: string },
): ExamDocument {
  const mcq = items.filter(hasChoices);
  const essay = items.filter((i) => !hasChoices(i));
  const ordered = [...mcq, ...essay];
  const pts = allocatePoints(ordered.length);
  const questions: ExamDocQuestion[] = ordered.map((it, i) => ({
    n: i + 1,
    part: hasChoices(it) ? 'trac_nghiem' : 'tu_luan',
    points: pts[i],
    text: it.noiDung,
    options: hasChoices(it) ? it.options.filter((o) => o.trim()) : [],
    level: it.tt22Level,
    atomId: it.atomId,
    atomCode: it.atomCode,
    answer: it.dapAn,
    solution: it.loiGiai,
  }));

  const rowsBase = [...matrixRows];
  for (const q of questions) {
    if (!rowsBase.some((r) => r.atomId === q.atomId)) rowsBase.push({ atomId: q.atomId, atomCode: q.atomCode, title: q.atomCode });
  }
  const zero = (): Record<Tt22Level, ExamDocCell> => ({
    nhan_biet: { count: 0, points: 0 },
    thong_hieu: { count: 0, points: 0 },
    van_dung: { count: 0, points: 0 },
    van_dung_cao: { count: 0, points: 0 },
  });
  const totals = zero();
  const rows: ExamDocMatrixRow[] = rowsBase.map((r) => {
    const cells = zero();
    for (const q of questions) {
      if (q.atomId !== r.atomId) continue;
      cells[q.level].count += 1;
      cells[q.level].points = sumPoints([cells[q.level].points, q.points]);
      totals[q.level].count += 1;
      totals[q.level].points = sumPoints([totals[q.level].points, q.points]);
    }
    const count = TT22_LEVELS.reduce((s, l) => s + cells[l].count, 0);
    return { ...r, cells, count, points: sumPoints(TT22_LEVELS.map((l) => cells[l].points)) };
  });

  const spec: ExamDocSpecRow[] = rows.map((r) => ({
    atomCode: r.atomCode,
    title: r.title,
    levels: TT22_LEVELS.map((l) => ({
      level: l,
      label: TT22_LABEL[l],
      requirement: LEVEL_REQUIREMENT[l],
      questionNos: questions.filter((q) => q.atomId === r.atomId && q.level === l).map((q) => q.n),
    })),
  }));

  return {
    meta: {
      school: meta.school?.trim() || 'Trường Việt Anh',
      subject: meta.subject?.trim() || '',
      grade: meta.grade?.trim() || '',
      minutes: meta.minutes && meta.minutes > 0 ? meta.minutes : 45,
      examDate: meta.examDate ?? null,
      examId: meta.examId,
    },
    questions,
    matrix: {
      rows,
      totals,
      count: questions.length,
      points: sumPoints(questions.map((q) => q.points)),
    },
    spec,
    shortfall,
    totalPoints: sumPoints(questions.map((q) => q.points)),
  };
}

/* ---------- Bản in (HTML an toàn, mọi chuỗi đều được thoát) ---------- */

export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const lines = (t: string) =>
  latexToPlain(t)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => esc(l))
    .join('<br>');

const PRINT_CSS = `
@page { size: A4; margin: 18mm 16mm 18mm 22mm; }
* { box-sizing: border-box; }
body { font-family: "Times New Roman", Times, serif; font-size: 13pt; line-height: 1.45; color: #000; margin: 0; }
h1 { font-size: 16pt; text-align: center; margin: 0 0 6pt; }
h2 { font-size: 14pt; margin: 14pt 0 6pt; }
.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0; }
th, td { border: 1px solid #000; padding: 4pt 6pt; vertical-align: top; font-size: 12pt; }
th { background: #eee; }
.c { text-align: center; }
.head { display: flex; justify-content: space-between; gap: 12pt; }
.head > div { flex: 1; text-align: center; }
.q { margin: 0 0 9pt; page-break-inside: avoid; }
.opt { margin-left: 18pt; }
.name { margin: 10pt 0; }
.tg { border: 1.5px solid #000; padding: 4pt 8pt; display: inline-block; font-weight: bold; margin-bottom: 8pt; }
.note { font-size: 11pt; font-style: italic; }
`;

function matrixTableHtml(d: ExamDocument): string {
  const cell = (c: ExamDocCell) => (c.count ? `${c.count} câu<br>${fmtPoints(c.points)} đ` : '–');
  const head = `<tr><th>Nguyên tử / bài</th>${TT22_LEVELS.map((l) => `<th>${esc(TT22_LABEL[l])}</th>`).join('')}<th>Tổng số câu</th><th>Điểm</th></tr>`;
  const body = d.matrix.rows
    .map(
      (r) =>
        `<tr><td>${esc(r.title)} <small>(${esc(r.atomCode)})</small></td>${TT22_LEVELS.map((l) => `<td class="c">${cell(r.cells[l])}</td>`).join('')}<td class="c">${r.count}</td><td class="c">${fmtPoints(r.points)}</td></tr>`,
    )
    .join('');
  const tot = `<tr><th>Tổng</th>${TT22_LEVELS.map((l) => `<th>${cell(d.matrix.totals[l])}</th>`).join('')}<th>${d.matrix.count}</th><th>${fmtPoints(d.matrix.points)}</th></tr>`;
  return `<table>${head}${body}${tot}</table>`;
}

function specTableHtml(d: ExamDocument): string {
  const rows = d.spec
    .flatMap((s) =>
      s.levels
        .filter((l) => l.questionNos.length)
        .map(
          (l, i, arr) =>
            `<tr>${i === 0 ? `<td rowspan="${arr.length}">${esc(s.title)}<br><small>${esc(s.atomCode)}</small></td>` : ''}<td>${esc(l.label)}</td><td>${esc(l.requirement)}</td><td class="c">${l.questionNos.join(', ')}</td></tr>`,
        ),
    )
    .join('');
  return `<table><tr><th>Nguyên tử / bài</th><th>Mức độ</th><th>Yêu cầu cần đạt</th><th>Câu số</th></tr>${rows}</table><p class="note">${esc(SPEC_NOTE)}</p>`;
}

function questionHtml(q: ExamDocQuestion): string {
  const opts = q.options.map((o, k) => `<div class="opt">${String.fromCharCode(65 + k)}. ${esc(latexToPlain(o))}</div>`).join('');
  return `<div class="q"><b>Câu ${q.n}.</b> <i>(${fmtPoints(q.points)} điểm)</i> ${lines(q.text)}${opts}</div>`;
}

function examPaperHtml(d: ExamDocument): string {
  const m = d.meta;
  const part1 = d.questions.filter((q) => q.part === 'trac_nghiem');
  const part2 = d.questions.filter((q) => q.part === 'tu_luan');
  return `<div class="page">
<div class="head"><div><b>${esc(m.school.toUpperCase())}</b><br>Mã đề: ${esc(m.examId)}</div>
<div><b>ĐỀ KIỂM TRA ĐỊNH KỲ</b><br>Môn: ${esc(m.subject || '………………')} · Khối: ${esc(m.grade || '……')}<br>Thời gian làm bài: ${m.minutes} phút${m.examDate ? ` · Ngày ${esc(m.examDate)}` : ''}</div></div>
<p class="name">Họ và tên: ………………………………………………… Lớp: …………… Mã học sinh: ……………</p>
${part1.length ? `<h2>PHẦN I. TRẮC NGHIỆM (${fmtPoints(sumPoints(part1.map((q) => q.points)))} điểm)</h2>${part1.map(questionHtml).join('')}` : ''}
${part2.length ? `<h2>PHẦN ${part1.length ? 'II' : 'I'}. TỰ LUẬN (${fmtPoints(sumPoints(part2.map((q) => q.points)))} điểm)</h2>${part2.map(questionHtml).join('')}` : ''}
${d.questions.length ? '<p class="c"><i>--- Hết ---</i></p>' : '<p>(Chưa có câu hỏi.)</p>'}
</div>`;
}

function answerKeyHtml(d: ExamDocument): string {
  const rows = d.questions
    .map(
      (q) =>
        `<tr><td class="c">${q.n}</td><td>${esc(TT22_LABEL[q.level])}</td><td class="c">${fmtPoints(q.points)}</td><td>${lines(q.answer || '(chưa có đáp án)')}${q.solution ? `<br><i>Hướng dẫn chấm: ${esc(latexToPlain(q.solution))}</i>` : ''}</td></tr>`,
    )
    .join('');
  return `<div class="page"><p class="tg">DÀNH CHO GIÁO VIÊN - KHÔNG PHÁT CHO HỌC SINH</p>
<h1>ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM</h1><p class="c">Mã đề ${esc(d.meta.examId)} · Tổng ${fmtPoints(d.totalPoints)} điểm</p>
<table><tr><th>Câu</th><th>Mức</th><th>Điểm</th><th>Đáp án / hướng dẫn chấm</th></tr>${rows}</table></div>`;
}

function matrixPageHtml(d: ExamDocument): string {
  return `<div class="page"><p class="tg">DÀNH CHO GIÁO VIÊN</p><h1>MA TRẬN ĐỀ KIỂM TRA (TT 22/2021/TT-BGDĐT)</h1>
${matrixTableHtml(d)}<h2>BẢNG ĐẶC TẢ</h2>${specTableHtml(d)}
${d.shortfall.length ? `<h2>Phần còn thiếu so với ma trận</h2><ul>${d.shortfall.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}</div>`;
}

/** part "de": chỉ đề cho học sinh. part "dap_an": ma trận + đặc tả + đáp án cho giáo viên. */
export function examPrintHtml(d: ExamDocument, part: 'de' | 'dap_an'): string {
  const body = part === 'de' ? examPaperHtml(d) : matrixPageHtml(d) + answerKeyHtml(d);
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(part === 'de' ? 'De' : 'Dap an')} ${esc(d.meta.examId)}</title><style>${PRINT_CSS}</style></head><body>${body}</body></html>`;
}

/* ---------- Quiz ---------- */

export interface QuizItem {
  n: number;
  id: string;
  bloom: string;
  noiDung: string;
  options: string[];
  dapAn: string;
  loiGiai: string;
}

export function quizPrintHtml(items: QuizItem[], title: string, withAnswers: boolean): string {
  const qs = items
    .map(
      (q) =>
        `<div class="q"><b>Câu ${q.n}.</b> ${lines(q.noiDung)}${q.options.map((o, k) => `<div class="opt">${String.fromCharCode(65 + k)}. ${esc(latexToPlain(o))}</div>`).join('')}</div>`,
    )
    .join('');
  const ans = withAnswers
    ? `<div class="page"><p class="tg">DÀNH CHO GIÁO VIÊN</p><h2>Đáp án</h2>${items
        .map((q) => `<div class="q"><b>Câu ${q.n}</b> [${esc(q.bloom)}]: ${lines(q.dapAn || '(chưa có đáp án)')}${q.loiGiai ? `<br><i>${esc(latexToPlain(q.loiGiai))}</i>` : ''}</div>`)
        .join('')}</div>`
    : '';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body><div class="page"><h1>${esc(title)}</h1>${qs || '<p>(Chưa có câu hỏi.)</p>'}</div>${ans}</body></html>`;
}

/** Quiz -> các mục văn bản thuần cho tệp Word (công thức đã đổi sang Unicode). */
export function quizPlainSections(items: QuizItem[]): { heading: string; body: string }[] {
  const q = items
    .map((i) => `Câu ${i.n}. ${latexToPlain(i.noiDung)}${i.options.map((o, k) => `\n   ${String.fromCharCode(65 + k)}. ${latexToPlain(o)}`).join('')}`)
    .join('\n\n');
  const a = items
    .map((i) => `Câu ${i.n} [${i.bloom}]: ${latexToPlain(i.dapAn) || '(chưa có đáp án)'}${i.loiGiai ? `\n   Giải thích: ${latexToPlain(i.loiGiai)}` : ''}`)
    .join('\n\n');
  return [
    { heading: 'Câu hỏi', body: q || '(Chưa có câu hỏi.)' },
    { heading: 'Đáp án và giải thích (dành cho giáo viên)', body: a || '(Không có.)' },
  ];
}
