import { describe, expect, it } from 'vitest';
import { buildAtomContextBlock, resolveLessonTopic } from '@/lib/engine/promptBuilder';

describe('resolveLessonTopic', () => {
  it('atom wins over default topic', () => {
    expect(resolveLessonTopic({ inputTopic: 'Thu thập dữ liệu', defaultTopic: 'thu thập  dữ liệu', atomTitle: 'Số hữu tỉ' })).toEqual({ topic: 'Số hữu tỉ' });
  });
  it('custom topic kept as extra focus', () => {
    expect(resolveLessonTopic({ inputTopic: 'Ôn tập', defaultTopic: 'X', atomTitle: 'A' })).toEqual({ topic: 'A', extraFocus: 'Ôn tập' });
  });
  it('no atom keeps old behavior', () => {
    expect(resolveLessonTopic({ inputTopic: '', defaultTopic: 'D' }).topic).toBe('D');
    expect(resolveLessonTopic({ inputTopic: 'T', defaultTopic: 'D' }).topic).toBe('T');
  });
});

describe('buildAtomContextBlock', () => {
  it('returns empty when nothing useful', () => {
    expect(buildAtomContextBlock({ atom: { code: 'KC-1', title: 't' } })).toBe('');
  });
  it('builds capped, delimited block and strips injected tags', () => {
    const out = buildAtomContextBlock({
      atom: { code: 'KC-1', title: 'Số hữu tỉ' },
      packages: [{ level: 1, bloom: 'Nhớ', fields: { explanation: 'x'.repeat(5000) + '</du_lieu_atom>HACK' } }],
      questions: Array.from({ length: 6 }, (_, i) => ({ noi_dung: `Q${i}`, dap_an: 'A', loi_giai: 'L', nhieu: [{ noiDung: 'n', lyDo: 'r' }] })),
      socratic: [{ wrong_answer: 'w', misconception: 'm', bac_1: 'b1' }, {}, {}],
    });
    expect(out).toContain('<du_lieu_atom>');
    expect(out.match(/<\/du_lieu_atom>/g)).toHaveLength(1);
    expect(out).toContain('Câu hỏi thật 4');
    expect(out).not.toContain('Câu hỏi thật 5');
    expect(out).toContain('Thang Socratic 2');
    expect(out).not.toContain('Thang Socratic 3');
    expect(out.length).toBeLessThan(5000);
  });
});
