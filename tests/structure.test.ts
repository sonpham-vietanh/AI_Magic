import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/engine/llmClient', () => ({ callLiveLlm: vi.fn() }));
vi.mock('@/lib/kho', () => ({ getStandardLesson: vi.fn() }));
vi.mock('@/lib/assessment', () => ({ generateQuiz: vi.fn(), draftExam: vi.fn() }));
vi.mock('@/lib/guardrails/news', () => ({ checkNewsEvent: vi.fn() }));
vi.mock('@/lib/signals', () => ({ recordGeneration: vi.fn(async () => {}) }));
vi.mock('@/lib/server/org', () => ({ getOrgId: () => 'org_test' }));
vi.mock('@/lib/server/rateLimit', () => ({ rateLimit: () => null }));
vi.mock('@/lib/eval/rubric', () => ({
  RUBRIC_6: ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => ({ id: x, name: `Tiêu chí ${x}`, description: x })),
}));
vi.mock('@/lib/resources', () => ({
  generateArtifact: vi.fn(),
  generateAllResources: vi.fn(),
  artifactToText: vi.fn((a: { title: string }) => `TEXT:${a.title}`),
  checkArtifact: vi.fn(() => [{ id: 'ok', label: 'Cấu trúc', ok: true }]),
}));

import { callLiveLlm } from '@/lib/engine/llmClient';
import { getStandardLesson } from '@/lib/kho';
import { draftExam, generateQuiz } from '@/lib/assessment';
import { generateArtifact, generateAllResources } from '@/lib/resources';
import { checkKhbdStructure, checkExamStructure } from '@/lib/workflows/validators';
import { resourceKindsFor } from '@/lib/workflows/router';
import { POST } from '@/app/api/workflows/run/route';
import { BLOOMS, FULL_KHBD, THIEU_KHBD } from './helpers/khbdFixture';

const base = {
  ngayDay: '2026-10-21',
  baiDayId: 'atom_1',
  bloomThapNhat: 'hieu',
  ngonNgu: 'vi',
  phongCach: 'kham_pha',
  formatDauRa: 'ke_hoach',
};
const call = (params: unknown) =>
  POST(
    new Request('http://localhost/api/workflows/run', {
      method: 'POST',
      headers: { 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' },
      body: JSON.stringify({ params }),
    }),
  );
const art = (kind: string) => ({ kind, title: `T-${kind}`, data: {} });
const std = (artifacts?: unknown[]) => ({
  status: 'approved',
  atomId: 'atom_1',
  title: 'Bài 1',
  packages: [],
  assets: [],
  questions: [],
  socratic: [],
  edges: [],
  ...(artifacts ? { artifacts } : {}),
});
const reflJson = JSON.stringify({
  scores: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, score: 4, note: 'ok' })),
  issues: [],
});
const llmOk = (content: string) => ({ ok: true as const, content, modelUsed: 'm' });

beforeEach(() => {
  for (const f of [callLiveLlm, getStandardLesson, draftExam, generateQuiz, generateArtifact, generateAllResources]) {
    (f as unknown as { mockReset: () => void }).mockReset();
  }
});

describe('checkKhbdStructure', () => {
  it('bản đủ: mọi mục ok', () => {
    expect(checkKhbdStructure(FULL_KHBD, BLOOMS).filter((c) => !c.ok)).toEqual([]);
  });
  it('bản thiếu: nêu đúng mục thiếu', () => {
    const bad = checkKhbdStructure(THIEU_KHBD, BLOOMS).filter((c) => !c.ok).map((c) => c.id);
    expect(bad).toContain('muc_tieu');
    expect(bad).toContain('dung_4_hoat_dong');
    expect(bad).toContain('hd_van_dung_abcd');
    expect(bad).toContain('bloom_phan_tich');
  });
  it('thiếu tiêu đề đúng và thiếu d) trong một hoạt động', () => {
    const t = FULL_KHBD.replace('KẾ HOẠCH BÀI DẠY', 'Giáo án').replace('d) Tổ chức thực hiện: w', '');
    const bad = checkKhbdStructure(t, BLOOMS).filter((c) => !c.ok).map((c) => c.id);
    expect(bad).toContain('tieu_de');
    expect(bad.some((id) => id.endsWith('_abcd'))).toBe(true);
  });
});

describe('checkExamStructure', () => {
  it('đủ ma trận, 10 điểm, đủ câu', () => {
    const m = { totalPoints: 10, pointsPerQuestion: 1, rows: [{}], totalSelected: 10, totalTarget: 10, shortfall: [] };
    expect(checkExamStructure(m, '## Ma trận đề\n...').every((c) => c.ok)).toBe(true);
  });
  it('thiếu câu thì không ok', () => {
    const m = { totalPoints: 10, pointsPerQuestion: 2, rows: [{}], totalSelected: 5, totalTarget: 8, shortfall: ['thiếu 3'] };
    const r = checkExamStructure(m, 'ma trận');
    expect(r.find((c) => c.id === 'du_cau')?.ok).toBe(false);
  });
  it('matrix rỗng không ném lỗi', () => {
    expect(checkExamStructure({}, '').every((c) => !c.ok)).toBe(true);
  });
});

describe('resourceKindsFor', () => {
  it('mặc định theo format và tham số tường minh', () => {
    expect(resourceKindsFor('infographic')).toEqual(['infographic']);
    expect(resourceKindsFor('tai_nguyen_6_dang')).toHaveLength(6);
    expect(resourceKindsFor('tai_nguyen_6_dang', ['video', 'text'])).toEqual(['video', 'text']);
  });
});

describe('khbd tự sửa', () => {
  it('bản đủ: không gọi sửa', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std() as never);
    vi.mocked(callLiveLlm).mockResolvedValueOnce(llmOk(FULL_KHBD)).mockResolvedValueOnce(llmOk(reflJson));
    const j = await (await call(base)).json();
    expect(callLiveLlm).toHaveBeenCalledTimes(2);
    expect(j.result.structure.every((c: { ok: boolean }) => c.ok)).toBe(true);
    expect(j.result.artifacts).toEqual([]);
  });
  it('bản thiếu rồi đủ: sửa đúng 1 lần, kèm danh sách mục thiếu', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std() as never);
    vi.mocked(callLiveLlm)
      .mockResolvedValueOnce(llmOk(THIEU_KHBD))
      .mockResolvedValueOnce(llmOk(FULL_KHBD))
      .mockResolvedValueOnce(llmOk(reflJson));
    const j = await (await call(base)).json();
    expect(callLiveLlm).toHaveBeenCalledTimes(3);
    expect(vi.mocked(callLiveLlm).mock.calls[1][1]).toContain('Vận dụng');
    expect(j.result.structure.every((c: { ok: boolean }) => c.ok)).toBe(true);
    expect(j.result.warnings.join(' ')).toContain('tự bổ sung');
  });
  it('sửa vẫn thiếu: không sửa lần 2, ghi rõ mục chưa đạt', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std() as never);
    vi.mocked(callLiveLlm)
      .mockResolvedValueOnce(llmOk(THIEU_KHBD))
      .mockResolvedValueOnce(llmOk(THIEU_KHBD))
      .mockResolvedValueOnce(llmOk(reflJson));
    const j = await (await call(base)).json();
    expect(callLiveLlm).toHaveBeenCalledTimes(3);
    expect(j.result.structure.some((c: { ok: boolean }) => !c.ok)).toBe(true);
    expect(j.result.warnings.join(' ')).toContain('chưa');
  });
});

describe('slide / worksheet', () => {
  it('slide: artifacts + structure + content từ artifactToText', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std() as never);
    vi.mocked(generateArtifact).mockResolvedValue({ ok: true, value: art('slides'), modelUsed: 'm' } as never);
    vi.mocked(callLiveLlm).mockResolvedValue(llmOk(reflJson));
    const j = await (await call({ ...base, formatDauRa: 'slide' })).json();
    expect(vi.mocked(generateArtifact).mock.calls[0][0]).toBe('slides');
    expect(j.result.workflow).toBe('slide');
    expect(j.result.artifacts.map((a: { kind: string }) => a.kind)).toEqual(['slides']);
    expect(j.result.content.markdown).toContain('TEXT:T-slides');
    expect(j.result.structure[0].ok).toBe(true);
    expect(j.result.reflection.average).toBe(4);
  });
  it('worksheet lỗi: 502', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std() as never);
    vi.mocked(generateArtifact).mockResolvedValue({ ok: false, error: 'hỏng' } as never);
    const res = await call({ ...base, formatDauRa: 'worksheet' });
    expect(res.status).toBe(502);
  });
});

describe('Kho-trước', () => {
  const vi0 = { ...base, formatDauRa: 'slide', phongCach: 'truyen_thong' };
  it('có bản đã duyệt, vi, không đổi: trả thẳng, không gọi AI', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std([art('slides')]) as never);
    const j = await (await call(vi0)).json();
    expect(generateArtifact).not.toHaveBeenCalled();
    expect(callLiveLlm).not.toHaveBeenCalled();
    expect(j.result.fromKho).toEqual(['slides']);
    expect(j.result.warnings.join(' ')).toContain('bản chuẩn đã duyệt');
  });
  it('tiếng Anh: nâng cấp từ bản chuẩn (ctx.extra), không trả thẳng', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std([art('slides')]) as never);
    vi.mocked(generateArtifact).mockResolvedValue({ ok: true, value: art('slides'), modelUsed: 'm' } as never);
    vi.mocked(callLiveLlm).mockResolvedValue(llmOk(reflJson));
    const j = await (await call({ ...vi0, ngonNgu: 'en' })).json();
    expect(generateArtifact).toHaveBeenCalledOnce();
    const ctx = vi.mocked(generateArtifact).mock.calls[0][1];
    expect(ctx.extra).toContain('ban_chuan_da_duyet');
    expect(j.result.fromKho).toBeUndefined();
  });
  it('phong cách khác mặc định: nâng cấp', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std([art('slides')]) as never);
    vi.mocked(generateArtifact).mockResolvedValue({ ok: true, value: art('slides'), modelUsed: 'm' } as never);
    vi.mocked(callLiveLlm).mockResolvedValue(llmOk(reflJson));
    await call({ ...vi0, phongCach: 'tro_choi' });
    expect(generateArtifact).toHaveBeenCalledOnce();
  });
  it('không có bản đã duyệt: sinh mới', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std([]) as never);
    vi.mocked(generateArtifact).mockResolvedValue({ ok: true, value: art('slides'), modelUsed: 'm' } as never);
    vi.mocked(callLiveLlm).mockResolvedValue(llmOk(reflJson));
    await call(vi0);
    expect(generateArtifact).toHaveBeenCalledOnce();
  });
  it('trọn bộ: lấy 1 dạng từ Kho, chỉ sinh các dạng còn lại', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std([art('text')]) as never);
    vi.mocked(generateAllResources).mockResolvedValue({
      artifacts: ['infographic', 'mindmap', 'video', 'tranh_luan', 'podcast'].map(art),
      errors: [],
    } as never);
    vi.mocked(callLiveLlm).mockResolvedValue(llmOk(reflJson));
    const j = await (
      await call({ ...base, formatDauRa: 'tai_nguyen_6_dang', phongCach: 'truyen_thong' })
    ).json();
    expect(vi.mocked(generateAllResources).mock.calls[0][1]).toEqual(['infographic', 'mindmap', 'video', 'tranh_luan', 'podcast']);
    expect(j.result.fromKho).toEqual(['text']);
    expect(j.result.artifacts).toHaveLength(6);
  });
});

describe('tai_nguyen_6_dang', () => {
  it('format đơn lẻ chỉ sinh đúng dạng', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std() as never);
    vi.mocked(generateAllResources).mockResolvedValue({ artifacts: [art('mindmap')], errors: [] } as never);
    vi.mocked(callLiveLlm).mockResolvedValue(llmOk(reflJson));
    const j = await (await call({ ...base, formatDauRa: 'mindmap' })).json();
    expect(vi.mocked(generateAllResources).mock.calls[0][1]).toEqual(['mindmap']);
    expect(j.result.workflow).toBe('tai_nguyen_6_dang');
  });
  it('dangTaiNguyen tường minh được dùng', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std() as never);
    vi.mocked(generateAllResources).mockResolvedValue({ artifacts: [art('video')], errors: [] } as never);
    vi.mocked(callLiveLlm).mockResolvedValue(llmOk(reflJson));
    await call({ ...base, formatDauRa: 'tai_nguyen_6_dang', dangTaiNguyen: ['video'] });
    expect(vi.mocked(generateAllResources).mock.calls[0][1]).toEqual(['video']);
  });
  it('lỗi một phần: warnings nêu dạng lỗi, vẫn trả các dạng còn lại', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std() as never);
    vi.mocked(generateAllResources).mockResolvedValue({
      artifacts: [art('text'), art('mindmap')],
      errors: [{ kind: 'video', error: 'hết thời gian' }],
    } as never);
    vi.mocked(callLiveLlm).mockResolvedValue(llmOk(reflJson));
    const j = await (await call({ ...base, formatDauRa: 'tai_nguyen_6_dang' })).json();
    expect(j.result.artifacts).toHaveLength(2);
    expect(j.result.warnings.join(' ')).toContain('Video');
    expect(j.result.structure.some((c: { ok: boolean }) => !c.ok)).toBe(true);
  });
  it('tất cả lỗi: 502', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std() as never);
    vi.mocked(generateAllResources).mockResolvedValue({
      artifacts: [],
      errors: [{ kind: 'text', error: 'x' }],
    } as never);
    expect((await call({ ...base, formatDauRa: 'tai_nguyen_6_dang' })).status).toBe(502);
  });
});

describe('đề kiểm tra & quiz: structure', () => {
  it('đề: structure từ matrix của draftExam', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std() as never);
    vi.mocked(draftExam).mockResolvedValue({
      examId: 'e',
      status: 'nhap',
      matrix: { totalPoints: 10, pointsPerQuestion: 2.5, rows: [{}], totalSelected: 4, totalTarget: 4, shortfall: [] },
      sections: [],
      markdown: '## Ma trận\nx',
    } as never);
    vi.mocked(callLiveLlm).mockResolvedValue(llmOk(reflJson));
    const j = await (await call({ ...base, formatDauRa: 'de_kiem_tra' })).json();
    expect(j.result.structure.map((c: { id: string }) => c.id)).toEqual(['ma_tran', 'tong_10_diem', 'du_cau']);
    expect(j.result.structure.every((c: { ok: boolean }) => c.ok)).toBe(true);
    expect(j.result.artifacts).toEqual([]);
  });
  it('quiz không có câu: structure không ok', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std() as never);
    vi.mocked(generateQuiz).mockResolvedValue({ sections: [], markdown: '## Q', questionIds: [], items: [], notes: [] } as never);
    vi.mocked(callLiveLlm).mockResolvedValue(llmOk(reflJson));
    const j = await (await call({ ...base, formatDauRa: 'quiz' })).json();
    expect(j.result.structure[0].ok).toBe(false);
  });
});
