import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { TT22_LABEL, TT22_LEVELS } from '@/lib/assessment/tt22';
import { SPEC_NOTE, fmtPoints, latexToPlain, sumPoints, type ExamDocument } from '@/lib/assessment/examDoc';

const FONT = 'Times New Roman';
const run = (text: string, o: { bold?: boolean; italics?: boolean; size?: number } = {}) =>
  new TextRun({ text, font: FONT, size: o.size ?? 26, bold: o.bold, italics: o.italics });
const para = (text: string, o: { bold?: boolean; italics?: boolean; size?: number; center?: boolean; pageBreak?: boolean; after?: number } = {}) =>
  new Paragraph({
    alignment: o.center ? AlignmentType.CENTER : undefined,
    pageBreakBefore: o.pageBreak,
    spacing: { after: o.after ?? 100, line: 320 },
    children: [run(text, o)],
  });
const multi = (text: string, o: { bold?: boolean; italics?: boolean; size?: number } = {}) =>
  latexToPlain(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => para(l, o));

const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const borders = { top: border, bottom: border, left: border, right: border };
const cell = (text: string, o: { bold?: boolean; center?: boolean; width?: number; span?: number; rowSpan?: number } = {}) =>
  new TableCell({
    borders,
    columnSpan: o.span,
    rowSpan: o.rowSpan,
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: text
      .split('\n')
      .map((t) => new Paragraph({ alignment: o.center ? AlignmentType.CENTER : undefined, children: [run(t, { bold: o.bold, size: 22 })] })),
  });
const table = (rows: TableRow[]) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });

export function examDocxChildren(d: ExamDocument): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const cellTxt = (c: { count: number; points: number }) => (c.count ? `${c.count} câu\n${fmtPoints(c.points)} đ` : '–');

  // Trang 1: ma trận + đặc tả
  out.push(para('MA TRẬN ĐỀ KIỂM TRA ĐỊNH KỲ', { bold: true, center: true, size: 30 }));
  out.push(para(`Theo Thông tư 22/2021/TT-BGDĐT · Mã đề ${d.meta.examId} · Dành cho giáo viên`, { center: true, size: 22, italics: true }));
  out.push(
    table([
      new TableRow({
        tableHeader: true,
        children: [
          cell('Nguyên tử / bài', { bold: true }),
          ...TT22_LEVELS.map((l) => cell(TT22_LABEL[l], { bold: true, center: true })),
          cell('Tổng số câu', { bold: true, center: true }),
          cell('Điểm', { bold: true, center: true }),
        ],
      }),
      ...d.matrix.rows.map(
        (r) =>
          new TableRow({
            children: [
              cell(`${r.title}\n(${r.atomCode})`),
              ...TT22_LEVELS.map((l) => cell(cellTxt(r.cells[l]), { center: true })),
              cell(String(r.count), { center: true }),
              cell(fmtPoints(r.points), { center: true }),
            ],
          }),
      ),
      new TableRow({
        children: [
          cell('Tổng', { bold: true }),
          ...TT22_LEVELS.map((l) => cell(cellTxt(d.matrix.totals[l]), { bold: true, center: true })),
          cell(String(d.matrix.count), { bold: true, center: true }),
          cell(fmtPoints(d.matrix.points), { bold: true, center: true }),
        ],
      }),
    ]),
  );
  if (d.shortfall.length) {
    out.push(para('Phần còn thiếu so với ma trận (hệ thống không tự bịa câu hỏi):', { bold: true, size: 22 }));
    d.shortfall.forEach((s) => out.push(para(`- ${s}`, { size: 22 })));
  }
  out.push(para('BẢNG ĐẶC TẢ', { bold: true, center: true, size: 28, after: 120 }));
  const specRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [cell('Nguyên tử / bài', { bold: true }), cell('Mức độ', { bold: true }), cell('Yêu cầu cần đạt', { bold: true }), cell('Câu số', { bold: true, center: true })],
    }),
  ];
  for (const s of d.spec) {
    const lv = s.levels.filter((l) => l.questionNos.length);
    lv.forEach((l, i) =>
      specRows.push(
        new TableRow({
          children: [
            ...(i === 0 ? [cell(`${s.title}\n(${s.atomCode})`, { rowSpan: lv.length })] : []),
            cell(l.label),
            cell(l.requirement),
            cell(l.questionNos.join(', '), { center: true }),
          ],
        }),
      ),
    );
  }
  out.push(table(specRows));
  out.push(para(SPEC_NOTE, { italics: true, size: 20 }));

  // Đề
  const m = d.meta;
  out.push(para(m.school.toUpperCase(), { bold: true, pageBreak: true, after: 40 }));
  out.push(para('ĐỀ KIỂM TRA ĐỊNH KỲ', { bold: true, center: true, size: 30, after: 40 }));
  out.push(para(`Môn: ${m.subject || '………………'}   Khối: ${m.grade || '……'}   Mã đề: ${m.examId}`, { center: true, size: 24, after: 40 }));
  out.push(para(`Thời gian làm bài: ${m.minutes} phút${m.examDate ? `   Ngày thi: ${m.examDate}` : ''}`, { center: true, size: 24 }));
  out.push(para('Họ và tên: ………………………………………………   Lớp: ……………   Mã học sinh: ……………', { size: 24, after: 160 }));
  const part1 = d.questions.filter((q) => q.part === 'trac_nghiem');
  const part2 = d.questions.filter((q) => q.part === 'tu_luan');
  const emit = (title: string, qs: typeof d.questions) => {
    if (!qs.length) return;
    out.push(para(`${title} (${fmtPoints(sumPoints(qs.map((q) => q.points)))} điểm)`, { bold: true, after: 100 }));
    for (const q of qs) {
      const lines = latexToPlain(q.text).split('\n').map((l) => l.trim()).filter(Boolean);
      out.push(
        new Paragraph({
          spacing: { after: 60, line: 320 },
          children: [run(`Câu ${q.n}. `, { bold: true }), run(`(${fmtPoints(q.points)} điểm) `, { italics: true }), run(lines[0] ?? '')],
        }),
      );
      lines.slice(1).forEach((l) => out.push(para(l)));
      q.options.forEach((o, k) =>
        out.push(new Paragraph({ indent: { left: 400 }, spacing: { after: 40 }, children: [run(`${String.fromCharCode(65 + k)}. ${latexToPlain(o)}`)] })),
      );
      if (q.part === 'tu_luan') out.push(para('', { after: 400 }));
    }
  };
  emit('PHẦN I. TRẮC NGHIỆM', part1);
  emit(part1.length ? 'PHẦN II. TỰ LUẬN' : 'PHẦN I. TỰ LUẬN', part2);
  out.push(para(d.questions.length ? '--- Hết ---' : '(Chưa có câu hỏi.)', { center: true, italics: true }));

  // Đáp án
  out.push(para('DÀNH CHO GIÁO VIÊN - KHÔNG PHÁT CHO HỌC SINH', { bold: true, center: true, pageBreak: true, size: 22 }));
  out.push(para('ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM', { bold: true, center: true, size: 30, after: 40 }));
  out.push(para(`Mã đề ${m.examId} · Tổng ${fmtPoints(d.totalPoints)} điểm`, { center: true, size: 22 }));
  out.push(
    table([
      new TableRow({
        tableHeader: true,
        children: [cell('Câu', { bold: true, center: true }), cell('Mức', { bold: true }), cell('Điểm', { bold: true, center: true }), cell('Đáp án / hướng dẫn chấm', { bold: true })],
      }),
      ...d.questions.map(
        (q) =>
          new TableRow({
            children: [
              cell(String(q.n), { center: true }),
              cell(TT22_LABEL[q.level]),
              cell(fmtPoints(q.points), { center: true }),
              cell(`${latexToPlain(q.answer) || '(chưa có đáp án)'}${q.solution ? `\nHướng dẫn chấm: ${latexToPlain(q.solution)}` : ''}`),
            ],
          }),
      ),
    ]),
  );
  return out;
}

export async function buildExamDocxBlob(d: ExamDocument): Promise<Blob> {
  const doc = new Document({
    creator: d.meta.school,
    title: `Đề kiểm tra ${d.meta.examId}`,
    styles: { default: { document: { run: { font: FONT, size: 26 } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 1134 } } },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Trang ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], font: FONT, size: 20 })] })],
          }),
        },
        children: examDocxChildren(d),
      },
    ],
  });
  return Packer.toBlob(doc);
}
