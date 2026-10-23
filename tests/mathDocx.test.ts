import JSZip from 'jszip';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { describe, expect, it } from 'vitest';
import { latexToDocxMath } from '@/lib/export/mathDocx';
import { latexToUnicode, mathToUnicode } from '@/lib/export/latex';

async function xmlOf(tex: string) {
  const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun('a '), latexToDocxMath(tex)] })] }] });
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  return zip.file('word/document.xml')!.async('string');
}

describe('LaTeX -> OMML', () => {
  it('phân số, căn, mũ, chỉ số dưới thành phần tử Word thật', async () => {
    const x = await xmlOf('\\frac{a+b}{2} + \\sqrt{x^2+1} + a_n + x_i^2');
    expect(x).toContain('<m:f>');
    expect(x).toContain('<m:rad>');
    expect(x).toContain('<m:sSup>');
    expect(x).toContain('<m:sSub>');
    expect(x).toContain('<m:sSubSup>');
    expect(x).not.toContain('\\frac');
    expect(x).not.toContain('$');
  });
  it('định lí Pythagore, ký hiệu tập hợp, vector, hệ phương trình', async () => {
    const p = await xmlOf('c^2 = a^2 + b^2');
    expect(p).toContain('<m:sSup>');
    const s = await xmlOf('x \\in A, y \\notin B, A \\cup B, a \\le b');
    expect(s).toContain('∈');
    expect(s).toContain('∉');
    expect(s).toContain('∪');
    expect(s).toContain('≤');
    const v = await xmlOf('\\vec{AB} = (1; 2)');
    expect(v).not.toContain('\\vec');
    const c = await xmlOf('\\begin{cases} x+y=5 \\\\ x-y=1 \\end{cases}');
    expect(c).not.toContain('begin');
    expect(c).toContain('x');
  });
  it('căn bậc ba có chỉ số căn; lệnh lạ không để sót dấu gạch chéo ngược', async () => {
    const r = await xmlOf('\\sqrt[3]{8}');
    expect(r).toContain('<m:deg>');
    const u = await xmlOf('\\foo{1}');
    expect(u).not.toContain('\\foo');
  });
  it('dự phòng Unicode đọc được', () => {
    expect(latexToUnicode('x^2 + \\sqrt{2}')).toContain('x²');
    expect(latexToUnicode('x^2 + \\sqrt{2}')).toContain('√');
    expect(mathToUnicode('Cho $a \\in A$ và $A \\subset B$.')).toBe('Cho a ∈ A và A ⊂ B.');
  });
});
