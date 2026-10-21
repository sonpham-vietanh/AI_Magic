import { describe, expect, it } from 'vitest';
import { RUBRIC_6 } from '@/lib/eval/rubric';
import { approveHint, evaluateReview } from '@/lib/ui/review';

const all = (n: number) => Object.fromEntries(RUBRIC_6.map((c) => [c.id, n]));

describe('evaluateReview', () => {
  it('chưa chấm gì thì không duyệt được', () => {
    const ev = evaluateReview({});
    expect(ev.average).toBe(0);
    expect(ev.canApprove).toBe(false);
    expect(ev.missing).toHaveLength(6);
  });
  it('đủ 4 điểm thì duyệt được', () => {
    const ev = evaluateReview(all(4));
    expect(ev.average).toBe(4);
    expect(ev.canApprove).toBe(true);
    expect(approveHint(ev)).toMatch(/Đủ điều kiện/);
  });
  it('trung bình dưới 4.0 thì không duyệt', () => {
    const s = all(4);
    s[RUBRIC_6[0].id] = 3;
    const ev = evaluateReview(s);
    expect(ev.average).toBeCloseTo(3.83, 2);
    expect(ev.canApprove).toBe(false);
  });
  it('có tiêu chí dưới 3 thì không duyệt dù trung bình cao', () => {
    const s = all(5);
    s[RUBRIC_6[2].id] = 2;
    const ev = evaluateReview(s);
    expect(ev.average).toBeGreaterThanOrEqual(4);
    expect(ev.low).toEqual([RUBRIC_6[2].name]);
    expect(ev.canApprove).toBe(false);
  });
  it('thiếu tiêu chí thì không duyệt', () => {
    const s = all(5);
    delete (s as Record<string, number>)[RUBRIC_6[5].id];
    expect(evaluateReview(s).canApprove).toBe(false);
  });
  it('điểm không nguyên bị coi là chưa chấm', () => {
    const s = all(5);
    s[RUBRIC_6[1].id] = 4.5;
    expect(evaluateReview(s).complete).toBe(false);
  });
});
