import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const detailMock = vi.fn();
const atomsMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  fetchSupabaseAtomDetail: (...a: unknown[]) => detailMock(...a),
  querySupabaseAtoms: (...a: unknown[]) => atomsMock(...a),
}));

import { getStandardLesson, listReviewQueue, submitReview } from '@/lib/kho';
import { POST as reviewPOST } from '@/app/api/kho/review/route';
import { GET as queueGET } from '@/app/api/kho/queue/route';
import { GET as standardGET } from '@/app/api/kho/standard/route';
import { RUBRIC_6 } from '@/lib/eval/rubric';

const all = (n: number) => Object.fromEntries(RUBRIC_6.map((c) => [c.id, n]));
const H = { 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' };
let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kho-'));
  process.env.KHO_REVIEWS_FILE = join(dir, 'kho-reviews.json');
  detailMock.mockReset();
  atomsMock.mockReset();
});

describe('submitReview validation', () => {
  it('approve với TB < 4.0 bị từ chối', async () => {
    await expect(
      submitReview('o', { atomId: 'a1', reviewer: 'X', scores: { ...all(4), dung_duoc_ngay: 3, khong_sai_kien_thuc: 3 }, decision: 'approve' }),
    ).rejects.toThrow(/trung bình/);
  });
  it('approve với một tiêu chí < 3 bị từ chối dù TB cao', async () => {
    await expect(
      submitReview('o', { atomId: 'a1', reviewer: 'X', scores: { ...all(5), dung_duoc_ngay: 2 }, decision: 'approve' }),
    ).rejects.toThrow(/dưới 3/);
  });
  it('thiếu tiêu chí, điểm lẻ, reviewer rỗng', async () => {
    const { dung_duoc_ngay: _omit, ...missing } = all(5);
    void _omit;
    await expect(submitReview('o', { atomId: 'a1', reviewer: 'X', scores: missing, decision: 'approve' })).rejects.toThrow(/Thiếu điểm/);
    await expect(submitReview('o', { atomId: 'a1', reviewer: 'X', scores: { ...all(5), dung_duoc_ngay: 4.5 }, decision: 'approve' })).rejects.toThrow(/số nguyên/);
    await expect(submitReview('o', { atomId: 'a1', reviewer: '  ', scores: all(5), decision: 'approve' })).rejects.toThrow(/người duyệt/);
  });
  it('reject điểm thấp vẫn được ghi', async () => {
    const r = await submitReview('o', { atomId: 'a1', reviewer: 'X', scores: all(2), decision: 'reject', note: 'sai' });
    expect(r.decision).toBe('reject');
    expect(r.average).toBe(2);
  });
});

describe('persistence', () => {
  it('giữ lịch sử, tách theo org, đồng thời không mất bản ghi', async () => {
    await Promise.all([
      submitReview('o', { atomId: 'a1', reviewer: 'A', scores: all(2), decision: 'reject' }),
      submitReview('o', { atomId: 'a1', reviewer: 'B', scores: all(5), decision: 'approve' }),
      submitReview('other', { atomId: 'a1', reviewer: 'C', scores: all(5), decision: 'approve' }),
    ]);
    const data = JSON.parse(await readFile(process.env.KHO_REVIEWS_FILE!, 'utf8'));
    expect(data['o::a1']).toHaveLength(2);
    expect(data['other::a1']).toHaveLength(1);
  });
  it('file hỏng được sao lưu và không làm hỏng ghi mới', async () => {
    await writeFile(process.env.KHO_REVIEWS_FILE!, '{not json', 'utf8');
    await submitReview('o', { atomId: 'a1', reviewer: 'A', scores: all(5), decision: 'approve' });
    const files = await readdir(dir);
    expect(files.some((f) => f.includes('.corrupt-'))).toBe(true);
    const data = JSON.parse(await readFile(process.env.KHO_REVIEWS_FILE!, 'utf8'));
    expect(data['o::a1']).toHaveLength(1);
  });
});

const atomFixture = { id: 'a1', code: 'T10-1', title: 'Mệnh đề', grade: 10, subject: 'Toán' };
const detail = (pkgStatus?: string) => ({
  atom: atomFixture,
  packages: pkgStatus ? [{ id: 'p1', status: pkgStatus, fields: {} }] : [],
  factoryAssets: [],
  edges: [],
  questions: [],
  socratic: [],
  tainguyen: [],
});

describe('getStandardLesson status', () => {
  it('khong_co khi chưa có gói', async () => {
    detailMock.mockResolvedValue(detail());
    expect((await getStandardLesson('o', 'a1')).status).toBe('khong_co');
  });
  it('chua_duyet khi gói draft_ai và chưa có duyệt', async () => {
    detailMock.mockResolvedValue(detail('draft_ai'));
    expect((await getStandardLesson('o', 'a1')).status).toBe('chua_duyet');
  });
  it('approved khi Factory approved', async () => {
    detailMock.mockResolvedValue(detail('approved'));
    expect((await getStandardLesson('o', 'a1')).status).toBe('approved');
  });
  it('approved khi duyệt nội bộ approve; reject sau đó thì quay lại chua_duyet', async () => {
    detailMock.mockResolvedValue(detail('draft_ai'));
    await submitReview('o', { atomId: 'a1', reviewer: 'A', scores: all(5), decision: 'approve' });
    const l = await getStandardLesson('o', 'a1');
    expect(l.status).toBe('approved');
    expect(l.review?.reviewer).toBe('A');
    await submitReview('o', { atomId: 'a1', reviewer: 'A', scores: all(2), decision: 'reject' });
    expect((await getStandardLesson('o', 'a1')).status).toBe('chua_duyet');
    expect((await getStandardLesson('other', 'a1')).review).toBeUndefined();
  });
});

describe('listReviewQueue', () => {
  it('gộp trạng thái Factory và duyệt nội bộ', async () => {
    atomsMock.mockResolvedValue({
      totalCount: 3,
      atoms: [
        { id: 'a1', code: 'C1', title: 'Một', hasFactoryPackage: true, factoryAssetCount: 2 },
        { id: 'a2', code: 'C2', title: 'Hai', hasFactoryPackage: true, factoryAssetCount: 1 },
        { id: 'a3', code: 'C3', title: 'Ba', hasFactoryPackage: false },
      ],
    });
    detailMock.mockImplementation(async (id: string) => ({ ...detail(id === 'a1' ? 'approved' : 'draft_ai') }));
    const items = await listReviewQueue('o', { subject: 'toan', grade: '10' });
    const by = Object.fromEntries(items.map((i) => [i.atomId, i.status]));
    expect(by).toEqual({ a1: 'approved', a2: 'chua_duyet', a3: 'khong_co' });
    expect(items[0].atomId).toBe('a2');
    expect(atomsMock).toHaveBeenCalledWith(expect.objectContaining({ subject: 'toan', grade: '10' }));

    await submitReview('o', { atomId: 'a2', reviewer: 'A', scores: all(4), decision: 'approve' });
    const again = await listReviewQueue('o', {});
    expect(again.find((i) => i.atomId === 'a2')?.status).toBe('approved');
  });
});

describe('API routes', () => {
  const post = (body: string) =>
    reviewPOST(new Request('http://x/api/kho/review', { method: 'POST', headers: H, body }));
  it('JSON hỏng => 400, thiếu trường => 400', async () => {
    expect((await post('{bad')).status).toBe(400);
    expect((await post(JSON.stringify({ atomId: 'a1' }))).status).toBe(400);
  });
  it('không đạt cổng => 422 với thông báo tiếng Việt; đạt => 200', async () => {
    const bad = await post(JSON.stringify({ atomId: 'a1', reviewer: 'A', scores: all(3), decision: 'approve' }));
    expect(bad.status).toBe(422);
    expect((await bad.json()).error).toMatch(/Không thể duyệt/);
    const ok = await post(JSON.stringify({ atomId: 'a1', reviewer: 'A', scores: all(5), decision: 'approve' }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).review.average).toBe(5);
  });
  it('queue và standard trả ok; standard thiếu atomId => 400', async () => {
    atomsMock.mockResolvedValue({ atoms: [], totalCount: 0 });
    const q = await queueGET(new Request('http://x/api/kho/queue?subject=toan&grade=10', { headers: H }));
    expect(q.status).toBe(200);
    expect((await q.json()).items).toEqual([]);
    detailMock.mockResolvedValue(detail('approved'));
    const s = await standardGET(new Request('http://x/api/kho/standard?atomId=a1', { headers: H }));
    expect((await s.json()).lesson.status).toBe('approved');
    const bad = await standardGET(new Request('http://x/api/kho/standard', { headers: H }));
    expect(bad.status).toBe(400);
  });
});
