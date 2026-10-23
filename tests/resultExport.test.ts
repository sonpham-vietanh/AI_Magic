import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { buildDocxBlob, isKhbdInput, parseKhbdActivities } from '@/lib/export/docx';
import { buildArtifactDocx } from '@/lib/export/artifactDocx';
import { buildSlidesPptx } from '@/lib/export/pptx';
import { buildDocumentHtml, buildWorksheetStudentHtml, mathHtml } from '@/lib/export/print';
import { buildGammaOutline, buildNotebookSource } from '@/lib/agent/exportText';
import { mathPreserved, replaceSectionBody, requestRefine } from '@/components/agent/result/refine';
import { SAMPLE_ARTIFACTS } from '@/lib/export/samples';
import type { Artifact } from '@/lib/resources/types';

const KHBD = [
  { heading: 'I. MỤC TIÊU', body: '1. Kiến thức: Biết định lí $c^2 = a^2 + b^2$.\n2. Năng lực: Giải quyết vấn đề.' },
  { heading: 'II. THIẾT BỊ DẠY HỌC', body: 'Máy chiếu, thước.' },
  {
    heading: 'III. TIẾN TRÌNH DẠY HỌC',
    body: [
      'Hoạt động 1: Mở đầu (5 phút)',
      'a) Mục tiêu: Tạo hứng thú.',
      'b) Nội dung: Nêu tình huống.',
      'c) Sản phẩm: Dự đoán của học sinh.',
      'd) Tổ chức thực hiện:',
      '   Bước 1: Giao nhiệm vụ.',
      '   Bước 2: Thực hiện, tính $\\frac{a}{b}$ và $x \\in A$.',
      '',
      'Hoạt động 2: Hình thành kiến thức (15 phút)',
      'a) Mục tiêu: Nắm định lí.',
      'b) Nội dung: Đọc SGK.',
      'c) Sản phẩm: Ghi bảng $\\sqrt{x^2+y^2}$.',
      'd) Tổ chức thực hiện: Làm việc theo cặp.',
    ].join('\n'),
  },
];

async function docXml(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return zip.file('word/document.xml')!.async('string');
}
async function partXml(blob: Blob, name: RegExp): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const f = Object.keys(zip.files).filter((k) => name.test(k));
  return (await Promise.all(f.map((k) => zip.file(k)!.async('string')))).join('\n');
}

describe('Kế hoạch bài dạy Word theo Phụ lục IV', () => {
  it('nhận biết và tách đúng hoạt động, trường a/b/c/d', () => {
    expect(isKhbdInput({ sections: KHBD })).toBe(true);
    const p = parseKhbdActivities(KHBD);
    expect(p.acts.map((a) => a.n)).toEqual([1, 2]);
    expect(p.acts[0].fields.map((f) => f.label)).toEqual(['a) Mục tiêu', 'b) Nội dung', 'c) Sản phẩm', 'd) Tổ chức thực hiện']);
    expect(p.acts[0].fields[3].lines.join(' ')).toContain('Bước 2');
    expect(p.pre.map((s) => s.heading)).toContain('I. MỤC TIÊU');
  });
  it('dựng bảng, công thức Word thật, khổ A4, đánh số trang, ngày dd/mm/yyyy', async () => {
    const blob = await buildDocxBlob({
      title: 'KẾ HOẠCH BÀI DẠY',
      subtitle: ['Toán 7 · 2026-10-23'],
      sections: KHBD,
      teachDate: '2026-11-05',
      today: new Date(2026, 9, 23),
    });
    const x = await docXml(blob);
    expect(x).toContain('<w:tbl>');
    expect((x.match(/<w:tbl>/g) ?? []).length).toBeGreaterThanOrEqual(3); // đầu trang + 2 hoạt động + ký tên
    expect(x).toContain('Hoạt động 1: Mở đầu');
    expect(x).toContain('d) Tổ chức thực hiện');
    expect(x).toContain('<m:oMath>');
    expect(x).toContain('<m:f>');
    expect(x).toContain('<m:rad>');
    expect(x).toContain('∈');
    expect(x).not.toMatch(/\$[^<]*\$/); // không còn $...$ thô
    expect(x).toContain('w:w="11906"');
    expect(x).toContain('Ngày dạy: 05/11/2026');
    expect(x).toContain('Ngày soạn: 23/10/2026');
    expect(x).toContain('23/10/2026'); // phụ đề đã đổi ngày
    expect(x).not.toContain('2026-10-23');
    expect(x).toContain('Times New Roman');
    expect(x).toContain('TỔ TRƯỞNG CHUYÊN MÔN');
    const foot = await partXml(blob, /word\/footer\d*\.xml/);
    expect(foot).toContain('PAGE');
    expect(x + foot).not.toContain('BẢN NHÁP');
  });
  it('bản nháp: đóng dấu ở đầu và chân trang; bản đã duyệt thì không', async () => {
    const blob = await buildDocxBlob({ title: 'KHBD', sections: KHBD, draft: true });
    const head = await partXml(blob, /word\/header\d*\.xml/);
    const foot = await partXml(blob, /word\/footer\d*\.xml/);
    expect(head).toContain('BẢN NHÁP, CHƯA DUYỆT');
    expect(foot).toContain('BẢN NHÁP, CHƯA DUYỆT');
    const clean = await buildDocxBlob({ title: 'KHBD', sections: KHBD, draft: false });
    expect(await partXml(clean, /word\/(header|footer)\d*\.xml/)).not.toContain('BẢN NHÁP');
  });
  it('văn bản thường (không phải KHBD) vẫn có công thức thật và không có bảng', async () => {
    const blob = await buildDocxBlob({ title: 'Bài đọc', sections: [{ heading: 'Phần 1', body: 'Cho $$x^2 + 1 = 0$$ và $y_1$.' }] });
    const x = await docXml(blob);
    expect(x).toContain('<m:sSup>');
    expect(x).toContain('<m:sSub>');
    expect(x).not.toContain('<w:tbl>');
  });
});

describe('Word cho sản phẩm có cấu trúc', () => {
  const ws = SAMPLE_ARTIFACTS.find((a) => a.kind === 'worksheet') as Artifact<'worksheet'>;
  const withMath: Artifact<'worksheet'> = {
    ...ws,
    data: { ...ws.data, sections: [{ heading: 'Phần 1', items: [{ prompt: 'Tính $\\frac{1}{2} + \\frac{1}{3}$', level: 'nho', lines: 2 }] }] },
  };
  it('phiếu: bản học sinh không có đáp án, bản giáo viên chỉ có đáp án', async () => {
    const hs = await docXml(await buildArtifactDocx(withMath, { variant: 'student' }));
    const gv = await docXml(await buildArtifactDocx(withMath, { variant: 'teacher' }));
    expect(hs).toContain('<m:f>');
    expect(hs).not.toContain('DÀNH CHO GIÁO VIÊN');
    expect(gv).toContain('DÀNH CHO GIÁO VIÊN');
    expect(gv).not.toContain('Họ và tên');
  });
  it('phiếu nháp có dấu ở đầu và chân trang', async () => {
    const b = await buildArtifactDocx(withMath, { draft: true });
    expect(await partXml(b, /word\/header\d*\.xml/)).toContain('BẢN NHÁP');
    expect(await partXml(b, /word\/footer\d*\.xml/)).toContain('BẢN NHÁP');
  });
});

describe('PowerPoint', () => {
  const deck = {
    title: 'Định lí $c^2 = a^2 + b^2$',
    slides: [{ title: 'Căn $\\sqrt{2}$', bullets: ['Cho $x \\in A$', 'Hạn 2026-10-23'], notes: 'Ghi chú' }],
  } as Artifact<'slides'>['data'];
  it('công thức thành Unicode, ngày dd/mm/yyyy, nháp có dấu ở mỗi slide', async () => {
    const { data } = await buildSlidesPptx(deck, { draft: true });
    const zip = await JSZip.loadAsync(data);
    const s1 = await zip.file('ppt/slides/slide1.xml')!.async('string');
    const s2 = await zip.file('ppt/slides/slide2.xml')!.async('string');
    expect(s2).toContain('√2');
    expect(s2).toContain('x ∈ A');
    expect(s2).toContain('23/10/2026');
    expect(s2).not.toContain('$');
    expect(s1).toContain('BẢN NHÁP, CHƯA DUYỆT');
    expect(s2).toContain('BẢN NHÁP, CHƯA DUYỆT');
    const clean = await JSZip.loadAsync((await buildSlidesPptx(deck)).data);
    expect(await clean.file('ppt/slides/slide2.xml')!.async('string')).not.toContain('BẢN NHÁP');
  });
});

describe('Bản in', () => {
  it('công thức thành MathML, không còn $ thô; nháp có dấu hai đầu trang', () => {
    const h = mathHtml('Cho $x^2$ và $$\\frac{a}{b}$$ giá 50$ và 60$');
    expect(h).toContain('<math');
    expect(h).toContain('50$ và 60$');
    const doc = buildDocumentHtml({ title: 'KHBD', subtitle: ['Hạn 2026-10-23'], sections: [{ heading: 'I. Mục tiêu', body: 'Tính $\\sqrt{x}$' }] }, { draft: true });
    expect(doc).toContain('BẢN NHÁP, CHƯA DUYỆT');
    expect(doc).toContain('<math');
    expect(doc).toContain('23/10/2026');
    expect(doc).toContain('@page { size: A4');
    expect(buildDocumentHtml({ title: 'x', sections: [] })).not.toContain('BẢN NHÁP');
  });
  it('phiếu in cho học sinh chứa công thức dựng sẵn', () => {
    const ws = SAMPLE_ARTIFACTS.find((a) => a.kind === 'worksheet') as Artifact<'worksheet'>;
    const html = buildWorksheetStudentHtml(
      { ...ws.data, sections: [{ heading: 'A', items: [{ prompt: 'Tính $\\frac{1}{2}$', lines: 1 }] }] },
      { draft: true },
    );
    expect(html).toContain('<math');
    expect(html).toContain('BẢN NHÁP');
  });
});

describe('Gamma và NotebookLM', () => {
  it('nháp có dòng báo, công thức thành chữ Unicode', () => {
    const input = { title: 'Bài', text: '', sections: [{ heading: 'Mục tiêu', body: 'Biết $x \\le 3$ và $\\sqrt{2}$.' }], draft: true };
    const g = buildGammaOutline(input);
    const n = buildNotebookSource(input);
    for (const out of [g, n]) {
      expect(out).toContain('BẢN NHÁP, CHƯA DUYỆT');
      expect(out).toContain('x ≤ 3');
      expect(out).toContain('√2');
      expect(out).not.toContain('$');
    }
    expect(buildGammaOutline({ ...input, draft: false })).not.toContain('BẢN NHÁP');
  });
});

describe('Viết lại bằng lời', () => {
  const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it('giữ công thức: phát hiện công thức bị đổi', () => {
    expect(mathPreserved('Tính $a+b$.', 'Hãy tính $a + b$ nhé.')).toBe(true);
    expect(mathPreserved('Tính $a+b$.', 'Hãy tính tổng.')).toBe(false);
    expect(mathPreserved('Không có công thức', 'Bất kỳ')).toBe(true);
  });
  it('gọi đúng hợp đồng và trả bản mới', async () => {
    const f = ok({ ok: true, text: 'Bản ngắn $a+b$', modelUsed: 'x' });
    const r = await requestRefine({ instruction: 'rút gọn', text: 'Bản dài $a+b$', sectionHeading: 'I', format: 'KHBD', context: { monHoc: 'Toán' } }, f);
    expect(r).toEqual({ ok: true, text: 'Bản ngắn $a+b$', mathChanged: false });
    const call = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe('/api/workflows/refine');
    expect(JSON.parse(String(call[1].body))).toMatchObject({ instruction: 'rút gọn', text: 'Bản dài $a+b$', sectionHeading: 'I', context: { monHoc: 'Toán' } });
  });
  it('lỗi mềm bằng tiếng Việt: 404, 429, mất mạng, rỗng', async () => {
    const a = await requestRefine({ instruction: 'x', text: 'y' }, ok({ error: 'Not found' }, 404));
    expect(a.ok === false && a.message).toContain('sửa tay');
    const b = await requestRefine({ instruction: 'x', text: 'y' }, ok({ ok: false }, 429));
    expect(b.ok === false && b.message).toContain('hạn mức');
    const c = await requestRefine({ instruction: 'x', text: 'y' }, vi.fn(async () => { throw new TypeError('fail'); }) as unknown as typeof fetch);
    expect(c.ok === false && c.message).toContain('kết nối');
    const d = await requestRefine({ instruction: '  ', text: 'y' });
    expect(d.ok).toBe(false);
    const e = await requestRefine({ instruction: 'x', text: '   ' });
    expect(e.ok).toBe(false);
  });
  it('thay thân đúng mục', () => {
    const s = [{ heading: 'A', body: '1' }, { heading: 'B', body: '2' }];
    expect(replaceSectionBody(s, 1, 'mới')).toEqual([{ heading: 'A', body: '1' }, { heading: 'B', body: 'mới' }]);
  });
});
