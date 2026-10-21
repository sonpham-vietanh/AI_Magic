import { mkdtempSync, readFileSync, statSync } from 'node:fs';
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
  fetchSupabaseAtomDetail: async () => ({
    atom: { id: 'A1', code: 'T10.A1', title: 'Hàm số' },
    packages: [], factoryAssets: [], edges: [], socratic: [], tainguyen: [], questions,
  }),
  querySupabaseAtoms: async () => [],
}));

import { draftExam, generateQuiz, getExam, reviewExam, submitExam } from '@/lib/assessment';
import { setClock } from '@/lib/assessment/store';
import { allocatePoints, sumPoints } from '@/lib/assessment/examDoc';
import { GET as itemGET } from '@/app/api/assessment/bank/item/route';
import { GET as examsGET } from '@/app/api/assessment/exams/route';
import { POST as reviewPOST } from '@/app/api/assessment/exam/review/route';
import { checkExamStructure } from '@/lib/workflows/validators';

const ORG = 'vietanh';
const H = { 'Sec-Fetch-Site': 'same-origin', 'content-type': 'application/json' };
const base = { orgId: ORG, atomIds: ['A1'], bloomLevels: ['Nhớ'], language: 'vi' as const, createdBy: 'Gv Lan', perCell: 3 };
type Doc = { items: { questionId: string }[] };

beforeEach(() => {
  process.env.ASSESSMENT_STORE_FILE = join(mkdtempSync(join(tmpdir(), 'gate-')), 'a.json');
  process.env.REVIEWER_KEY = 'ma-duyet';
  setClock(() => new Date('2026-10-21T03:00:00Z'));
  questions = [0, 1, 2, 3, 4, 5].map((i) => mk(`nb${i}`, 'Nhận biết', 1));
});

describe('so sánh người dùng NFC/hoa-thường', () => {
  it('người soạn không tự duyệt dù gõ khác hoa-thường/khoảng trắng', async () => {
    const e = await draftExam(base);
    await submitExam({ orgId: ORG, examId: e.examId, actor: '  gv   LAN ' });
    await expect(reviewExam({ orgId: ORG, examId: e.examId, reviewer: 'GV  lan', decision: 'duyet', note: '' })).rejects.toThrow(/tự duyệt/);
  });
  it('assignedReviewers so khớp chuẩn hoá', async () => {
    const e = await draftExam(base);
    await submitExam({ orgId: ORG, examId: e.examId, actor: 'Gv Lan', reviewers: ['Tổ Trưởng'] });
    await expect(reviewExam({ orgId: ORG, examId: e.examId, reviewer: 'Người Lạ', decision: 'duyet', note: '' })).rejects.toThrow(/danh sách/);
    expect((await reviewExam({ orgId: ORG, examId: e.examId, reviewer: 'tổ  trưởng', decision: 'duyet', note: 'ok' })).status).toBe('da_duyet');
  });
});

describe('cổng người duyệt ở route', () => {
  it('503 khi chưa đặt mã, 403 khi sai, qua cổng khi đúng', async () => {
    const e = await draftExam(base);
    await submitExam({ orgId: ORG, examId: e.examId, actor: 'Gv Lan' });
    const body = JSON.stringify({ examId: e.examId, reviewer: 'To Truong', decision: 'duyet', note: '' });
    const call = (h: Record<string, string>) =>
      reviewPOST(new Request('http://x/api/assessment/exam/review', { method: 'POST', headers: h, body }));
    delete process.env.REVIEWER_KEY;
    expect((await call({ ...H, 'x-reviewer-key': 'ma-duyet' })).status).toBe(503);
    process.env.REVIEWER_KEY = 'ma-duyet';
    expect((await call(H)).status).toBe(403);
    expect((await call({ ...H, 'x-reviewer-key': 'sai' })).status).toBe(403);
    expect((await call({ ...H, 'x-reviewer-key': 'ma-duyet' })).status).toBe(200);
  });
});

describe('lộ nội dung đề', () => {
  it('danh sách đề ẩn createdBy nếu không có mã người duyệt', async () => {
    await draftExam(base);
    const anon = await (await examsGET(new Request('http://x/api/assessment/exams', { headers: H }))).json();
    expect(JSON.stringify(anon)).not.toContain('Gv Lan');
    expect(anon.exams[0].createdBy).toBeUndefined();
    const rv = await (await examsGET(new Request('http://x/api/assessment/exams', { headers: { ...H, 'x-reviewer-key': 'ma-duyet' } }))).json();
    expect(rv.exams[0].createdBy).toBe('Gv Lan');
  });

  it('bank/item không trả đáp án khi câu thuộc đề chưa công bố; câu tự do thì trả', async () => {
    const e = await draftExam({ ...base, perCell: 2 });
    const doc = (await getExam({ orgId: ORG, examId: e.examId, actor: 'Gv Lan' })) as unknown as Doc;
    const lockedId = doc.items[0].questionId;
    const freeId = questions.map((q) => q.id).find((id) => !doc.items.some((i) => i.questionId === id))!;
    const get = async (id: string) =>
      (await itemGET(new Request(`http://x/api/assessment/bank/item?atomId=A1&id=${id}`, { headers: H }))).json();
    const l = await get(lockedId);
    expect(l.item.locked).toBe(true);
    expect(JSON.stringify(l)).not.toContain('ĐA ');
    expect(JSON.stringify(l)).not.toContain('LG ');
    const f = await get(freeId);
    expect(f.item.dapAn).toBe(`ĐA ${freeId}`);
  });

  it('quiz không chọn câu đang khoá', async () => {
    const e = await draftExam({ ...base, perCell: 4 });
    const doc = (await getExam({ orgId: ORG, examId: e.examId, actor: 'Gv Lan' })) as unknown as Doc;
    const taken = new Set(doc.items.map((i) => i.questionId));
    const quiz = await generateQuiz({ orgId: ORG, atomId: 'A1', bloomLevels: ['Nhớ'], language: 'vi', style: '', count: 10 });
    expect(quiz.questionIds.every((id) => !taken.has(id))).toBe(true);
    expect(quiz.notes.join(' ')).toContain('khoá');
  });
});

describe('trùng câu giữa hai bản nháp', () => {
  it('đề thứ hai bị chặn khi duyệt vì trùng với đề đã duyệt', async () => {
    const e1 = await draftExam({ ...base, perCell: 3 });
    const e2 = await draftExam({ ...base, perCell: 3, createdBy: 'Gv Hoa' }); // chưa gửi duyệt nên chưa khoá: chọn trùng
    await submitExam({ orgId: ORG, examId: e1.examId, actor: 'Gv Lan' });
    await reviewExam({ orgId: ORG, examId: e1.examId, reviewer: 'To', decision: 'duyet', note: '' });
    await submitExam({ orgId: ORG, examId: e2.examId, actor: 'Gv Hoa' });
    const d1 = (await getExam({ orgId: ORG, examId: e1.examId, actor: 'Gv Lan' })) as unknown as Doc;
    const d2 = (await getExam({ orgId: ORG, examId: e2.examId, actor: 'Gv Hoa' })) as unknown as Doc;
    expect(d2.items.some((i) => d1.items.some((j) => j.questionId === i.questionId))).toBe(true);
    await expect(reviewExam({ orgId: ORG, examId: e2.examId, reviewer: 'To', decision: 'duyet', note: '' })).rejects.toThrow(/trùng/);
  });
});

describe('điểm và nhật ký', () => {
  it('tổng điểm ma trận đúng 10 và khớp allocatePoints', async () => {
    questions = [0, 1, 2, 3, 4, 5, 6].map((i) => mk(`nb${i}`, 'Nhận biết', 1));
    const e = await draftExam({ ...base, perCell: 7 });
    const m = e.matrix;
    expect(sumPoints(m.rows.map((r) => r.points))).toBe(10);
    expect(sumPoints(allocatePoints(m.totalSelected))).toBe(10);
    expect(checkExamStructure(m, e.markdown).find((c) => c.id === 'tong_10_diem')!.ok).toBe(true);
  });

  it('getExam không ghi lại file mỗi lần GET', async () => {
    const e = await draftExam(base);
    const f = process.env.ASSESSMENT_STORE_FILE!;
    await getExam({ orgId: ORG, examId: e.examId, actor: 'Gv Lan' });
    const before = readFileSync(f, 'utf8');
    const t = statSync(f).mtimeMs;
    for (let i = 0; i < 5; i++) await getExam({ orgId: ORG, examId: e.examId, actor: 'Gv Lan' });
    expect(readFileSync(f, 'utf8')).toBe(before);
    expect(statSync(f).mtimeMs).toBe(t);
  });

  it('accessLog bị giới hạn', async () => {
    const e = await draftExam(base);
    for (let i = 0; i < 260; i++) {
      setClock(() => new Date(Date.parse('2026-10-21T03:00:00Z') + i * 11 * 60_000));
      await getExam({ orgId: ORG, examId: e.examId, actor: 'Gv Lan' });
    }
    const d = (await getExam({ orgId: ORG, examId: e.examId, actor: 'Gv Lan' })) as { accessLog: unknown[] };
    expect(d.accessLog.length).toBeLessThanOrEqual(200);
  });
});
