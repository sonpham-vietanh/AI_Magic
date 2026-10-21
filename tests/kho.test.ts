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
const HR = { ...H, 'x-reviewer-key': 'ma-duyet' };
let dir = '';

beforeEach(async () => {
  process.env.REVIEWER_KEY = 'ma-duyet';
  dir = await mkdtemp(join(tmpdir(), 'kho-'));
  process.env.KHO_REVIEWS_FILE = join(dir, 'kho-reviews.json');
  process.env.KHO_ASSETS_FILE = join(dir, 'kho-assets.json');
  detailMock.mockReset();
  atomsMock.mockReset();
  detailMock.mockResolvedValue(detail('draft_ai'));
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
  it('Factory approved KHÔNG đồng nghĩa đã duyệt bởi Việt Anh', async () => {
    detailMock.mockResolvedValue(detail('approved'));
    const l = await getStandardLesson('o', 'a1');
    expect(l.status).toBe('chua_duyet');
    expect(l.factoryApproved).toBe(true);
  });
  it('lần duyệt mới nhất là reject thì không phục vụ từ Kho dù Factory approved', async () => {
    detailMock.mockResolvedValue(detail('approved'));
    await submitReview('o', { atomId: 'a1', reviewer: 'A', scores: all(5), decision: 'approve' });
    await submitReview('o', { atomId: 'a1', reviewer: 'A', scores: all(2), decision: 'reject' });
    const l = await getStandardLesson('o', 'a1');
    expect(l.status).toBe('chua_duyet');
    expect(l.artifacts).toBeUndefined();
    expect(l.version).toBeUndefined();
  });
  it('ưu tiên gói đã đóng băng thay vì Factory đọc trực tiếp', async () => {
    detailMock.mockResolvedValue(detail('draft_ai'));
    await submitReview('o', { atomId: 'a1', reviewer: 'A', scores: all(5), decision: 'approve' });
    detailMock.mockResolvedValue({ ...detail('draft_ai'), packages: [{ id: 'doi', status: 'draft_ai' }] });
    const l = await getStandardLesson('o', 'a1');
    expect((l.packages[0] as { id: string }).id).toBe('p1');
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
    detailMock.mockImplementation(async (id: string) => ({ ...detail(id === 'a1' ? 'approved' : 'draft_ai'), atom: { ...atomFixture, id, code: `C-${id}` } }));
    const items = await listReviewQueue('o', { subject: 'toan', grade: '10' });
    const by = Object.fromEntries(items.map((i) => [i.atomId, i.status]));
    expect(by).toEqual({ a1: 'chua_duyet', a2: 'chua_duyet', a3: 'khong_co' });
    expect(atomsMock).toHaveBeenCalledWith(expect.objectContaining({ subject: 'toan', grade: '10' }));

    await submitReview('o', { atomId: 'a2', reviewer: 'A', scores: all(4), decision: 'approve' });
    const again = await listReviewQueue('o', {});
    expect(again.find((i) => i.atomId === 'a2')?.status).toBe('approved');
  });
});

describe('API routes', () => {
  const post = (body: string) =>
    reviewPOST(new Request('http://x/api/kho/review', { method: 'POST', headers: HR, body }));
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
    expect((await s.json()).lesson.status).toBe('chua_duyet');
    const bad = await standardGET(new Request('http://x/api/kho/standard', { headers: H }));
    expect(bad.status).toBe(400);
  });
});

describe('cổng người duyệt và kiểm tra bài', () => {
  const body = JSON.stringify({ atomId: 'a1', reviewer: 'A', scores: all(5), decision: 'approve' });
  const raw = (headers: Record<string, string>) =>
    reviewPOST(new Request('http://x/api/kho/review', { method: 'POST', headers, body }));
  it('chưa đặt REVIEWER_KEY => 503; thiếu/sai mã => 403; đúng mã => 200', async () => {
    delete process.env.REVIEWER_KEY;
    expect((await raw(HR)).status).toBe(503);
    process.env.REVIEWER_KEY = 'ma-duyet';
    expect((await raw(H)).status).toBe(403);
    expect((await raw({ ...H, 'x-reviewer-key': 'sai' })).status).toBe(403);
    expect((await raw(HR)).status).toBe(200);
  });
  it('atom không tồn tại hoặc mã không khớp bị từ chối, không ghi gì', async () => {
    detailMock.mockResolvedValue({ ...detail(), atom: null });
    await expect(submitReview('o', { atomId: 'zzz', reviewer: 'A', scores: all(5), decision: 'reject' })).rejects.toThrow(/Không tìm thấy bài/);
    detailMock.mockResolvedValue(detail('draft_ai'));
    await expect(submitReview('o', { atomId: 'khac', reviewer: 'A', scores: all(5), decision: 'reject' })).rejects.toThrow(/không khớp/);
  });
  it('nhận mã code và lưu theo id chuẩn', async () => {
    await submitReview('o', { atomId: 'T10-1', reviewer: 'A', scores: all(5), decision: 'approve' });
    const data = JSON.parse(await readFile(process.env.KHO_REVIEWS_FILE!, 'utf8'));
    expect(Object.keys(data)).toEqual(['o::a1']);
  });
});
