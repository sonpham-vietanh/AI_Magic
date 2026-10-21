import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { availableFormats, safeFilename } from '@/lib/export/artifact';
import { buildArtifactDocx } from '@/lib/export/artifactDocx';
import { buildSlidesPptx, estimateLines, fitBulletFont } from '@/lib/export/pptx';
import { buildWorksheetStudentHtml, buildWorksheetTeacherHtml } from '@/lib/export/print';
import { SAMPLE_ARTIFACTS } from '@/lib/export/samples';
import type { Artifact } from '@/lib/resources/types';

const get = <K extends Artifact['kind']>(k: K) => SAMPLE_ARTIFACTS.find((a) => a.kind === k) as Artifact<K>;

describe('PPTX', () => {
  it('tạo tệp zip hợp lệ, đủ slide (bìa + nội dung) và có ghi chú giáo viên', async () => {
    const a = get('slides');
    const { data, slideCount } = await buildSlidesPptx(a.data);
    expect(slideCount).toBe(a.data.slides.length + 1);
    const zip = await JSZip.loadAsync(data);
    const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    expect(slides).toHaveLength(slideCount);
    const notes = Object.keys(zip.files).filter((f) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f));
    expect(notes.length).toBe(slideCount);
    const all = await Promise.all(notes.map((n) => zip.file(n)!.async('string')));
    expect(all.some((x) => x.includes('Cho học sinh đoán 1 phút'))).toBe(true);
    const s2 = await zip.file('ppt/slides/slide2.xml')!.async('string');
    expect(s2).toContain('Cây xanh');
    const pres = await zip.file('ppt/presentation.xml')!.async('string');
    expect(pres).toContain('9144000'); // 16:9
  });
  it('chọn cỡ chữ nhỏ lại khi nhiều chữ để không tràn', () => {
    const few = fitBulletFont(['Ngắn', 'Ngắn nữa'], 5.9, 3.3);
    const many = fitBulletFont(Array.from({ length: 6 }, () => 'Một ý khá dài '.repeat(8)), 5.9, 3.3);
    expect(many).toBeLessThan(few);
    expect(estimateLines('a b c', 20, 8)).toBe(1);
  });
});

describe('DOCX', () => {
  for (const kind of ['text', 'slides', 'worksheet', 'podcast', 'tranh_luan', 'video', 'mindmap', 'infographic'] as const) {
    it(`${kind}: tạo được, có tiêu đề`, async () => {
      const a = get(kind);
      const blob = await buildArtifactDocx(a);
      expect(blob.size).toBeGreaterThan(1000);
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('word/document.xml')!.async('string');
      const title = (a.data as { title: string }).title;
      expect(xml).toContain(title.split(':')[0].replace(/&/g, '&amp;'));
    });
  }
  it('worksheet: có đầu phiếu, trang đáp án ghi rõ dành cho giáo viên', async () => {
    const zip = await JSZip.loadAsync(await (await buildArtifactDocx(get('worksheet'))).arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Họ và tên');
    expect(xml).toContain('DÀNH CHO GIÁO VIÊN');
    expect(xml).toContain('w:pageBreakBefore');
    expect(xml.indexOf('Họ và tên')).toBeLessThan(xml.indexOf('DÀNH CHO GIÁO VIÊN'));
  });
});

describe('Bản in phiếu', () => {
  it('phiếu học sinh KHÔNG chứa đáp án; bản giáo viên chỉ có đáp án', () => {
    const d = get('worksheet').data;
    const student = buildWorksheetStudentHtml(d);
    const teacher = buildWorksheetTeacherHtml(d);
    expect(student).toContain('Họ và tên');
    expect(student).not.toContain('Khí CO2 và nước.');
    expect(student).not.toContain('Gợi ý chấm');
    expect(teacher).toContain('Khí CO2 và nước.');
    expect(teacher).not.toContain('Kể tên hai nguyên liệu');
  });
  it('thoát HTML', () => {
    const d = structuredClone(get('worksheet').data);
    d.title = '<script>alert(1)</script>';
    expect(buildWorksheetStudentHtml(d)).not.toContain('<script>alert');
  });
});

describe('định dạng', () => {
  it('định dạng chính đứng đầu', () => {
    expect(availableFormats('slides')[0]).toBe('pptx');
    expect(availableFormats('worksheet')[0]).toBe('docx');
    expect(availableFormats('mindmap')[0]).toBe('png');
    expect(availableFormats('infographic')[0]).toBe('png');
    for (const k of ['text', 'video', 'podcast', 'tranh_luan'] as const) expect(availableFormats(k)[0]).toBe('docx');
    for (const a of SAMPLE_ARTIFACTS) expect(availableFormats(a.kind)).toContain('json');
  });
  it('tên tệp bỏ dấu', () => {
    expect(safeFilename('Phiếu học tập: Quang hợp / Đề 1')).toBe('Phieu-hoc-tap-Quang-hop-De-1');
  });
});
