import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type ParagraphChild,
} from 'docx';
import { isoToVi } from '@/lib/text/date';
import { richParagraphs, richRuns, cleanLine } from './richText';

const FONT = 'Times New Roman';
const SCHOOL = 'Trường Việt Anh';
const A4 = { width: 11906, height: 16838 };
const MARGIN = { top: 1134, bottom: 1134, left: 1701, right: 1134 };
const CONTENT_W = A4.width - MARGIN.left - MARGIN.right;

/** Dòng đóng dấu ở đầu và chân trang khi bản chưa được người duyệt. */
export const DRAFT_STAMP = 'BẢN NHÁP, CHƯA DUYỆT';
export const DRAFT_NOTE = 'Bản nháp do trợ lý soạn, chưa được người duyệt. Cô/thầy đọc kỹ và chỉnh trước khi dùng chính thức.';

export interface ExportOptions {
  /** true: đóng dấu "BẢN NHÁP, CHƯA DUYỆT" ở đầu trang và chân trang. Tắt khi bản đã duyệt. */
  draft?: boolean;
}

export interface DocxSection {
  heading: string;
  body: string;
}

export interface DocxInput extends ExportOptions {
  title: string;
  subtitle?: string[];
  sections: DocxSection[];
  pageBreakBetweenSections?: boolean;
  /** 'khbd': trình bày Kế hoạch bài dạy theo Phụ lục IV (CV 5512) bằng bảng. Mặc định tự nhận biết từ nội dung. */
  kind?: 'khbd' | 'generic';
  /** Ngày dạy dạng yyyy-mm-dd hoặc dd/mm/yyyy (để trống thì để dòng chấm cho giáo viên điền). */
  teachDate?: string;
  teacherName?: string;
  /** Ngày soạn (mặc định: hôm nay). Chỉ dùng để kiểm thử. */
  today?: Date;
}

/** Escape text for safe insertion into HTML (print fallback etc). */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- Kế hoạch bài dạy theo Phụ lục IV ---------- */

export interface KhbdField {
  key: string;
  label: string;
  lines: string[];
}
export interface KhbdActivity {
  n: number;
  title: string;
  intro: string[];
  fields: KhbdField[];
}

const FIELD_LABEL: Record<string, string> = { a: 'a) Mục tiêu', b: 'b) Nội dung', c: 'c) Sản phẩm', d: 'd) Tổ chức thực hiện' };
const ACT_RE = /^\s*Hoạt động\s*(\d+)\s*[:.\-–—]?\s*(.*)$/i;
const FIELD_RE = /^\s{0,2}([a-dđ])\)\s*(.*)$/i;

/** Tách thân mục thành các hoạt động và trường a/b/c/d. Trả mảng rỗng nếu không thấy "Hoạt động N". */
export function parseKhbdActivities(sections: DocxSection[]): { pre: DocxSection[]; acts: KhbdActivity[]; post: DocxSection[] } {
  const pre: DocxSection[] = [];
  const post: DocxSection[] = [];
  const acts: KhbdActivity[] = [];
  let seenAct = false;
  for (const sec of sections) {
    const headAct = ACT_RE.exec(sec.heading.trim());
    const hasActInBody = sec.body.split('\n').some((l) => ACT_RE.test(l));
    if (!headAct && !hasActInBody) {
      (seenAct ? post : pre).push(sec);
      continue;
    }
    seenAct = true;
    const lines = sec.body.replace(/\r\n?/g, '\n').split('\n');
    let cur: KhbdActivity | null = null;
    let field: KhbdField | null = null;
    const startAct = (n: number, title: string) => {
      cur = { n, title: title.trim(), intro: [], fields: [] };
      acts.push(cur);
      field = null;
    };
    if (headAct) startAct(Number(headAct[1]), headAct[2]);
    else if (sec.heading.trim()) {
      // Mục "Tiến trình dạy học": giữ tiêu đề làm phần dẫn.
      pre.push({ heading: sec.heading, body: '' });
    }
    for (const raw of lines) {
      const am = ACT_RE.exec(raw);
      if (am) {
        startAct(Number(am[1]), am[2]);
        continue;
      }
      const fm = FIELD_RE.exec(raw);
      if (cur && fm) {
        const key = fm[1].toLowerCase() === 'đ' ? 'd' : fm[1].toLowerCase();
        const rest = fm[2];
        const colon = /^((?:Mục tiêu|Nội dung|Sản phẩm|Tổ chức thực hiện)[^:]{0,30}):\s*(.*)$/i.exec(rest);
        const label = colon ? `${key}) ${colon[1].trim()}` : (FIELD_LABEL[key] ?? `${key})`);
        field = { key, label, lines: [] };
        const first = colon ? colon[2] : rest;
        if (first.trim()) field.lines.push(first.trim());
        (cur as KhbdActivity).fields.push(field);
        continue;
      }
      if (!cur) continue;
      if (!raw.trim()) continue;
      if (field) (field as KhbdField).lines.push(raw.replace(/\s+$/, ''));
      else (cur as KhbdActivity).intro.push(raw.trim());
    }
  }
  return { pre, acts: acts.filter((a) => a.fields.length > 0 || a.intro.length > 0), post };
}

const THIN = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };

const body13 = { font: FONT, size: 26 };

function cell(children: Paragraph[], width: number, o: { shade?: string; span?: number; borders?: Record<'top' | 'bottom' | 'left' | 'right', { style: (typeof BorderStyle)[keyof typeof BorderStyle]; size: number; color: string }> } = {}): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: o.span,
    verticalAlign: VerticalAlign.TOP,
    shading: o.shade ? { fill: o.shade } : undefined,
    borders: o.borders ?? BORDERS,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: children.length ? children : [new Paragraph({ children: [] })],
  });
}

function labelPara(text: string): Paragraph {
  return new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text, font: FONT, size: 26, bold: true })] });
}

function activityTable(a: KhbdActivity): Table {
  const L = 2000;
  const R = CONTENT_W - L;
  const rows: TableRow[] = [
    new TableRow({
      cantSplit: true,
      children: [
        cell(
          [new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: `Hoạt động ${a.n}${a.title ? `: ${cleanLine(a.title)}` : ''}`, font: FONT, size: 26, bold: true })] })],
          CONTENT_W,
          { span: 2, shade: 'E8EAF6' },
        ),
      ],
    }),
  ];
  if (a.intro.length) {
    rows.push(new TableRow({ children: [cell(richParagraphs(a.intro.join('\n'), { ...body13, after: 60, line: 300 }), CONTENT_W, { span: 2 })] }));
  }
  for (const f of a.fields) {
    rows.push(
      new TableRow({
        children: [cell([labelPara(f.label)], L, { shade: 'F5F6FA' }), cell(richParagraphs(f.lines.join('\n') || ' ', { ...body13, after: 60, line: 300 }), R)],
      }),
    );
  }
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [L, R], rows });
}

function dotted(n = 24): string {
  return '.'.repeat(n);
}

function headBlock(input: DocxInput, today: string): (Paragraph | Table)[] {
  const half = Math.floor(CONTENT_W / 2);
  const para = (t: string, bold = false, align?: (typeof AlignmentType)[keyof typeof AlignmentType]) =>
    new Paragraph({ alignment: align, spacing: { after: 40 }, children: [new TextRun({ text: t, font: FONT, size: 26, bold })] });
  const teach = input.teachDate ? isoToVi(input.teachDate) : '...../...../..........';
  return [
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [half, CONTENT_W - half],
      rows: [
        new TableRow({
          children: [
            cell([para(SCHOOL.toUpperCase(), true, AlignmentType.CENTER), para(`Tổ: ${dotted(18)}`, false, AlignmentType.CENTER)], half, { borders: NO_BORDERS }),
            cell(
              [
                para(`Giáo viên: ${input.teacherName?.trim() || dotted(20)}`),
                para(`Ngày soạn: ${today}`),
                para(`Ngày dạy: ${teach}`),
              ],
              CONTENT_W - half,
              { borders: NO_BORDERS },
            ),
          ],
        }),
      ],
    }),
  ];
}

function signOff(): (Paragraph | Table)[] {
  const third = Math.floor(CONTENT_W / 2);
  const col = (a: string, b: string) => [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 40 }, children: [new TextRun({ text: a, font: FONT, size: 26, bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 700 }, children: [new TextRun({ text: b, font: FONT, size: 24, italics: true })] }),
  ];
  return [
    new Paragraph({ spacing: { before: 240, after: 60 }, children: [new TextRun({ text: 'Ghi chú sau tiết dạy (rút kinh nghiệm): ' + dotted(60), font: FONT, size: 26 })] }),
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: dotted(100), font: FONT, size: 26 })] }),
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [third, CONTENT_W - third],
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            cell(col('TỔ TRƯỞNG CHUYÊN MÔN', '(Ký, ghi rõ họ tên)'), third, { borders: NO_BORDERS }),
            cell(col('GIÁO VIÊN', '(Ký, ghi rõ họ tên)'), CONTENT_W - third, { borders: NO_BORDERS }),
          ],
        }),
      ],
    }),
  ];
}

function h1(text: string, input: DocxInput, idx: number): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: !!input.pageBreakBetweenSections && idx > 0,
    keepNext: true,
    spacing: { before: 280, after: 140 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 2 } },
    children: richRuns(text, { font: FONT, size: 28, bold: true, color: '0D0E2B' }),
  });
}

function titleParas(input: DocxInput): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 120 },
      children: richRuns(input.title, { font: FONT, size: 30, bold: true }),
    }),
    ...(input.subtitle ?? []).map(
      (t) =>
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: richRuns(t, { font: FONT, size: 24 }),
        }),
    ),
  ];
}

export function isKhbdInput(input: Pick<DocxInput, 'kind' | 'sections'>): boolean {
  if (input.kind === 'generic') return false;
  if (input.kind === 'khbd') return true;
  const all = input.sections.map((s) => `${s.heading}\n${s.body}`).join('\n');
  return /Hoạt động\s*1\b/i.test(all) && /Tổ chức thực hiện/i.test(all);
}

function genericBody(input: DocxInput): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  input.sections.forEach((sec, idx) => {
    if (sec.heading.trim()) out.push(h1(sec.heading, input, idx));
    out.push(...richParagraphs(sec.body, body13));
  });
  return out;
}

function khbdBody(input: DocxInput): (Paragraph | Table)[] {
  const { pre, acts, post } = parseKhbdActivities(input.sections);
  if (acts.length === 0) return genericBody(input);
  const out: (Paragraph | Table)[] = [];
  const sectionHead = (t: string) =>
    new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 240, after: 100 }, children: richRuns(t, { font: FONT, size: 28, bold: true }) });
  for (const sec of pre) {
    if (sec.heading.trim()) out.push(sectionHead(sec.heading));
    if (sec.body.trim()) out.push(...richParagraphs(sec.body, body13));
  }
  if (!pre.some((s) => /tiến trình/i.test(s.heading))) out.push(sectionHead('III. TIẾN TRÌNH DẠY HỌC'));
  for (const a of acts) {
    out.push(activityTable(a), new Paragraph({ spacing: { after: 120 }, children: [] }));
  }
  for (const sec of post) {
    if (sec.heading.trim()) out.push(sectionHead(sec.heading));
    out.push(...richParagraphs(sec.body, body13));
  }
  out.push(...signOff());
  return out;
}

export function stampPara(size: number): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    shading: { fill: 'FEF3C7' },
    border: {
      top: { style: BorderStyle.SINGLE, size: 6, color: 'B45309', space: 2 },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: 'B45309', space: 2 },
    },
    children: [new TextRun({ text: DRAFT_STAMP, font: 'Arial', size, bold: true, color: '7C2D12' })],
  });
}

export async function buildDocxBlob(input: DocxInput): Promise<Blob> {
  const khbd = isKhbdInput(input);
  const today = (() => {
    const d = input.today ?? new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  })();
  const children: (Paragraph | Table)[] = [
    ...titleParas(input),
    ...(khbd ? headBlock(input, today) : []),
    ...(khbd ? khbdBody(input) : genericBody(input)),
  ];
  if (input.draft) {
    children.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: DRAFT_NOTE, font: FONT, size: 22, italics: true, color: '7C2D12' })] }));
  }

  const headerChildren: Paragraph[] = [];
  if (input.draft) headerChildren.push(stampPara(22));
  headerChildren.push(
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '0D0E2B', space: 2 } },
      children: [new TextRun({ text: SCHOOL.toUpperCase(), font: FONT, size: 24, bold: true })],
    }),
  );
  const footerChildren: Paragraph[] = [];
  if (input.draft) footerChildren.push(stampPara(18));
  const pageNo: ParagraphChild = new TextRun({
    children: ['Trang ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES],
    font: FONT,
    size: 20,
  });
  footerChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [pageNo] }));

  const doc = new Document({
    creator: SCHOOL,
    title: input.title,
    styles: { default: { document: { run: { font: FONT, size: 26 } } } },
    sections: [
      {
        properties: { page: { size: A4, margin: MARGIN } },
        headers: { default: new Header({ children: headerChildren }) },
        footers: { default: new Footer({ children: footerChildren }) },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}

interface PackLike {
  atomCode: string;
  atomTitle: string;
  subject: string;
  className: string;
  teacherName: string;
  sections: { docHeading: string; content: string }[];
}

export function buildLessonPackDocx(pack: PackLike, opts: ExportOptions = {}): Promise<Blob> {
  return buildDocxBlob({
    title: 'TRỌN BỘ HỒ SƠ BÀI DẠY (4 TRONG 1)',
    subtitle: [
      `[${pack.atomCode}] ${pack.atomTitle}`,
      `Môn: ${pack.subject} · Lớp: ${pack.className} · Giáo viên: ${pack.teacherName}`,
    ],
    sections: pack.sections.map((s) => ({ heading: s.docHeading, body: s.content })),
    pageBreakBetweenSections: true,
    kind: 'generic',
    ...opts,
  });
}

interface AssetLike {
  id: string;
  packageId: string;
  formatLabel: string;
  sections: { heading: string; body: string }[];
}

export function buildFactoryAssetDocx(asset: AssetLike, opts: ExportOptions = {}): Promise<Blob> {
  return buildDocxBlob({
    title: asset.formatLabel.toUpperCase(),
    subtitle: [`Mã: ${asset.id} · Gói kiến thức: ${asset.packageId}`],
    sections: asset.sections,
    kind: 'generic',
    ...opts,
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
