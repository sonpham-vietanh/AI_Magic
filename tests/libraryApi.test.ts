import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Slim {
  id: string;
  code: string;
  title: string;
  subject: string;
  subjectCode: string;
  grade: number;
  chapter: string;
  lesson: string;
  ord: number;
  hasFactoryPackage: boolean;
  factoryPackageCount: number;
  factoryAssetCount: number;
}

const mk = (code: string, title: string, subjectCode: string, grade: number, chapter: string, lesson: string, pkg = false): Slim => ({
  id: code,
  code,
  title,
  subject: subjectCode === 'toan' ? 'Toán' : 'Vật lí',
  subjectCode,
  grade,
  chapter,
  lesson,
  ord: 10,
  hasFactoryPackage: pkg,
  factoryPackageCount: pkg ? 1 : 0,
  factoryAssetCount: 0,
});

let DATA: Slim[] = [];
vi.mock('@/lib/supabase', () => ({
  fetchSupabaseAtomDetail: async () => ({ atom: null, packages: [] }),
  querySupabaseAtoms: async () => ({ atoms: [], totalCount: 0 }),
  listAtomIndex: async (p: { subject?: string; grade?: string } = {}) =>
    DATA.filter(
      (a) =>
        (!p.subject || p.subject === 'all' || a.subjectCode === p.subject) && (!p.grade || p.grade === 'all' || String(a.grade) === p.grade),
    ),
  summarizeCoverage: (atoms: Slim[]) => {
    const cov: Record<string, Record<string, number>> = {};
    for (const a of atoms) {
      cov[a.subjectCode] ||= {};
      cov[a.subjectCode][String(a.grade)] = (cov[a.subjectCode][String(a.grade)] || 0) + 1;
    }
    return cov;
  },
}));

import { GET } from '@/app/api/kho/library/route';

const H = { 'Sec-Fetch-Site': 'same-origin' };
let ip = 0;
const get = (qs: string) =>
  GET(new Request(`http://x/api/kho/library?${qs}`, { headers: { ...H, 'x-forwarded-for': `10.9.${Math.floor(ip / 250)}.${ip++ % 250}` } }));

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lib-api-'));
  process.env.KHO_REVIEWS_FILE = join(dir, 'kho-reviews.json');
  process.env.KHO_ASSETS_FILE = join(dir, 'kho-assets.json');
  DATA = [
    mk('TO07-C04-D03', 'Định lí Pythagore (giới thiệu, áp dụng)', 'toan', 7, 'Chương IV: Tam giác bằng nhau', 'TH bằng nhau tam giác vuông', true),
    mk('TO07-C04-D01', 'Ba trường hợp bằng nhau của tam giác vuông', 'toan', 7, 'Chương IV: Tam giác bằng nhau', 'TH bằng nhau tam giác vuông'),
    mk('TO10-C06-B01', 'Định lí sin', 'toan', 10, 'Chương VI: Hệ thức lượng trong tam giác', 'Hệ thức lượng'),
    mk('TO10-C06-B02', 'Định lí côsin', 'toan', 10, 'Chương VI: Hệ thức lượng trong tam giác', 'Hệ thức lượng'),
    mk('VL10-C01-A01', 'Chuyển động thẳng đều', 'vat_ly', 10, 'Chương 1: Động học', 'Chuyển động thẳng'),
  ];
});

describe('GET /api/kho/library', () => {
  it('tìm không dấu chéo mọi khối và mọi môn, bài đúng lớp 7 đứng đầu', async () => {
    const r = await (await get('q=dinh%20li%20py-ta-go&grade=all&subject=all')).json();
    expect(r.ok).toBe(true);
    expect(r.items[0]).toMatchObject({ code: 'TO07-C04-D03', grade: 7, subject: 'toan', chapterLabel: 'Chương 4 · Tam giác bằng nhau' });
    expect(r.items.map((i: { code: string }) => i.code)).not.toContain('TO10-C06-B01');
  });
  it('"pitago" và "pythagore" cho cùng kết quả', async () => {
    const a = await (await get('q=pitago&grade=all&subject=all')).json();
    const b = await (await get('q=Pythagore&grade=all&subject=all')).json();
    expect(a.items.map((i: { code: string }) => i.code)).toEqual(b.items.map((i: { code: string }) => i.code));
    expect(a.items.length).toBeGreaterThan(0);
  });
  it('khớp tên bài xếp trên khớp tên chương; kèm môn và khối', async () => {
    const r = await (await get('q=tam%20giac&grade=all&subject=all')).json();
    expect(r.items[0].title).toMatch(/tam giác/i);
    expect(r.items.every((i: { subject: string; grade: number }) => i.subject && i.grade)).toBe(true);
  });
  it('lọc theo môn/khối và xếp theo chương trình', async () => {
    const r = await (await get('subject=toan&grade=10')).json();
    expect(r.items.map((i: { code: string }) => i.code)).toEqual(['TO10-C06-B01', 'TO10-C06-B02']);
    expect(r.total).toBe(2);
    expect(r.nextOffset).toBeNull();
  });
  it('không cắt ở 200: 650 bài vẫn lấy đủ qua phân trang, bài cuối truy cập được', async () => {
    DATA = Array.from({ length: 650 }, (_, i) =>
      mk(`SI12-C${String(Math.floor(i / 20) + 1).padStart(2, '0')}-A${String((i % 20) + 1).padStart(2, '0')}`, `Bài ${i + 1}`, 'toan', 12, `Chương ${Math.floor(i / 20) + 1}: C`, `L${i}`),
    );
    const codes: string[] = [];
    let offset = 0;
    for (let guard = 0; guard < 10; guard++) {
      const r = await (await get(`subject=toan&grade=12&limit=300&offset=${offset}`)).json();
      expect(r.total).toBe(650);
      codes.push(...r.items.map((i: { code: string }) => i.code));
      if (r.nextOffset == null) break;
      offset = r.nextOffset;
    }
    expect(codes).toHaveLength(650);
    expect(new Set(codes).size).toBe(650);
    expect(codes[649]).toBe('SI12-C33-A10');
  });
  it('trả bản đồ số bài theo môn và khối để biết môn nào còn trống', async () => {
    const r = await (await get('subject=all&grade=all')).json();
    expect(r.coverage.toan).toEqual({ '7': 2, '10': 2 });
    expect(r.coverage.vat_ly).toEqual({ '10': 1 });
    expect(r.coverage.hoa_hoc).toBeUndefined();
  });
  it('môn chưa có dữ liệu trả danh sách rỗng, không lỗi', async () => {
    const r = await get('subject=hoa_hoc&grade=10');
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.items).toEqual([]);
    expect(j.total).toBe(0);
  });
  it('chặn tham số xấu: q quá dài, limit quá lớn, khối lạ, môn có ký tự lạ', async () => {
    for (const qs of [`q=${'a'.repeat(101)}`, 'limit=501', 'limit=0', 'grade=13', 'subject=toan%3Bdrop', 'offset=-1', 'preferGrade=x']) {
      const res = await get(qs);
      expect(res.status, qs).toBe(400);
    }
  });
  it('giữ nguyên tín hiệu trạng thái cũ cho giao diện Kho', async () => {
    const r = await (await get('subject=toan&grade=7')).json();
    const p = r.items.find((i: { code: string }) => i.code === 'TO07-C04-D03');
    expect(p).toMatchObject({ status: 'chua_duyet', hasPackage: true, kinds: [] });
    expect(r.items.find((i: { code: string }) => i.code === 'TO07-C04-D01').status).toBe('khong_co');
  });
});
