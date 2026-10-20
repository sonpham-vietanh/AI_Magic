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
  TextRun,
} from 'docx';

const FONT = 'Times New Roman';
const SCHOOL = 'Trường Việt Anh';
const A4 = { width: 11906, height: 16838 };

export interface DocxSection {
  heading: string;
  body: string;
}

export interface DocxInput {
  title: string;
  subtitle?: string[];
  sections: DocxSection[];
  pageBreakBetweenSections?: boolean;
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

function bodyParagraphs(body: string): Paragraph[] {
  return String(body ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(
      (line) =>
        new Paragraph({
          spacing: { after: 80, line: 340 },
          children: [new TextRun({ text: line, font: FONT, size: 26 })],
        }),
    );
}

export async function buildDocxBlob(input: DocxInput): Promise<Blob> {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: input.title, font: FONT, size: 30, bold: true }),
      ],
    }),
    ...(input.subtitle ?? []).map(
      (t) =>
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [new TextRun({ text: t, font: FONT, size: 24 })],
        }),
    ),
  ];

  input.sections.forEach((sec, idx) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: !!input.pageBreakBetweenSections && idx > 0,
        spacing: { before: 280, after: 140 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 2 },
        },
        children: [
          new TextRun({
            text: sec.heading,
            font: FONT,
            size: 28,
            bold: true,
            color: '0D0E2B',
          }),
        ],
      }),
      ...bodyParagraphs(sec.body),
    );
  });

  const doc = new Document({
    creator: SCHOOL,
    title: input.title,
    styles: { default: { document: { run: { font: FONT, size: 26 } } } },
    sections: [
      {
        properties: {
          page: {
            size: A4,
            margin: { top: 1134, bottom: 1134, left: 1701, right: 1134 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                border: {
                  bottom: { style: BorderStyle.SINGLE, size: 8, color: '0D0E2B', space: 2 },
                },
                children: [
                  new TextRun({ text: SCHOOL.toUpperCase(), font: FONT, size: 24, bold: true }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: ['Trang ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES],
                    font: FONT,
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
        },
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

export function buildLessonPackDocx(pack: PackLike): Promise<Blob> {
  return buildDocxBlob({
    title: 'TRỌN BỘ HỒ SƠ BÀI DẠY (4 TRONG 1)',
    subtitle: [
      `[${pack.atomCode}] ${pack.atomTitle}`,
      `Môn: ${pack.subject} · Lớp: ${pack.className} · Giáo viên: ${pack.teacherName}`,
    ],
    sections: pack.sections.map((s) => ({ heading: s.docHeading, body: s.content })),
    pageBreakBetweenSections: true,
  });
}

interface AssetLike {
  id: string;
  packageId: string;
  formatLabel: string;
  sections: { heading: string; body: string }[];
}

export function buildFactoryAssetDocx(asset: AssetLike): Promise<Blob> {
  return buildDocxBlob({
    title: asset.formatLabel.toUpperCase(),
    subtitle: [`Mã: ${asset.id} · Gói kiến thức: ${asset.packageId}`],
    sections: asset.sections,
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
