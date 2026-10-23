import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/engine/llmClient', () => ({ callLiveLlm: vi.fn(), callLiveLlmStream: vi.fn() }));
vi.mock('@/lib/kho', () => ({ getStandardLesson: vi.fn() }));
vi.mock('@/lib/assessment', () => ({ generateQuiz: vi.fn(), draftExam: vi.fn() }));
vi.mock('@/lib/guardrails/news', () => ({ checkNewsEvent: vi.fn() }));
vi.mock('@/lib/signals', () => ({ recordGeneration: vi.fn(async () => {}) }));
vi.mock('@/lib/server/org', () => ({ getOrgId: () => 'org_test' }));
vi.mock('@/lib/server/rateLimit', () => ({ rateLimit: () => null }));
vi.mock('@/lib/server/classNotes', () => ({ listClassNotes: vi.fn(async () => []) }));
vi.mock('@/lib/eval/rubric', () => ({
  RUBRIC_6: ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => ({ id: x, name: `Tiêu chí ${x}`, description: x })),
}));
vi.mock('@/lib/resources', () => ({
  generateArtifact: vi.fn(),
  generateAllResources: vi.fn(),
  artifactToText: vi.fn((a: { title: string }) => `TEXT:${a.title}`),
  checkArtifact: vi.fn(() => [{ id: 'ok', label: 'Cấu trúc', ok: true }]),
}));

import { callLiveLlm, callLiveLlmStream } from '@/lib/engine/llmClient';
import { getVariation } from '@/lib/engine/variation';
import { getStandardLesson } from '@/lib/kho';
import { draftExam, generateQuiz } from '@/lib/assessment';
import { checkNewsEvent } from '@/lib/guardrails/news';
import { generateArtifact, generateAllResources } from '@/lib/resources';
import { listClassNotes } from '@/lib/server/classNotes';
import { CLASS_PROFILES } from '@/lib/classes';
import { POST } from '@/app/api/workflows/run/route';
import { FULL_KHBD } from './helpers/khbdFixture';

const base = {
  ngayDay: '2026-10-23',
  baiDayId: 'atom_1',
  bloomThapNhat: 'hieu',
  ngonNgu: 'vi',
  phongCach: 'truyen_thong',
  formatDauRa: 'ke_hoach',
};
const mk = (params: unknown, accept?: string) =>
  new Request('http://localhost/api/workflows/run', {
    method: 'POST',
    headers: { 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', ...(accept ? { Accept: accept } : {}) },
    body: JSON.stringify({ params }),
  });
const call = (params: unknown) => POST(mk(params));
const callSse = async (params: unknown) => {
  const res = await POST(mk(params, 'text/event-stream'));
  const text = await res.text();
  return text
    .split('\n\n')
    .filter((b) => b.startsWith('data: '))
    .map((b) => JSON.parse(b.slice(6)) as Record<string, any>);
};
const std = (status = 'approved', extra: Record<string, unknown> = {}) => ({
  status,
  atomId: 'atom_1',
  title: 'Bài 1',
  packages: ['## Nội dung chuẩn'],
  assets: [],
  questions: [],
  socratic: [],
  edges: [],
  ...extra,
});
const art = (kind: string) => ({ kind, title: `T-${kind}`, data: {} });
const reflJson = JSON.stringify({
  scores: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, score: 4, note: 'ok' })),
  issues: [],
});
const quizOut = { sections: [{ heading: 'Câu hỏi', body: 'Câu 1.' }], markdown: '## Câu hỏi\nCâu 1.', questionIds: ['q1'], items: [], notes: [] };

beforeEach(() => {
  vi.mocked(callLiveLlm).mockReset();
  vi.mocked(callLiveLlmStream).mockReset();
  vi.mocked(getStandardLesson).mockReset();
  vi.mocked(checkNewsEvent).mockReset();
  vi.mocked(generateQuiz).mockReset();
  vi.mocked(draftExam).mockReset();
  vi.mocked(generateArtifact).mockReset();
  vi.mocked(generateAllResources).mockReset();
  vi.mocked(listClassNotes).mockReset();
  vi.mocked(listClassNotes).mockResolvedValue([]);
});

describe('chính sách mở khoá: bản nháp dùng và tải được', () => {
  it('KHBD, bản chuẩn chưa duyệt: draft=true, KHÔNG chặn', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('chua_duyet') as never);
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: true, content: FULL_KHBD, modelUsed: 'm' });
    const j = await (await call(base)).json();
    expect(j.result.draft).toBe(true);
    expect(j.result.requiresApproval).toBe(false);
    expect(j.result.blockAcceptDownload).toBeUndefined();
    expect(j.result.warnings.join(' ')).toMatch(/Bản nháp/);
  });

  it('KHBD, bản chuẩn đã duyệt: draft=false', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: true, content: FULL_KHBD, modelUsed: 'm' });
    const j = await (await call(base)).json();
    expect(j.result.draft).toBe(false);
    expect(j.result.requiresApproval).toBe(false);
  });

  it('slide AI soạn khi chưa có bản chuẩn đã duyệt: draft=true, không chặn', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(generateArtifact).mockResolvedValue({ ok: true, value: art('slides'), modelUsed: 'm' } as never);
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: true, content: reflJson, modelUsed: 'm' });
    const j = await (await call({ ...base, formatDauRa: 'slide' })).json();
    expect(j.result.draft).toBe(true);
    expect(j.result.blockAcceptDownload).toBeUndefined();
  });

  it('slide nâng cấp từ bản chuẩn đã duyệt: draft=false', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved', { artifacts: [art('slides')] }) as never);
    vi.mocked(generateArtifact).mockResolvedValue({ ok: true, value: art('slides'), modelUsed: 'm' } as never);
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: true, content: reflJson, modelUsed: 'm' });
    const j = await (await call({ ...base, formatDauRa: 'slide', ngonNgu: 'en' })).json();
    expect(j.result.draft).toBe(false);
  });

  it('slide lấy thẳng từ Kho đã duyệt: draft=false và không gọi AI', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved', { artifacts: [art('slides')] }) as never);
    const j = await (await call({ ...base, formatDauRa: 'slide' })).json();
    expect(j.result.draft).toBe(false);
    expect(j.result.fromKho).toEqual(['slides']);
    expect(callLiveLlm).not.toHaveBeenCalled();
  });

  it('đề kiểm tra vẫn BẮT BUỘC duyệt', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(draftExam).mockResolvedValue({ examId: 'e1', status: 'draft', matrix: {} as never, sections: [], markdown: '## Đề\nb' });
    const j = await (await call({ ...base, formatDauRa: 'de_kiem_tra' })).json();
    expect(j.result.requiresApproval).toBe(true);
    expect(j.result.blockAcceptDownload).toBe(true);
    expect(j.result.draft).toBe(true);
  });

  it('nội dung thời sự vẫn BẮT BUỘC duyệt, kể cả khi bản chuẩn đã duyệt', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(checkNewsEvent).mockReturnValue({ ok: true, reasons: [], requiresApproval: true });
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: true, content: FULL_KHBD, modelUsed: 'm' });
    const j = await (
      await call({ ...base, suKienThoiSu: { tieuDe: 't', url: 'https://x.vn', ngayDang: '2026-10-20' } })
    ).json();
    expect(j.result.blockAcceptDownload).toBe(true);
    expect(j.result.requiresApproval).toBe(true);
  });
});

describe('tốc độ: quiz và đề không gọi AI tự soát', () => {
  it('quiz: 0 lời gọi AI, reflection bỏ qua', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('chua_duyet') as never);
    vi.mocked(generateQuiz).mockResolvedValue(quizOut as never);
    const j = await (await call({ ...base, formatDauRa: 'quiz' })).json();
    expect(callLiveLlm).not.toHaveBeenCalled();
    expect(callLiveLlmStream).not.toHaveBeenCalled();
    expect(j.result.reflection.skipped).toBe(true);
    expect(j.result.draft).toBe(true);
    expect(j.result.blockAcceptDownload).toBeUndefined();
  });

  it('đề kiểm tra: 0 lời gọi AI', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(draftExam).mockResolvedValue({ examId: 'e1', status: 'draft', matrix: {} as never, sections: [], markdown: '## Đề\nb' });
    const j = await (await call({ ...base, formatDauRa: 'de_kiem_tra' })).json();
    expect(callLiveLlm).not.toHaveBeenCalled();
    expect(j.result.reflection.skipped).toBe(true);
  });

  it('SSE: kết quả (done) đến TRƯỚC, nhận xét tự soát (review) đến sau', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(callLiveLlmStream).mockImplementation(async (_s, _u, _m, _o, onDelta) => {
      onDelta('KẾ HOẠCH');
      return { ok: true, content: FULL_KHBD, modelUsed: 'm' };
    });
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: true, content: reflJson, modelUsed: 'm' });
    const ev = await callSse(base);
    const types = ev.map((e) => e.type);
    expect(types.indexOf('done')).toBeGreaterThan(-1);
    expect(types.indexOf('review')).toBeGreaterThan(types.indexOf('done'));
    expect(types.filter((t) => t === 'done')).toHaveLength(1);
    const done = ev.find((e) => e.type === 'done')!;
    expect(done.result.reflection.pending).toBe(true);
    expect(done.result.content.markdown).toContain('KẾ HOẠCH BÀI DẠY');
    expect(ev.find((e) => e.type === 'review')!.reflection.average).toBe(4);
  });

  it('SSE quiz: chỉ có done, không có review', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(generateQuiz).mockResolvedValue(quizOut as never);
    const ev = await callSse({ ...base, formatDauRa: 'quiz' });
    expect(ev.map((e) => e.type)).toContain('done');
    expect(ev.map((e) => e.type)).not.toContain('review');
  });
});

describe('Trọn bộ 6 tài nguyên: phát từng thẻ khi xong', () => {
  it('SSE có sự kiện part cho từng dạng trước done', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('chua_duyet') as never);
    vi.mocked(generateAllResources).mockImplementation((async (_ctx: unknown, kinds: string[], opts: { onArtifact?: (a: unknown) => void }) => {
      for (const k of kinds) opts.onArtifact?.(art(k));
      return { artifacts: kinds.map(art), errors: [] };
    }) as never);
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: true, content: reflJson, modelUsed: 'm' });
    const ev = await callSse({ ...base, formatDauRa: 'tai_nguyen_6_dang' });
    const types = ev.map((e) => e.type);
    expect(types.filter((t) => t === 'part')).toHaveLength(6);
    expect(types.lastIndexOf('part')).toBeLessThan(types.indexOf('done'));
    const p = ev.find((e) => e.type === 'part')!;
    expect(p.ok).toBe(true);
    expect(p.draft).toBe(true);
    expect(p.artifact.kind).toBe('text');
    expect(p.section.heading).toBeTruthy();
  });
});

describe('Bộ tiết dạy (bo_tiet_day)', () => {
  it('chạy 4 phần song song và trả đủ theo thứ tự', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('chua_duyet') as never);
    let running = 0;
    let peak = 0;
    vi.mocked(generateArtifact).mockImplementation((async (kind: string) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 30));
      running--;
      return { ok: true, value: art(kind), modelUsed: 'm' };
    }) as never);
    vi.mocked(callLiveLlmStream).mockImplementation((async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 30));
      running--;
      return { ok: true, content: FULL_KHBD, modelUsed: 'm' };
    }) as never);
    vi.mocked(generateQuiz).mockResolvedValue(quizOut as never);
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: true, content: reflJson, modelUsed: 'm' });
    const ev = await callSse({ ...base, formatDauRa: 'bo_tiet_day' });
    expect(peak).toBeGreaterThanOrEqual(3);
    const parts = ev.filter((e) => e.type === 'part');
    expect(parts.map((p) => p.key).sort()).toEqual(['khbd', 'quiz', 'slides', 'worksheet']);
    expect(parts.every((p) => p.ok && p.draft)).toBe(true);
    // quiz không cần AI nên xong trước phần AI
    expect(parts[0].key).toBe('quiz');
    const done = ev.find((e) => e.type === 'done')!;
    const r = done.result;
    expect(r.workflow).toBe('bo_tiet_day');
    expect(r.draft).toBe(true);
    expect(r.requiresApproval).toBe(false);
    const heads = r.content.sections.map((s: { heading: string }) => s.heading);
    expect(heads[0]).toBe('Kế hoạch bài dạy');
    expect(heads[3]).toBe('Quiz củng cố trong tiết');
    expect(r.content.sections).toHaveLength(4);
    expect(r.artifacts.map((a: { kind: string }) => a.kind)).toEqual(['slides', 'worksheet']);
    expect(r.parts.every((p: { ok: boolean }) => p.ok)).toBe(true);
    expect(ev.map((e) => e.type)).toContain('review');
  });

  it('một phần lỗi: các phần còn lại vẫn trả, có cảnh báo', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(generateArtifact).mockImplementation((async (kind: string) =>
      kind === 'slides' ? { ok: false, error: 'hỏng' } : { ok: true, value: art(kind), modelUsed: 'm' }) as never);
    vi.mocked(callLiveLlm).mockImplementation((async (_s: string, u: string) =>
      u.includes('RUBRIC') ? { ok: true, content: reflJson, modelUsed: 'm' } : { ok: true, content: FULL_KHBD, modelUsed: 'm' }) as never);
    vi.mocked(generateQuiz).mockResolvedValue(quizOut as never);
    const j = await (await call({ ...base, formatDauRa: 'bo_tiet_day' })).json();
    expect(j.ok).toBe(true);
    expect(j.result.parts.find((p: { key: string }) => p.key === 'slides').ok).toBe(false);
    expect(j.result.content.sections).toHaveLength(3);
    expect(j.result.warnings.join(' ')).toContain('Slide');
  });

  it('tất cả lỗi: 502 kèm mã lỗi', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved', { packages: [] }) as never);
    vi.mocked(generateArtifact).mockResolvedValue({ ok: false, error: 'Chưa gọi được AI (LLM HTTP 401).' } as never);
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: false, modelUsed: 'm', error: 'LLM HTTP 401', code: 'ai_auth' });
    vi.mocked(generateQuiz).mockRejectedValue(new Error('x'));
    const res = await call({ ...base, formatDauRa: 'bo_tiet_day' });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('ai_auth');
  });
});

describe('Sinh lại ra bản khác', () => {
  it('có regenerationOf: lượt mang nonce (cho AI) và quiz đổi hạt giống', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    const seen: (string | undefined)[] = [];
    vi.mocked(generateArtifact).mockImplementation((async (kind: string) => {
      seen.push(getVariation());
      return { ok: true, value: art(kind), modelUsed: 'm' };
    }) as never);
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: true, content: reflJson, modelUsed: 'm' });
    await call({ ...base, formatDauRa: 'slide', regenerationOf: 'run_1' });
    await call({ ...base, formatDauRa: 'slide' });
    await call({ ...base, formatDauRa: 'slide', regenerationOf: 'run_1' });
    expect(seen[0]).toBeTruthy();
    expect(seen[1]).toBeUndefined();
    expect(seen[2]).toBeTruthy();
    expect(seen[0]).not.toBe(seen[2]);

    vi.mocked(generateQuiz).mockResolvedValue(quizOut as never);
    await call({ ...base, formatDauRa: 'quiz', regenerationOf: 'run_1' });
    await call({ ...base, formatDauRa: 'quiz' });
    const styles = vi.mocked(generateQuiz).mock.calls.map((c) => c[0].style);
    expect(styles[0]).toMatch(/^truyen_thong#.+/);
    expect(styles[1]).toBe('truyen_thong');
  });
});

describe('mã lỗi AI chưa đăng nhập', () => {
  it('KHBD: AI trả ai_auth và không có bản chuẩn để dựng: 502 + code ai_auth + thông điệp đúng', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved', { packages: [] }) as never);
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: false, modelUsed: 'm', error: 'LLM HTTP 401', code: 'ai_auth' });
    const res = await call(base);
    const j = await res.json();
    expect(res.status).toBe(502);
    expect(j.ok).toBe(false);
    expect(j.code).toBe('ai_auth');
    expect(j.error).toMatch(/đăng nhập/);
  });

  it('slide: lỗi OAuth hết hạn từ nhà cung cấp cũng ra ai_auth', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(generateArtifact).mockResolvedValue({ ok: false, error: 'Chưa gọi được AI (OAuth token expired).' } as never);
    const res = await call({ ...base, formatDauRa: 'slide' });
    const j = await res.json();
    expect(res.status).toBe(502);
    expect(j.code).toBe('ai_auth');
  });

  it('SSE: sự kiện error mang code', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved', { packages: [] }) as never);
    vi.mocked(callLiveLlmStream).mockResolvedValue({ ok: false, modelUsed: 'm', error: 'LLM HTTP 403', code: 'ai_auth' });
    const ev = await callSse(base);
    const err = ev.find((e) => e.type === 'error')!;
    expect(err.code).toBe('ai_auth');
  });
});

describe('công thức và ngày tháng', () => {
  it('giữ nguyên LaTeX và đổi ngày ISO sang dd/mm/yyyy', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    const md =
      FULL_KHBD +
      '\nĐịnh lí Pythagore: $c^2 = a^2 + b^2$ và $$\\frac{a}{b} = \\sqrt{2}$$. **In đậm** bỏ dấu. Dạy ngày 2026-10-23.\n';
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: true, content: md, modelUsed: 'm' });
    const j = await (await call(base)).json();
    const out = j.result.content.markdown as string;
    expect(out).toContain('$c^2 = a^2 + b^2$');
    expect(out).toContain('$$\\frac{a}{b} = \\sqrt{2}$$');
    expect(out).not.toContain('**');
    expect(out).toContain('23/10/2026');
    expect(out).not.toContain('2026-10-23');
  });

  it('lời nhắc đưa ngày dạy dạng dd/mm/yyyy', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: true, content: FULL_KHBD, modelUsed: 'm' });
    await call(base);
    const user = vi.mocked(callLiveLlm).mock.calls[0][1];
    expect(user).toContain('Ngày dạy: 23/10/2026');
  });
});

describe('lớp học đi vào lời nhắc', () => {
  const profile = CLASS_PROFILES[0];
  it('khbd: ghi chú giáo viên + sĩ số đứng trong lời nhắc khi có classId', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(listClassNotes).mockResolvedValue([
      { id: 'n1', classId: profile.id, note: 'Lớp hay mất tập trung sau giờ ra chơi', createdAt: 'x' },
    ] as never);
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: true, content: FULL_KHBD, modelUsed: 'm' });
    await call({ ...base, classId: profile.id });
    const user = vi.mocked(callLiveLlm).mock.calls[0][1];
    expect(user).toContain('Lớp hay mất tập trung sau giờ ra chơi');
    expect(user).toContain(`sĩ số ${profile.studentCount}`);
  });

  it('slide: classContext truyền cho bộ sinh có ghi chú', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(listClassNotes).mockResolvedValue([{ id: 'n1', classId: profile.id, note: 'Cần nhiều ví dụ thực tế', createdAt: 'x' }] as never);
    vi.mocked(generateArtifact).mockResolvedValue({ ok: true, value: art('slides'), modelUsed: 'm' } as never);
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: true, content: reflJson, modelUsed: 'm' });
    await call({ ...base, formatDauRa: 'slide', classId: profile.id });
    const ctx = vi.mocked(generateArtifact).mock.calls[0][1];
    expect(ctx.classContext).toContain('Cần nhiều ví dụ thực tế');
  });

  it('không có classId: không đọc ghi chú', async () => {
    vi.mocked(getStandardLesson).mockResolvedValue(std('approved') as never);
    vi.mocked(callLiveLlm).mockResolvedValue({ ok: true, content: FULL_KHBD, modelUsed: 'm' });
    await call(base);
    expect(listClassNotes).not.toHaveBeenCalled();
  });
});
