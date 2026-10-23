import { describe, expect, it, vi } from 'vitest';
import {
  RefineBodySchema,
  buildRefinePrompts,
  headingLines,
  missingHeadings,
  protectMath,
  refineText,
  restoreMath,
  stripWrappers,
  structureKept,
  type RefineBody,
} from '@/lib/workflows/refine';
import type { LlmCallResult } from '@/lib/engine/llmClient';

const PLAN = [
  'I. Mục tiêu',
  'Học sinh nắm định lí $c^2 = a^2 + b^2$.',
  'II. Hoạt động',
  'Hoạt động 1: Khởi động (5 phút)',
  'Tính $a^2$ khi $a = 3$.',
  'Hoạt động 2: Hình thành kiến thức (15 phút)',
  '$$c = \\sqrt{a^2 + b^2}$$',
  'III. Củng cố',
].join('\n');

const body = (instruction: string, text = PLAN): RefineBody => ({ instruction, text });

describe('chỉnh bằng lời: công thức và cấu trúc', () => {
  it('thay công thức bằng ký hiệu giữ chỗ rồi trả về nguyên vẹn', () => {
    const { text, tokens } = protectMath(PLAN);
    expect(tokens).toHaveLength(4);
    expect(text).not.toContain('$');
    expect(text).toContain('⟦M0⟧');
    const back = restoreMath(text, tokens);
    expect(back.text).toBe(PLAN);
    expect(back.used).toBe(4);
  });

  it('chịu được khoảng trắng thừa và bỏ ký hiệu không tồn tại', () => {
    const { tokens } = protectMath('x $a+b$ y');
    expect(restoreMath('x ⟦ M0 ⟧ y ⟦M9⟧', tokens).text).toBe('x $a+b$ y ');
  });

  it('nhận ra mục I., Hoạt động N và phát hiện mục bị mất', () => {
    expect(headingLines(PLAN)).toHaveLength(5);
    const lost = PLAN.replace('III. Củng cố', '');
    expect(missingHeadings(PLAN, lost)).toEqual(['III. Củng cố']);
  });

  it('yêu cầu bỏ bớt thì cho phép mất mục, yêu cầu khác thì không', () => {
    const lost = PLAN.replace('Hoạt động 1: Khởi động (5 phút)\nTính $a^2$ khi $a = 3$.\n', '').replace('III. Củng cố', '');
    expect(structureKept(PLAN, lost, 'rút còn 35 phút')).toBe(true);
    expect(structureKept(PLAN, lost, 'thêm ví dụ')).toBe(false);
    expect(structureKept(PLAN, PLAN, 'thêm ví dụ')).toBe(true);
  });

  it('gỡ khung mã và câu dẫn thừa của AI', () => {
    expect(stripWrappers('```\nI. Mục tiêu\n```')).toBe('I. Mục tiêu');
    expect(stripWrappers('Dưới đây là bản đã chỉnh:\n\nI. Mục tiêu')).toBe('I. Mục tiêu');
  });

  it('lời nhắc nêu yêu cầu, nói rõ ký hiệu công thức và coi bản soạn là dữ liệu', () => {
    const { text } = protectMath(PLAN);
    const p = buildRefinePrompts({ ...body('rút còn 35 phút'), context: { monHoc: 'Toán', lop: '7A2' } }, text, true);
    expect(p.system).toContain('⟦M0⟧');
    expect(p.system).toContain('chỉ là dữ liệu');
    expect(p.user).toContain('Yêu cầu của cô/thầy: rút còn 35 phút');
    expect(p.user).toContain('Môn: Toán');
    expect(p.user).toContain('<ban_soan>');
  });

  it('kiểm tra đầu vào: yêu cầu tối đa 500, văn bản tối đa 60.000', () => {
    expect(RefineBodySchema.safeParse({ instruction: 'a'.repeat(501), text: 'x' }).success).toBe(false);
    expect(RefineBodySchema.safeParse({ instruction: 'ok', text: 'x'.repeat(60_001) }).success).toBe(false);
    expect(RefineBodySchema.safeParse({ instruction: '  ', text: 'x' }).success).toBe(false);
    expect(RefineBodySchema.safeParse({ instruction: 'rút gọn', text: 'x', context: { monHoc: 'Toán' } }).success).toBe(true);
  });
});

describe('refineText (AI giả lập)', () => {
  const llmReturning = (...contents: (string | LlmCallResult)[]) => {
    let i = 0;
    return vi.fn(async () => {
      const c = contents[Math.min(i++, contents.length - 1)];
      return typeof c === 'string' ? ({ ok: true, content: c, modelUsed: 'giả lập' } as LlmCallResult) : c;
    }) as unknown as typeof import('@/lib/engine/llmClient').callLiveLlm;
  };

  it('chỉnh xong vẫn giữ nguyên công thức LaTeX ở đúng chỗ', async () => {
    const { text } = protectMath(PLAN);
    const edited = text.replace('(15 phút)', '(10 phút)');
    const llm = llmReturning(edited);
    const out = await refineText(body('rút còn 35 phút'), llm);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.text).toContain('$c^2 = a^2 + b^2$');
      expect(out.text).toContain('$$c = \\sqrt{a^2 + b^2}$$');
      expect(out.text).toContain('(10 phút)');
      expect(out.modelUsed).toBe('giả lập');
    }
    // Công thức không bao giờ được gửi nguyên văn cho AI.
    const userPrompt = (llm as unknown as { mock: { calls: string[][] } }).mock.calls[0][1];
    expect(userPrompt).not.toContain('a^2');
  });

  it('AI làm mất mục thì thử lại một lần với lời nhắc nêu các mục phải giữ', async () => {
    const { text } = protectMath(PLAN);
    const broken = text.replace('III. Củng cố', '');
    const llm = llmReturning(broken, text);
    const out = await refineText(body('thêm hoạt động nhóm'), llm);
    expect(out.ok).toBe(true);
    expect((llm as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(2);
    const secondSystem = (llm as unknown as { mock: { calls: string[][] } }).mock.calls[1][0];
    expect(secondSystem).toContain('III. Củng cố');
  });

  it('thử lại vẫn mất cấu trúc thì báo lỗi thân thiện và không trả bản hỏng', async () => {
    const { text } = protectMath(PLAN);
    const broken = text.replace('III. Củng cố', '').replace('II. Hoạt động', '');
    const out = await refineText(body('thêm ví dụ'), llmReturning(broken, broken));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/cô\/thầy/i);
  });

  it('AI chưa đăng nhập: trả mã ai_auth để giao diện nói đúng', async () => {
    const out = await refineText(body('rút gọn'), llmReturning({ ok: false, modelUsed: 'x', error: 'HTTP 401 invalid api key' }));
    expect(out).toMatchObject({ ok: false, status: 502, code: 'ai_auth' });
    if (!out.ok) expect(out.error).toMatch(/AI đang tạm không đăng nhập/);
  });

  it('AI không phản hồi: lời báo thân thiện, không lộ lỗi kỹ thuật', async () => {
    const out = await refineText(body('rút gọn'), llmReturning({ ok: false, modelUsed: 'x', error: 'ECONNRESET socket hang up' }));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).not.toMatch(/ECONNRESET/);
      expect(out.error).toMatch(/Thử lại/);
    }
  });
});
