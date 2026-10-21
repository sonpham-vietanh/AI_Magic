import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Q = {
  id: string; atom_id: string; noi_dung: string; key: string; tier: string;
  dok: number; do_kho: string; dap_an: string; loi_giai: string; tham_so_hoa: string; nhieu: null;
};
const mk = (id: string, do_kho: string, dok: number): Q => ({
  id, atom_id: 'A1', noi_dung: `Nội dung ${id}`, key: 'k', tier: 't', dok, do_kho,
  dap_an: `ĐA ${id}`, loi_giai: `LG ${id}`, tham_so_hoa: '', nhieu: null,
});
let questions: Q[] = [];

vi.mock('@/lib/supabase', () => ({
  fetchSupabaseAtomDetail: async (id: string) => ({
    atom: id === 'NONE' ? null : { id: 'A1', code: 'T10.A1', title: 'Hàm số' },
    packages: [], factoryAssets: [], edges: [], socratic: [], tainguyen: [],
    questions,
  }),
  querySupabaseAtoms: async () => [],
}));

import { BLOOM_TO_TT22, draftExam, generateQuiz, getExam, reviewExam, submitExam } from '@/lib/assessment';
import { deriveBloom, recordResult, loadBank } from '@/lib/assessment/bank';
import { setClock } from '@/lib/assessment/store';
import { GET as bankGET } from '@/app/api/assessment/bank/route';
import { POST as quizPOST } from '@/app/api/assessment/quiz/route';

const ORG = 'vietanh';
const req = (url: string, body?: unknown, raw?: string) =>
  new Request(`http://localhost${url}`, {
    method: body !== undefined || raw !== undefined ? 'POST' : 'GET',
    headers: { 'Sec-Fetch-Site': 'same-origin', 'content-type': 'application/json' },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

function fill(n: { nb: number; th: number; vd: number }) {
  questions = [];
  for (let i = 0; i < n.nb; i++) questions.push(mk(`nb${i}`, 'Nhận biết', 1));
  for (let i = 0; i < n.th; i++) questions.push(mk(`th${i}`, 'Thông hiểu', 2));
  for (let i = 0; i < n.vd; i++) questions.push(mk(`vd${i}`, 'Vận dụng', 2));
}

type M = { totalSelected: number; pointsPerQuestion: number; shortfall: string[]; totals: Record<string, { selected: number }> };

beforeEach(() => {
  process.env.ASSESSMENT_STORE_FILE = join(mkdtempSync(join(tmpdir(), 'asm-')), 'a.json');
  setClock(() => new Date('2026-10-21T03:00:00Z'));
  fill({ nb: 3, th: 3, vd: 3 });
});

describe('Bloom <-> TT22', () => {
  it('ánh xạ đúng', () => {
    expect(BLOOM_TO_TT22['Nhớ']).toBe('nhan_biet');
    expect(BLOOM_TO_TT22['Hiểu']).toBe('thong_hieu');
    expect(BLOOM_TO_TT22['Vận dụng']).toBe('van_dung');
    expect(BLOOM_TO_TT22['Phân tích']).toBe('van_dung');
    expect(BLOOM_TO_TT22['Đánh giá']).toBe('van_dung_cao');
    expect(BLOOM_TO_TT22['Sáng tạo']).toBe('van_dung_cao');
  });
  it('suy bloom từ do_kho/dok', () => {
    expect(deriveBloom('Nhận biết', 1)).toBe('Nhớ');
    expect(deriveBloom('Thông hiểu', 2)).toBe('Hiểu');
    expect(deriveBloom('Vận dụng', 2)).toBe('Vận dụng');
    expect(deriveBloom('Vận dụng', 3)).toBe('Phân tích');
  });
  it('độ khó thực đo null cho đến khi có kết quả', async () => {
    expect((await loadBank(ORG, 'A1')).items[0].difficultyMeasured).toBeNull();
    await recordResult(ORG, 'nb0', true);
    await recordResult(ORG, 'nb0', false);
    const it0 = (await loadBank(ORG, 'A1')).items.find((i) => i.id === 'nb0')!;
    expect(it0.difficultyMeasured).toBe(0.5);
  });
});

describe('Quiz (A)', () => {
  it('đúng số câu, đúng bậc, giới hạn 10', async () => {
    const r = await generateQuiz({ orgId: ORG, atomId: 'A1', bloomLevels: ['Hiểu'], language: 'vi', style: '', count: 2 });
    expect(r.questionIds).toHaveLength(2);
    expect(r.questionIds.every((id) => id.startsWith('th'))).toBe(true);
    expect(r.sections.map((s) => s.heading)).toEqual(['Câu hỏi', 'Đáp án & giải thích (cho GV)']);
    const big = await generateQuiz({ orgId: ORG, atomId: 'A1', bloomLevels: ['Nhớ', 'Hiểu', 'Vận dụng'], language: 'vi', style: '', count: 99 });
    expect(big.questionIds).toHaveLength(9);
  });
  it('thiếu bậc thì lấy bậc gần nhất và cảnh báo; không bịa bản dịch', async () => {
    const r = await generateQuiz({ orgId: ORG, atomId: 'A1', bloomLevels: ['Hiểu'], language: 'song_ngu', style: '', count: 5 });
    expect(r.questionIds).toHaveLength(5);
    expect(r.sections[0].body).toContain('bậc gần nhất');
    expect(r.sections[0].body).toContain('chưa có bản dịch');
  });
  it('API: JSON hỏng -> 400, hợp lệ -> ok', async () => {
    expect((await quizPOST(req('/api/assessment/quiz', undefined, '{bad'))).status).toBe(400);
    const res = await quizPOST(req('/api/assessment/quiz', { atomId: 'A1', bloomLevels: ['Nhớ'], language: 'vi', style: 'x', count: 2 }));
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.quiz.questionIds).toHaveLength(2);
  });
  it('API bank không lộ đáp án', async () => {
    const j = await (await bankGET(req('/api/assessment/bank?atomId=A1'))).json();
    expect(j.items.length).toBe(9);
    expect(JSON.stringify(j)).not.toContain('ĐA ');
    expect(JSON.stringify(j)).not.toContain('LG ');
  });
});

describe('Đề kiểm tra (B)', () => {
  const base = { orgId: ORG, atomIds: ['A1'], bloomLevels: ['Nhớ', 'Hiểu', 'Vận dụng'], language: 'vi' as const, createdBy: 'gv.lan' };

  it('ma trận TT22 và điểm tổng 10', async () => {
    const e = await draftExam({ ...base, perCell: 2 });
    const m = e.matrix as M;
    expect(m.totalSelected).toBe(6);
    expect(m.shortfall).toEqual([]);
    expect(m.totals.van_dung_cao.selected).toBe(0);
    expect(Math.round(m.pointsPerQuestion * 6 * 10) / 10).toBe(10);
    expect(e.status).toBe('nhap');
    expect(e.examId).toMatch(/^DT-/);
    expect(e.markdown).toContain('Ma trận');
  });

  it('shortfall khi ngân hàng không đủ, không bịa câu', async () => {
    fill({ nb: 1, th: 3, vd: 3 });
    const e = await draftExam({ ...base, perCell: 2 });
    const m = e.matrix as M;
    expect(m.totalSelected).toBe(5);
    expect(m.shortfall.join(' ')).toContain('thiếu 1/2');
    expect(e.sections.some((s) => s.heading.includes('Thiếu câu hỏi'))).toBe(true);
  });

  it('chống trùng 3 năm với đồng hồ tiêm', async () => {
    fill({ nb: 2, th: 0, vd: 0 });
    const d = { ...base, bloomLevels: ['Nhớ'], perCell: 2 };
    const e1 = await draftExam(d);
    await submitExam({ orgId: ORG, examId: e1.examId, actor: 'gv.lan' });
    await reviewExam({ orgId: ORG, examId: e1.examId, reviewer: 'to.truong', decision: 'duyet', note: 'ok' });

    setClock(() => new Date('2028-10-21T03:00:00Z'));
    const e2 = await draftExam(d);
    expect((e2.matrix as M).totalSelected).toBe(0);

    setClock(() => new Date('2029-10-22T03:00:00Z'));
    const e3 = await draftExam(d);
    expect((e3.matrix as M).totalSelected).toBe(2);
  });

  it('chưa duyệt thì chưa tính "đã dùng"', async () => {
    fill({ nb: 2, th: 0, vd: 0 });
    const d = { ...base, bloomLevels: ['Nhớ'], perCell: 2 };
    await draftExam(d);
    const e2 = await draftExam(d);
    expect((e2.matrix as M).totalSelected).toBe(2);
    expect((await loadBank(ORG, 'A1')).items.every((i) => i.lastUsedAt === null)).toBe(true);
  });

  it('luồng trạng thái và chốt chặn duyệt', async () => {
    const e = await draftExam(base);
    await expect(reviewExam({ orgId: ORG, examId: e.examId, reviewer: 'to.truong', decision: 'duyet', note: '' })).rejects.toThrow(/chờ duyệt/);
    await expect(submitExam({ orgId: ORG, examId: e.examId, actor: 'ai.do' })).rejects.toThrow(/người soạn/);
    expect((await submitExam({ orgId: ORG, examId: e.examId, actor: 'gv.lan', reviewers: ['to.truong'] })).status).toBe('cho_duyet');
    await expect(reviewExam({ orgId: ORG, examId: e.examId, reviewer: 'gv.lan', decision: 'duyet', note: '' })).rejects.toThrow(/tự duyệt/);
    await expect(reviewExam({ orgId: ORG, examId: e.examId, reviewer: 'nguoi.la', decision: 'duyet', note: '' })).rejects.toThrow(/danh sách/);
    await expect(reviewExam({ orgId: ORG, examId: e.examId, reviewer: 'to.truong', decision: 'tu_choi', note: ' ' })).rejects.toThrow(/lý do/);
    expect((await reviewExam({ orgId: ORG, examId: e.examId, reviewer: 'to.truong', decision: 'duyet', note: 'đạt' })).status).toBe('da_duyet');
    const lb = await loadBank(ORG, 'A1');
    expect(lb.items.filter((i) => i.lastUsedAt).length).toBe(6);
  });

  it('từ chối rồi gửi duyệt lại; ngày thi sai định dạng bị chặn', async () => {
    await expect(draftExam({ ...base, examDate: '2026-13-40' })).rejects.toThrow(/Ngày thi/);
    const e = await draftExam(base);
    await submitExam({ orgId: ORG, examId: e.examId, actor: 'gv.lan' });
    expect((await reviewExam({ orgId: ORG, examId: e.examId, reviewer: 'tt', decision: 'tu_choi', note: 'thiếu câu' })).status).toBe('tu_choi');
    expect((await submitExam({ orgId: ORG, examId: e.examId, actor: 'gv.lan' })).status).toBe('cho_duyet');
  });

  it('khóa nội dung trước ngày thi + nhật ký truy cập; mở sau ngày thi', async () => {
    const e = await draftExam({ ...base, examDate: '2026-11-01' });
    const other = (await getExam({ orgId: ORG, examId: e.examId, actor: 'hs.tom' })) as Record<string, unknown>;
    expect(other.locked).toBe(true);
    expect(other.markdown).toBeUndefined();
    expect(other.matrix).toBeDefined();
    expect(other.accessLog).toBeUndefined();

    const owner = (await getExam({ orgId: ORG, examId: e.examId, actor: 'gv.lan' })) as Record<string, unknown>;
    expect(owner.locked).toBe(false);
    expect(String(owner.markdown)).toContain('Nội dung');
    const log = owner.accessLog as { actor: string; action: string }[];
    expect(log.map((l) => l.action)).toEqual(['tao_de', 'bi_chan_xem_noi_dung', 'xem_noi_dung']);

    setClock(() => new Date('2026-11-01T03:00:00Z'));
    const open = (await getExam({ orgId: ORG, examId: e.examId, actor: 'hs.tom' })) as Record<string, unknown>;
    expect(open.locked).toBe(false);
  });
});
