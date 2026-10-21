import { describe, expect, it } from 'vitest';
import {
  allocatePoints, buildExamDocument, examPrintHtml, latexToPlain, quizPrintHtml, sumPoints,
} from '@/lib/assessment/examDoc';
import { initPresent, presentKey, presentReduce } from '@/lib/assessment/present';
import { EMPTY_FILTER, difficultyBand, filterBank, summarizeBank, type PublicBankItem } from '@/lib/assessment/bankView';
import { buildExamDocxBlob } from '@/components/kiem-tra/examDocx';
import type { ExamItemSnapshot } from '@/lib/assessment/types';
import type { Tt22Level } from '@/lib/assessment/tt22';

const mk = (id: string, atom: string, lvl: Tt22Level, options: string[] = []): ExamItemSnapshot => ({
  questionId: id, atomId: atom, atomCode: `C.${atom}`, bloom: 'Nhớ', tt22Level: lvl,
  noiDung: `Tính $\frac{1}{2}$ câu ${id} <b>x</b>`, dapAn: 'B', loiGiai: 'vì $x^2$', options,
});
const rows = [{ atomId: 'A', atomCode: 'C.A', title: 'Bài A' }, { atomId: 'B', atomCode: 'C.B', title: 'Bài B' }];
const items = [
  mk('1', 'A', 'nhan_biet', ['a', 'b', 'c', 'd']), mk('2', 'A', 'thong_hieu'), mk('3', 'B', 'van_dung', ['a', 'b', 'c', 'd']),
  mk('4', 'B', 'van_dung_cao'), mk('5', 'A', 'thong_hieu', ['a', 'b', 'c', 'd']), mk('6', 'B', 'nhan_biet'),
];

describe('bộ dựng tài liệu đề', () => {
  it('chia điểm tổng đúng 10', () => {
    for (const n of [1, 3, 6, 7, 11, 13]) expect(sumPoints(allocatePoints(n))).toBe(10);
  });
  it('ma trận, trắc nghiệm trước tự luận, tổng 10', () => {
    const d = buildExamDocument(items, rows, [], { examId: 'DT-1' });
    expect(d.totalPoints).toBe(10);
    expect(d.matrix.count).toBe(6);
    expect(d.matrix.points).toBe(10);
    expect(d.questions.slice(0, 3).every((q) => q.part === 'trac_nghiem' && q.options.length === 4)).toBe(true);
    expect(d.questions.slice(3).every((q) => q.part === 'tu_luan')).toBe(true);
    expect(d.matrix.rows[0].cells.thong_hieu.count).toBe(2);
    expect(d.spec[0].levels.find((l) => l.level === 'thong_hieu')!.questionNos.length).toBe(2);
  });
  it('thiếu câu: giữ shortfall, không bịa', () => {
    const d = buildExamDocument(items.slice(0, 2), rows, ['C.A · Vận dụng: thiếu 2/2 câu'], { examId: 'DT-2' });
    expect(d.questions).toHaveLength(2);
    expect(sumPoints(d.questions.map((q) => q.points))).toBe(10);
    expect(examPrintHtml(d, 'dap_an')).toContain('thiếu 2/2');
    const empty = buildExamDocument([], rows, ['Không chọn được câu nào'], { examId: 'DT-3' });
    expect(empty.totalPoints).toBe(0);
  });
  it('bản in: đề không lộ đáp án, đáp án có nhãn giáo viên, thoát HTML', () => {
    const d = buildExamDocument(items, rows, [], { examId: 'DT-1', subject: 'Toán', grade: '10' });
    const de = examPrintHtml(d, 'de');
    expect(de).toContain('A. a');
    expect(de).not.toContain('Dành cho giáo viên'.toUpperCase());
    expect(de).not.toContain('<b>x</b>');
    expect(de).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(examPrintHtml(d, 'dap_an')).toContain('DÀNH CHO GIÁO VIÊN');
    expect(quizPrintHtml([], 'Q', true)).toContain('Chưa có câu hỏi');
  });
  it('LaTeX sang chữ thường', () => {
    expect(latexToPlain(String.raw`$\frac{1}{2}$ và $x^2 \le \sqrt{3}$`)).toBe('1/2 và x² ≤ √3');
  });
  it('xuất .docx ra Blob có nội dung', async () => {
    const blob = await buildExamDocxBlob(buildExamDocument(items, rows, ['thiếu'], { examId: 'DT-1' }));
    expect(blob.size).toBeGreaterThan(2000);
  });
});

describe('chế độ chiếu lớp', () => {
  it('chuyển câu, ẩn đáp án khi đổi câu, không vượt biên', () => {
    let s = initPresent(3);
    s = presentReduce(s, 'prev');
    expect(s.index).toBe(0);
    s = presentReduce(presentReduce(s, 'toggle'), 'next');
    expect(s).toMatchObject({ index: 1, revealed: false });
    s = presentReduce(presentReduce(s, 'last'), 'next');
    expect(s.index).toBe(2);
    expect(presentReduce(s, 'reveal').revealed).toBe(true);
    expect(presentReduce(initPresent(0), 'next').index).toBe(0);
  });
  it('phím tắt', () => {
    expect(presentKey('ArrowRight')).toBe('next');
    expect(presentKey('ArrowLeft')).toBe('prev');
    expect(presentKey(' ')).toBe('toggle');
    expect(presentKey('Escape')).toBe('exit');
    expect(presentKey('x')).toBeNull();
  });
});

describe('bộ lọc ngân hàng', () => {
  const b = (id: string, o: Partial<PublicBankItem>): PublicBankItem => ({
    id, atomId: 'A', atomCode: 'C.A', atomTitle: 'Hàm số', bloom: 'Nhớ', tt22Level: 'nhan_biet',
    difficultyMeasured: null, lastUsedAt: null, dok: 1, preview: `Câu ${id}`, kind: 'tu_luan', blocked: false, ...o,
  });
  const bank = [
    b('1', {}), b('2', { bloom: 'Hiểu', tt22Level: 'thong_hieu', difficultyMeasured: 0.2, lastUsedAt: '2026-01-01', blocked: true, kind: 'trac_nghiem' }),
    b('3', { tt22Level: 'van_dung', difficultyMeasured: 0.8, preview: 'Đạo hàm của hàm số' }),
  ];
  it('lọc theo từng nhãn', () => {
    expect(filterBank(bank, { ...EMPTY_FILTER, bloom: 'Hiểu' }).map((x) => x.id)).toEqual(['2']);
    expect(filterBank(bank, { ...EMPTY_FILTER, tt22: 'van_dung' }).map((x) => x.id)).toEqual(['3']);
    expect(filterBank(bank, { ...EMPTY_FILTER, difficulty: 'kho' }).map((x) => x.id)).toEqual(['3']);
    expect(filterBank(bank, { ...EMPTY_FILTER, difficulty: 'chua_do' }).map((x) => x.id)).toEqual(['1']);
    expect(filterBank(bank, { ...EMPTY_FILTER, usage: 'chua_dung' }).map((x) => x.id)).toEqual(['1', '3']);
    expect(filterBank(bank, { ...EMPTY_FILTER, usage: 'dang_khoa' }).map((x) => x.id)).toEqual(['2']);
    expect(filterBank(bank, { ...EMPTY_FILTER, query: 'dao ham' }).map((x) => x.id)).toEqual(['3']);
  });
  it('số liệu tổng và dải độ khó', () => {
    const s = summarizeBank(bank);
    expect(s).toMatchObject({ total: 3, available: 2, mcq: 1 });
    expect(s.byLevel.thong_hieu).toEqual({ total: 1, available: 0 });
    expect(difficultyBand(0.5)).toBe('vua');
  });
});

import { parseInlineChoices } from '@/lib/assessment/choices';
import { normalizeQuestion } from '@/lib/assessment/bank';
import { emptyOrg } from '@/lib/assessment/store';

describe('phương án nằm trong nội dung câu', () => {
  const txt = 'Hàm mục tiêu đạt max tại: A. Điểm bất kỳ B. Các ĐỈNH C. Tâm D. Gốc O(0; 0)';
  it('tách thân câu và 4 phương án', () => {
    const p = parseInlineChoices(txt)!;
    expect(p.stem).toBe('Hàm mục tiêu đạt max tại:');
    expect(p.options).toEqual(['Điểm bất kỳ', 'Các ĐỈNH', 'Tâm', 'Gốc O(0; 0)']);
    expect(parseInlineChoices('Giải phương trình x = 2.')).toBeNull();
  });
  it('"A." trong thân câu không làm tách sai', () => {
    const t = 'Cho tập A. Khi đó tập A giao B có bao nhiêu phần tử? A. 1 B. 2 C. 3 D. 4';
    const p = parseInlineChoices(t)!;
    expect(p.options).toEqual(['1', '2', '3', '4']);
    expect(p.stem).toBe('Cho tập A. Khi đó tập A giao B có bao nhiêu phần tử?');
  });
  it('cột nhieu chỉ có chữ cái thì dùng phương án trong nội dung', () => {
    const q = { id: 'Q1', atom_id: 'A', noi_dung: txt, key: '', tier: '', dok: 1, do_kho: 'Nhận biết', dap_an: 'B', loi_giai: '', tham_so_hoa: '', nhieu: [{ noiDung: 'A' }, { noiDung: 'C' }] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = normalizeQuestion(q as any, 'A', 'C.A', emptyOrg());
    expect(b.options).toHaveLength(4);
    expect(b.noiDung).toBe('Hàm mục tiêu đạt max tại:');
  });
});
