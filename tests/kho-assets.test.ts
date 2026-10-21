import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const detailMock = vi.fn();
const atomsMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  fetchSupabaseAtomDetail: (...a: unknown[]) => detailMock(...a),
  querySupabaseAtoms: (...a: unknown[]) => atomsMock(...a),
}));
const genMock = vi.fn();
vi.mock('@/lib/resources', () => ({
  generateAllResources: (...a: unknown[]) => genMock(...a),
}));

import {
  getStandardLesson,
  invalidateLibraryCache,
  listAssets,
  listLibrary,
  listVersions,
  saveDraftAssets,
  submitReview,
} from '@/lib/kho';
import { POST as generatePOST } from '@/app/api/kho/resources/generate/route';
import { GET as resourcesGET } from '@/app/api/kho/resources/route';
import { GET as versionsGET } from '@/app/api/kho/versions/route';
import { GET as libraryGET } from '@/app/api/kho/library/route';
import { RUBRIC_6 } from '@/lib/eval/rubric';
import type { Artifact } from '@/lib/resources/types';

const all = (n: number) => Object.fromEntries(RUBRIC_6.map((c) => [c.id, n]));
const H = { 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' };
const art = (kind: 'text' | 'mindmap', title = 't'): Artifact =>
  kind === 'text'
    ? { kind: 'text', title, data: { title, sections: [{ heading: 'h', body: title }] } }
    : { kind: 'mindmap', title, data: { title, root: { id: 'r', label: title } } };

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kho-assets-'));
  process.env.KHO_REVIEWS_FILE = join(dir, 'kho-reviews.json');
  process.env.KHO_ASSETS_FILE = join(dir, 'kho-assets.json');
  detailMock.mockReset();
  atomsMock.mockReset();
  genMock.mockReset();
  invalidateLibraryCache();
  detailMock.mockResolvedValue({
    atom: { id: 'a1', code: 'T10.1', title: 'Hàm số', grade: 10, subject: 'Toán' },
    packages: [{ id: 'p1', status: 'draft_ai', fields: { objective: 'x' } }],
    factoryAssets: [],
    questions: [],
    socratic: [],
    edges: [],
  });
});

describe('phiên bản bản chuẩn', () => {
  it('nháp không lọt vào StandardLesson; duyệt đóng băng v1; sinh lại tạo nháp, duyệt lại thành v2', async () => {
    await saveDraftAssets('o', 'a1', [{ artifact: art('text', 'bản 1'), modelUsed: 'm' }]);
    let std = await getStandardLesson('o', 'a1');
    expect(std.artifacts).toBeUndefined();
    expect(std.version).toBeUndefined();
    expect((await listAssets('o', 'a1'))[0].status).toBe('draft');

    const r1 = await submitReview('o', { atomId: 'a1', reviewer: 'X', scores: all(5), decision: 'approve' });
    expect(r1.version).toBe(1);
    std = await getStandardLesson('o', 'a1');
    expect(std.version).toBe(1);
    expect(std.artifacts).toHaveLength(1);
    expect((await listAssets('o', 'a1'))[0]).toMatchObject({ status: 'approved', version: 1 });

    // sinh lại: bản chuẩn vẫn là bản đã duyệt cũ
    await saveDraftAssets('o', 'a1', [
      { artifact: art('text', 'bản 2'), modelUsed: 'm' },
      { artifact: art('mindmap', 'sơ đồ'), modelUsed: 'm' },
    ]);
    std = await getStandardLesson('o', 'a1');
    expect(std.version).toBe(1);
    expect(std.artifacts).toHaveLength(1);
    expect(std.artifacts?.[0].title).toBe('bản 1');

    const r2 = await submitReview('o', { atomId: 'a1', reviewer: 'Y', scores: all(4), decision: 'approve' });
    expect(r2.version).toBe(2);
    std = await getStandardLesson('o', 'a1');
    expect(std.version).toBe(2);
    expect(std.artifacts?.map((a) => a.title).sort()).toEqual(['bản 2', 'sơ đồ']);
    const vs = await listVersions('o', 'a1');
    expect(vs.map((v) => v.version)).toEqual([1, 2]);
    expect(vs[0].artifacts[0].title).toBe('bản 1'); // v1 bất biến
  });

  it('reject giữ nguyên bản đã duyệt trước và không tạo phiên bản', async () => {
    await saveDraftAssets('o', 'a1', [{ artifact: art('text', 'v1'), modelUsed: 'm' }]);
    await submitReview('o', { atomId: 'a1', reviewer: 'X', scores: all(5), decision: 'approve' });
    await saveDraftAssets('o', 'a1', [{ artifact: art('text', 'nháp mới'), modelUsed: 'm' }]);
    const rej = await submitReview('o', { atomId: 'a1', reviewer: 'X', scores: all(2), decision: 'reject', note: 'sai' });
    expect(rej.version).toBeUndefined();
    const std = await getStandardLesson('o', 'a1');
    expect(std.version).toBe(1);
    expect(std.artifacts?.[0].title).toBe('v1');
    expect((await listAssets('o', 'a1'))[0].status).toBe('draft');
  });

  it('approve bị từ chối vì điểm thấp thì không đóng băng', async () => {
    await saveDraftAssets('o', 'a1', [{ artifact: art('text'), modelUsed: 'm' }]);
    await expect(submitReview('o', { atomId: 'a1', reviewer: 'X', scores: all(3), decision: 'approve' })).rejects.toThrow();
    expect(await listVersions('o', 'a1')).toHaveLength(0);
  });

  it('tách theo org', async () => {
    await saveDraftAssets('o', 'a1', [{ artifact: art('text'), modelUsed: 'm' }]);
    await submitReview('o', { atomId: 'a1', reviewer: 'X', scores: all(5), decision: 'approve' });
    expect(await listAssets('khac', 'a1')).toHaveLength(0);
    expect(await listVersions('khac', 'a1')).toHaveLength(0);
    expect((await getStandardLesson('khac', 'a1')).artifacts).toBeUndefined();
  });

  it('ghi đồng thời không mất dữ liệu', async () => {
    await Promise.all([
      saveDraftAssets('o', 'a1', [{ artifact: art('text'), modelUsed: 'm' }]),
      saveDraftAssets('o', 'a1', [{ artifact: art('mindmap'), modelUsed: 'm' }]),
    ]);
    expect((await listAssets('o', 'a1')).map((a) => a.kind).sort()).toEqual(['mindmap', 'text']);
  });

  it('file hỏng được sao lưu và đọc lại như rỗng', async () => {
    await writeFile(process.env.KHO_ASSETS_FILE as string, '{hỏng', 'utf8');
    expect(await listAssets('o', 'a1')).toEqual([]);
    expect((await readdir(dir)).some((f) => f.includes('kho-assets.json.corrupt-'))).toBe(true);
    await saveDraftAssets('o', 'a1', [{ artifact: art('text'), modelUsed: 'm' }]);
    expect(await listAssets('o', 'a1')).toHaveLength(1);
  });
});

describe('API sinh tài nguyên', () => {
  const post = (body: unknown) =>
    generatePOST(new Request('http://x/api/kho/resources/generate', { method: 'POST', headers: H, body: typeof body === 'string' ? body : JSON.stringify(body) }));

  it('JSON hỏng và tham số sai trả 400', async () => {
    expect((await post('{x')).status).toBe(400);
    expect((await post({ atomId: 'a1', kinds: ['khong_co_dang_nay'] })).status).toBe(400);
  });

  it('sinh bằng mock, lưu nháp, lỗi từng dạng trả riêng', async () => {
    genMock.mockResolvedValue({
      artifacts: [art('text', 'bài đọc')],
      errors: [{ kind: 'video', error: 'quá thời gian' }],
    });
    const res = await post({ atomId: 'a1', kinds: ['text', 'video'] });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.saved).toHaveLength(1);
    expect(j.errors).toEqual([{ kind: 'video', error: 'quá thời gian' }]);
    const [ctx, kinds] = genMock.mock.calls[0];
    expect(kinds).toEqual(['text', 'video']);
    expect(ctx.grounding).toContain('Hàm số');
    const list = await (await resourcesGET(new Request('http://x/api/kho/resources?atomId=a1', { headers: H }))).json();
    expect(list.assets).toHaveLength(1);
    expect(list.assets[0].status).toBe('draft');
  });

  it('bài không có gói thì 422, lỗi bên trong thì 500 thông báo chung', async () => {
    detailMock.mockResolvedValueOnce({ atom: { id: 'a2', title: 'x', grade: 10, subject: 'Toán' }, packages: [], factoryAssets: [], questions: [], socratic: [], edges: [] });
    expect((await post({ atomId: 'a2' })).status).toBe(422);
    genMock.mockRejectedValue(new Error('bí mật nội bộ'));
    const res = await post({ atomId: 'a1' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('bí mật');
  });

  it('versions và library', async () => {
    await saveDraftAssets('vietanh', 'a1', [{ artifact: art('text'), modelUsed: 'm' }]);
    await submitReview('vietanh', { atomId: 'a1', reviewer: 'X', scores: all(5), decision: 'approve' });
    const v = await (await versionsGET(new Request('http://x/api/kho/versions?atomId=a1', { headers: H }))).json();
    expect(v.versions[0]).toMatchObject({ version: 1, kinds: ['text'] });
    expect((await versionsGET(new Request('http://x/api/kho/versions', { headers: H }))).status).toBe(400);

    atomsMock.mockResolvedValue({
      atoms: [
        { id: 'a1', code: 'T1', title: 'Hàm số', chapter: 'Chương 1', lesson: 'Bài 1', hasFactoryPackage: true },
        { id: 'a3', code: 'T3', title: 'Khác', chapter: 'Chương 1', lesson: 'Bài 2', hasFactoryPackage: false },
      ],
      totalCount: 2,
    });
    const lib = await (await libraryGET(new Request('http://x/api/kho/library?subject=toan&grade=10', { headers: H }))).json();
    const a1 = lib.items.find((i: { atomId: string }) => i.atomId === 'a1');
    expect(a1).toMatchObject({ status: 'approved', version: 1, kinds: ['text'] });
    expect(lib.items.find((i: { atomId: string }) => i.atomId === 'a3').status).toBe('khong_co');
    // lần 2 dùng cache: không gọi lại Supabase
    const calls = atomsMock.mock.calls.length;
    await listLibrary('vietanh', { subject: 'toan', grade: '10' });
    expect(atomsMock.mock.calls.length).toBe(calls);
  });
});
