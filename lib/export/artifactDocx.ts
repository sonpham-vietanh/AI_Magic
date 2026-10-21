// Dựng tệp Word (.docx) cho từng loại sản phẩm. Dùng thư viện `docx` đã có.
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
import type { Artifact } from '@/lib/resources/types';

const FONT = 'Arial';
const SCHOOL = 'Trường Việt Anh';
const A4 = { width: 11906, height: 16838 };
const NAVY = '14153A';

type Block =
  | { k: 'title'; text: string; sub?: string }
  | { k: 'h1' | 'h2'; text: string; pageBreak?: boolean }
  | { k: 'p'; text: string; italic?: boolean; bold?: boolean }
  | { k: 'bullet'; text: string }
  | { k: 'numbered'; n: number; text: string; tag?: string }
  | { k: 'speaker'; who: string; text: string }
  | { k: 'rule'; count: number }
  | { k: 'info'; text: string }
  | { k: 'banner'; text: string };

const run = (text: string, o: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, font: FONT, size: o.size ?? 24, bold: o.bold, italics: o.italics, color: o.color });

function paragraphs(text: string, o: { italics?: boolean; bold?: boolean } = {}): Paragraph[] {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => new Paragraph({ spacing: { after: 100, line: 320 }, children: [run(l, o)] }));
}

function toParagraphs(blocks: Block[]): Paragraph[] {
  const out: Paragraph[] = [];
  for (const b of blocks) {
    switch (b.k) {
      case 'title':
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [run(b.text, { bold: true, size: 34, color: NAVY })],
          }),
        );
        if (b.sub) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [run(b.sub, { size: 22, color: '54556E' })] }));
        break;
      case 'h1':
      case 'h2':
        out.push(
          new Paragraph({
            heading: b.k === 'h1' ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
            pageBreakBefore: b.k === 'h1' && !!b.pageBreak,
            keepNext: true,
            spacing: { before: 260, after: 120 },
            border: b.k === 'h1' ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D3CFC0', space: 2 } } : undefined,
            children: [run(b.text, { bold: true, size: b.k === 'h1' ? 28 : 25, color: NAVY })],
          }),
        );
        break;
      case 'p':
        out.push(...paragraphs(b.text, { italics: b.italic, bold: b.bold }));
        break;
      case 'bullet':
        out.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 80, line: 320 }, children: [run(b.text)] }));
        break;
      case 'numbered':
        out.push(
          new Paragraph({
            spacing: { before: 160, after: 60, line: 320 },
            keepNext: true,
            children: [run(`Câu ${b.n}. `, { bold: true }), run(b.text), ...(b.tag ? [run(`  (${b.tag})`, { italics: true, size: 20, color: '54556E' })] : [])],
          }),
        );
        break;
      case 'speaker':
        out.push(
          new Paragraph({
            spacing: { after: 100, line: 320 },
            children: [run(`${b.who}: `, { bold: true, color: NAVY }), run(b.text)],
          }),
        );
        break;
      case 'rule':
        for (let i = 0; i < b.count; i++) {
          out.push(
            new Paragraph({
              spacing: { before: 0, after: 0, line: 480 },
              border: { bottom: { style: BorderStyle.DOTTED, size: 6, color: '777777', space: 1 } },
              children: [run('')],
            }),
          );
        }
        break;
      case 'info':
        out.push(new Paragraph({ spacing: { after: 160 }, children: [run(b.text, { size: 24 })] }));
        break;
      case 'banner':
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 60, after: 200 },
            shading: { fill: 'FBF6DC' },
            border: {
              top: { style: BorderStyle.SINGLE, size: 6, color: 'E8C40A', space: 4 },
              bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E8C40A', space: 4 },
            },
            children: [run(b.text, { bold: true, size: 26, color: '7A5F00' })],
          }),
        );
        break;
    }
  }
  return out;
}

async function pack(title: string, blocks: Block[]): Promise<Blob> {
  const doc = new Document({
    creator: SCHOOL,
    title,
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [
      {
        properties: { page: { size: A4, margin: { top: 1134, bottom: 1134, left: 1417, right: 1134 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 2 } },
                children: [run(SCHOOL.toUpperCase(), { bold: true, size: 22, color: NAVY })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: ['Trang ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], font: FONT, size: 20 })],
              }),
            ],
          }),
        },
        children: toParagraphs(blocks),
      },
    ],
  });
  return Packer.toBlob(doc);
}

const LEVEL: Record<string, string> = { nho: 'Nhớ', hieu: 'Hiểu', van_dung: 'Vận dụng' };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function blocksFor(a: Artifact): Block[] {
  const b: Block[] = [];
  switch (a.kind) {
    case 'text': {
      const d = a.data as Artifact<'text'>['data'];
      b.push({ k: 'title', text: d.title || a.title });
      for (const s of d.sections ?? []) {
        b.push({ k: 'h1', text: s.heading }, { k: 'p', text: s.body });
      }
      break;
    }
    case 'slides': {
      const d = a.data as Artifact<'slides'>['data'];
      b.push({ k: 'title', text: d.title || a.title, sub: 'Dàn ý các slide' });
      (d.slides ?? []).forEach((s, i) => {
        b.push({ k: 'h2', text: `Slide ${i + 1}. ${s.title}` });
        for (const x of s.bullets ?? []) b.push({ k: 'bullet', text: x });
        if (s.visual) b.push({ k: 'p', text: `Gợi ý hình: ${s.visual}`, italic: true });
        if (s.notes) b.push({ k: 'p', text: `Ghi chú cho giáo viên: ${s.notes}`, italic: true });
      });
      break;
    }
    case 'worksheet': {
      const d = a.data as Artifact<'worksheet'>['data'];
      b.push({ k: 'info', text: 'Họ và tên: ……………………………………………………   Lớp: …………   Ngày: ……………………' });
      b.push({ k: 'title', text: d.title || a.title });
      let n = 0;
      (d.sections ?? []).forEach((sec, si) => {
        b.push({ k: 'h1', text: sec.heading, pageBreak: false });
        void si;
        for (const it of sec.items ?? []) {
          n++;
          b.push({ k: 'numbered', n, text: it.prompt, tag: it.level ? LEVEL[it.level] : undefined });
          b.push({ k: 'rule', count: Math.max(0, Math.min(10, it.lines ?? 3)) });
        }
      });
      b.push({ k: 'h1', text: 'ĐÁP ÁN VÀ GỢI Ý CHẤM', pageBreak: true });
      b.push({ k: 'banner', text: 'DÀNH CHO GIÁO VIÊN — không phát cho học sinh' });
      for (const k of d.answerKey ?? []) {
        b.push({ k: 'h2', text: k.heading }, { k: 'p', text: k.body });
      }
      break;
    }
    case 'podcast': {
      const d = a.data as Artifact<'podcast'>['data'];
      b.push({ k: 'title', text: d.title || a.title, sub: `Kịch bản podcast · khoảng ${d.durationMin} phút · Người dẫn: ${(d.hosts ?? []).join(', ')}` });
      for (const l of d.lines ?? []) b.push({ k: 'speaker', who: l.speaker, text: l.text });
      break;
    }
    case 'tranh_luan': {
      const d = a.data as Artifact<'tranh_luan'>['data'];
      b.push({ k: 'title', text: d.title || a.title, sub: `Chủ đề: ${d.topic}` });
      for (const e of d.experts ?? []) b.push({ k: 'bullet', text: `${e.name} — ${e.stance}` });
      b.push({ k: 'h1', text: 'Kịch bản tranh luận' });
      for (const l of d.lines ?? []) b.push({ k: 'speaker', who: l.speaker, text: l.text });
      b.push({ k: 'h1', text: 'Kết luận' }, { k: 'p', text: d.conclusion });
      break;
    }
    case 'video': {
      const d = a.data as Artifact<'video'>['data'];
      b.push({ k: 'title', text: d.title || a.title, sub: `Kịch bản video khoảng ${d.totalMin} phút` });
      for (const s of d.scenes ?? []) {
        b.push({ k: 'h2', text: `Cảnh ${s.n} (${mmss(s.durationSec)})` });
        b.push({ k: 'p', text: `Hình ảnh: ${s.visual}` });
        b.push({ k: 'p', text: `Lời dẫn: ${s.narration}` });
        if (s.onScreenText) b.push({ k: 'p', text: `Chữ trên màn hình: ${s.onScreenText}`, italic: true });
      }
      break;
    }
    case 'mindmap': {
      const d = a.data as Artifact<'mindmap'>['data'];
      b.push({ k: 'title', text: d.title || a.title, sub: 'Sơ đồ tư duy (dạng danh sách)' });
      const walk = (n: { label: string; children?: unknown[] }, depth: number) => {
        b.push({ k: 'p', text: `${'    '.repeat(depth)}${depth ? '– ' : ''}${n.label}`, bold: depth < 2 });
        for (const c of (n.children ?? []) as { label: string; children?: unknown[] }[]) walk(c, depth + 1);
      };
      walk(d.root, 0);
      break;
    }
    case 'infographic': {
      const d = a.data as Artifact<'infographic'>['data'];
      b.push({ k: 'title', text: d.title || a.title, sub: d.subtitle });
      for (const k of d.keyPoints ?? []) b.push({ k: 'bullet', text: `${k.label}: ${k.text}` });
      for (const s of d.steps ?? []) b.push({ k: 'p', text: `Bước ${s.n}. ${s.title} — ${s.text}` });
      for (const f of d.facts ?? []) b.push({ k: 'p', text: `${f.value}: ${f.caption}`, bold: true });
      b.push({ k: 'banner', text: d.takeaway });
      break;
    }
  }
  return b;
}

export function buildArtifactDocx(artifact: Artifact): Promise<Blob> {
  return pack(artifact.title, blocksFor(artifact));
}
