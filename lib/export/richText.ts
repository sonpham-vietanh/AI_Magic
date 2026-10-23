// Dựng đoạn văn Word có công thức: chữ thường thành TextRun, $...$ / $$...$$ thành công thức Word thật (OMML).
// Dùng chung cho Kế hoạch bài dạy, phiếu học tập và mọi sản phẩm xuất Word.
import { AlignmentType, Paragraph, TextRun, type ParagraphChild } from 'docx';
import { splitMath } from '@/lib/text/math';
import { viDatesInText } from '@/lib/text/date';
import { latexToUnicode } from './latex';
import { latexToDocxMath } from './mathDocx';

export interface RunStyle {
  font: string;
  size: number;
  bold?: boolean;
  italics?: boolean;
  color?: string;
}

/** Mọi dòng văn bản đi qua đây: đổi ngày yyyy-mm-dd sang dd/mm/yyyy. */
export function cleanLine(s: string): string {
  return viDatesInText(String(s ?? ''));
}

/** Một dòng thành dãy TextRun và công thức. Công thức hỏng rơi về chuỗi Unicode, không để $ thô. */
export function richRuns(line: string, st: RunStyle): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  const text = cleanLine(line);
  for (const seg of splitMath(text)) {
    if (seg.type === 'text') {
      if (seg.value) out.push(new TextRun({ text: seg.value, font: st.font, size: st.size, bold: st.bold, italics: st.italics, color: st.color }));
      continue;
    }
    try {
      out.push(latexToDocxMath(seg.value));
    } catch {
      out.push(new TextRun({ text: latexToUnicode(seg.value), font: st.font, size: st.size, bold: st.bold, italics: st.italics, color: st.color }));
    }
  }
  if (out.length === 0) out.push(new TextRun({ text: '', font: st.font, size: st.size }));
  return out;
}

/** Dòng chỉ có một công thức khối ($$...$$) thì căn giữa. */
function isDisplayOnly(line: string): boolean {
  const segs = splitMath(line.trim());
  return segs.length === 1 && segs[0].type === 'math' && !!segs[0].display;
}

export interface ParaOpts extends RunStyle {
  after?: number;
  line?: number;
  indent?: number;
}

/** Nhiều dòng thành nhiều đoạn văn; thụt đầu dòng của văn bản gốc được giữ (mỗi 3 khoảng trắng một cấp). */
export function richParagraphs(text: string, o: ParaOpts): Paragraph[] {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((raw) => {
      const lead = /^[ \t]*/.exec(raw)?.[0].length ?? 0;
      const line = raw.trim();
      return new Paragraph({
        alignment: isDisplayOnly(line) ? AlignmentType.CENTER : undefined,
        spacing: { after: o.after ?? 80, line: o.line ?? 340 },
        indent: lead > 0 ? { left: Math.min(900, Math.floor(lead / 3) * 360) + (o.indent ?? 0) } : o.indent ? { left: o.indent } : undefined,
        children: richRuns(line, o),
      });
    });
}
