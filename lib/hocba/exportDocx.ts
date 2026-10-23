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

const FONT = 'Times New Roman';

export interface DocxRow {
  ten: string;
  nhanXet: string;
}

/** Bảng nhận xét học bạ (STT, Họ và tên, Nhận xét) dạng .docx, chạy trong trình duyệt, không gửi dữ liệu đi đâu. */
export async function buildHocBaDocx(opts: { title: string; subtitle: string; rows: DocxRow[] }): Promise<Blob> {
  const line = { style: BorderStyle.SINGLE, size: 4, color: '7A8BA3' };
  const borders = { top: line, bottom: line, left: line, right: line };
  const cell = (text: string, width: number, bold = false, align?: (typeof AlignmentType)[keyof typeof AlignmentType]) =>
    new TableCell({
      width: { size: width, type: WidthType.PERCENTAGE },
      borders,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: text.split('\n').map(
        (t) =>
          new Paragraph({
            alignment: align,
            children: [new TextRun({ text: t, font: FONT, size: 24, bold })],
          }),
      ),
    });

  const header = new TableRow({
    tableHeader: true,
    children: [cell('STT', 7, true, AlignmentType.CENTER), cell('Họ và tên', 23, true), cell('Nhận xét', 70, true)],
  });
  const body = opts.rows.map(
    (r, i) => new TableRow({ cantSplit: true, children: [cell(String(i + 1), 7, false, AlignmentType.CENTER), cell(r.ten, 23), cell(r.nhanXet, 70)] }),
  );

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: ['Trang ', PageNumber.CURRENT], font: FONT, size: 20 })],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({ text: opts.title.toUpperCase(), font: FONT, size: 30, bold: true })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [new TextRun({ text: opts.subtitle, font: FONT, size: 24, italics: true })],
          }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...body] }),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}
