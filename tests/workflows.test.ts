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

import { callLiveLlm } from '@/lib/engine/llmClient';
import { getStandardLesson } from '@/lib/kho';
import { generateQuiz, draftExam } from '@/lib/assessment';
import { checkNewsEvent } from '@/lib/guardrails/news';
import { recordGeneration } from '@/lib/signals';
import { bloomLevelsFor, WorkflowParamsSchema } from '@/lib/workflows/types';
import { routeWorkflow } from '@/lib/workflows/router';
import { parseReflection } from '@/lib/workflows/reflection';
import { FULL_KHBD } from './helpers/khbdFixture';
import { POST } from '@/app/api/workflows/run/route';

const baseParams = {
  ngayDay: '2026-10-21',
  baiDayId: 'atom_1',
  bloomThapNhat: 'hieu',
  ngonNgu: 'vi',
  phongCach: 'kham_pha',
  formatDauRa: 'ke_hoach',
};

const call = (params: unknown, raw?: string) =>
  POST(
    new Request('http://localhost/api/workflows/run', {
      method: 'POST',
      headers: { 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' },
      body: raw ?? JSON.stringify({ params }),
    }),
  );

const std = (status: string) => ({
  status,
  atomId: 'atom_1',
  title: 'Bài 1',
  packages: ['## Nội dung chuẩn'],
  assets: [],
  questions: [],
  socratic: [],
  edges: [],
});

const reflJson = JSON.stringify({
  scores: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, score: 4, note: 'ok' })),
  issues: ['x'],
});

describe('bloomLevelsFor', () => {
  it('luôn chứa Phân tích', () => {
    expect(bloomLevelsFor('nho')).toEqual(['Nhớ', 'Hiểu', 'Vận dụng', 'Phân tích']);
    expect(bloomLevelsFor('hieu')).toEqual(['Hiểu', 'Vận dụng', 'Phân tích', 'Đánh giá']);
    expect(bloomLevelsFor('van_dung')).toEqual(['Vận dụng', 'Phân tích', 'Đánh giá', 'Sáng tạo']);
    for (const l of ['nho', 'hieu', 'van_dung'] as const) {
      expect(bloomLevelsFor(l)).toContain('Phân tích');
    }
  });
});

describe('routeWorkflow', () => {
  it('bảng cố định', () => {
    expect(routeWorkflow('ke_hoach')).toBe('khbd');
    expect(routeWorkflow('slide')).toBe('slide');
    expect(routeWorkflow('worksheet')).toBe('worksheet');
    expect(routeWorkflow('quiz')).toBe('quiz');
    expect(routeWorkflow('de_kiem_tra')).toBe('de_kiem_tra');
    for (const f of ['infographic', 'mindmap', 'podcast', 'tranh_luan', 'video', 'tai_nguyen_6_dang'] as const) {
      expect(routeWorkflow(f)).toBe('tai_nguyen_6_dang');
    }
  });
});

describe('WorkflowParamsSchema', () => {
  it('chấp nhận hợp lệ, từ chối bloom phan_tich và ngày sai', () => {
    expect(WorkflowParamsSchema.safeParse(baseParams).success).toBe(true);
    expect(WorkflowParamsSchema.safeParse({ ...baseParams, bloomThapNhat: 'phan_tich' }).success).toBe(false);
    expect(WorkflowParamsSchema.safeParse({ ...baseParams, ngayDay: '21/10/2026' }).success).toBe(false);
    expect(WorkflowParamsSchema.safeParse({ ...baseParams, ngayDay: '2026-02-31' }).success).toBe(false);
  });
});

describe('parseReflection', () => {
  it('parse JSON trong code fence và kẹp 1..5', () => {
    const raw =
      '```json\n' +
      JSON.stringify({
        scores: [
          { id: 'a', score: 9, note: 'n' },
          { id: 'b', score: 0 },
          { id: 'c', score: 3.4 },
        ],
        issues: ['i1', 5],
      }) +
      '\n```';
    const r = parseReflection(raw)!;
    // Chỉ giữ tiêu chí mô hình thật sự chấm, không tự điền điểm cho tiêu chí thiếu.
    expect(r.scores).toHaveLength(3);
    expect(r.scores[0].score).toBe(5);
    expect(r.scores[1].score).toBe(1);
    expect(r.scores[2].score).toBe(3);
    expect(r.issues).toEqual(['i1']);
  });

  it('điểm rỗng/null/true không bị bịa thành điểm', () => {
    const raw = JSON.stringify({
      scores: [{ id: 'a', score: '' }, { id: 'b', score: null }, { id: 'c', score: true }, { id: 'd', score: '4' }],
    });
    const r = parseReflection(raw)!;
    expect(r.scores.map((x) => x.id)).toEqual(['d']);
    expect(parseReflection(JSON.stringify({ scores: [{ id: 'a', score: '' }] }))).toBeNull();
  });

  it('tiêu chí không được chấm thì không bị tính là điểm 1', () => {
    const r = parseReflection(JSON.stringify({ scores: [{ id: 'a', score: 4 }] }))!;
    expect(r.scores.map((x) => x.id)).toEqual(['a']);
    expect(r.average).toBe(4);
  });
  it('trả null khi rác', () => {
    expect(parseReflection('không có json')).toBeNull();
    expect(parseReflection('{"scores":[]}')).toBeNull();
  });
});

describe('POST /api/workflows/run', () => {
  beforeEach(() => {
    vi.mocked(callLiveLlm).mockReset();
    vi.mocked(getStandardLesson).mockReset();
    vi.mocked(checkNewsEvent).mockReset();
    vi.mocked(generateQuiz).mockReset();
    vi.mocked(draftExam).mockReset();
  });

  it('400 khi JSON hỏng hoặc tham số sai', async () => {
    expect((await call(null, '{oops')).status).toBe(400);
    expect((await call({ ...baseParams, bloomThapNhat: 'phan_tich' })).status).toBe(400);
  });

  it('404 khi không có atom', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('khong_co') as never);
    expect((await call(baseParams)).status).toBe(404);
  });

  it('422 khi thời sự bị chặn', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(checkNewsEvent).mockReturnValue({ ok: false, reasons: ['quá cũ'], requiresApproval: true });
    const res = await call({
      ...baseParams,
      suKienThoiSu: { tieuDe: 't', url: 'https://x.vn', ngayDang: '2020-01-01' },
    });
    expect(res.status).toBe(422);
    expect(callLiveLlm).not.toHaveBeenCalled();
  });

  it('chua_duyet: cảnh báo + requiresApproval; có reflection', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('chua_duyet') as never);
    vi.mocked(callLiveLlm)
      .mockResolvedValueOnce({ ok: true, content: FULL_KHBD, modelUsed: 'm' })
      .mockResolvedValueOnce({ ok: true, content: reflJson, modelUsed: 'm' });
    const res = await call(baseParams);
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.result.workflow).toBe('khbd');
    expect(j.result.requiresApproval).toBe(true);
    expect(j.result.warnings.join(' ')).toContain('chưa qua người duyệt');
    expect(j.result.reflection.average).toBe(4);
    expect(j.result.bloomLevels).toContain('Phân tích');
  });

  it('thời sự ok: ép requiresApproval', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(checkNewsEvent).mockReturnValue({ ok: true, reasons: [], requiresApproval: true });
    vi.mocked(callLiveLlm)
      .mockResolvedValueOnce({ ok: true, content: '## A\nb', modelUsed: 'm' })
      .mockResolvedValueOnce({ ok: false, modelUsed: 'm' });
    const j = await (
      await call({ ...baseParams, suKienThoiSu: { tieuDe: 't', url: 'https://x.vn', ngayDang: '2026-10-20' } })
    ).json();
    expect(j.result.requiresApproval).toBe(true);
    expect(j.result.guardrail.ok).toBe(true);
    expect(j.result.reflection.skipped).toBe(true);
  });

  it('LLM lỗi: trả bản chuẩn gốc kèm cảnh báo', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: false, modelUsed: 'm', error: 'x' });
    const j = await (await call(baseParams)).json();
    expect(j.result.warnings).toContain('AI không phản hồi, hiển thị bản chuẩn gốc');
    expect(j.result.content.markdown).toContain('Nội dung chuẩn');
  });

  it('quiz ủy quyền generateQuiz', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(generateQuiz).mockResolvedValue({
      sections: [{ heading: 'Q', body: 'b' }],
      markdown: '## Q\nb',
      questionIds: ['q1'],
      items: [],
      notes: [],
    });
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: false, modelUsed: 'm' });
    const j = await (await call({ ...baseParams, formatDauRa: 'quiz' })).json();
    expect(generateQuiz).toHaveBeenCalledOnce();
    expect(j.result.workflow).toBe('quiz');
  });

  it('de_kiem_tra ủy quyền draftExam và luôn cần duyệt', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(draftExam).mockResolvedValue({
      examId: 'e1',
      status: 'draft',
      matrix: {} as never,
      sections: [{ heading: 'Đề', body: 'b' }],
      markdown: '## Đề\nb',
    });
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: false, modelUsed: 'm' });
    const j = await (
      await call({ ...baseParams, formatDauRa: 'de_kiem_tra', teacher: { name: 'Cô Lan' } })
    ).json();
    expect(vi.mocked(draftExam).mock.calls[0][0].createdBy).toBe('Cô Lan');
    expect(j.result.requiresApproval).toBe(true);
    expect(j.result.examId).toBe('e1');
    expect(j.result.blockAcceptDownload).toBe(true);
    expect(j.result.approvalUrl).toBe('/kiem-tra');
    expect(j.result.approvalReasons.length).toBeGreaterThan(0);
    // Toàn văn đề không được ghi vào signals.
    const rec = vi.mocked(recordGeneration).mock.calls.at(-1)![0] as { text?: string };
    expect(rec.text).toBe('[Đề kiểm tra e1: nội dung được bảo mật, xem tại /kiem-tra]');
  });

  it('reviewedBy lấy từ review.reviewer chỉ khi người duyệt đã approve', async () => {
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: false, modelUsed: 'm' });
    vi.mocked(generateQuiz).mockResolvedValue({ sections: [{ heading: 'Q', body: 'b' }], markdown: 'Q', questionIds: ['q1'], items: [], notes: [] });
    vi.mocked(getStandardLesson).mockResolvedValue({
      ...std('approved'),
      review: { decision: 'approve', reviewer: 'Thầy A' },
    } as never);
    const j = await (await call({ ...baseParams, formatDauRa: 'quiz' })).json();
    expect(j.result.standard.reviewedBy).toBe('Thầy A');
  });
});
