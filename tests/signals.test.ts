import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  UnknownRunError,
  lessonStats,
  lineDiffRatio,
  recordFinalVersion,
  recordGeneration,
  summary,
} from '@/lib/signals';

const base = { teacher: 't', workflow: 'khbd' };
beforeEach(() => {
  process.env.SIGNALS_FILE = join(mkdtempSync(join(tmpdir(), 'sig-')), 'signals.json');
});

describe('signals', () => {
  it('tỷ lệ sinh lại và cờ > 40% với >= 3 lượt', async () => {
    await recordGeneration({ orgId: 'a', lessonKey: 'L1', runId: 'r1', ...base });
    await recordGeneration({ orgId: 'a', lessonKey: 'L1', runId: 'r2', regenerationOf: 'r1', ...base });
    let s = (await lessonStats('a'))[0];
    expect(s.regenRate).toBe(0.5);
    expect(s.flagged).toBe(false); // mới 2 lượt
    await recordGeneration({ orgId: 'a', lessonKey: 'L1', runId: 'r3', regenerationOf: 'r2', ...base });
    s = (await lessonStats('a'))[0];
    expect(s.generations).toBe(3);
    expect(s.regenerations).toBe(2);
    expect(s.flagged).toBe(true);
    await recordGeneration({ orgId: 'a', lessonKey: 'L2', runId: 'x1', ...base });
    await recordGeneration({ orgId: 'a', lessonKey: 'L2', runId: 'x2', ...base });
    await recordGeneration({ orgId: 'a', lessonKey: 'L2', runId: 'x3', regenerationOf: 'x1', ...base });
    const l2 = (await lessonStats('a')).find((x) => x.lessonKey === 'L2')!;
    expect(l2.regenRate).toBeCloseTo(1 / 3);
    expect(l2.flagged).toBe(false);
  });

  it('diff và chỉ số Bắc Đẩu', async () => {
    await recordGeneration({ orgId: 'a', lessonKey: 'L', runId: 'u', text: 'a\nb\nc', ...base });
    await recordGeneration({ orgId: 'a', lessonKey: 'L', runId: 'v', text: 'a\nb\nc\nd', ...base });
    await recordGeneration({ orgId: 'a', lessonKey: 'L', runId: 'w', text: 'p', ...base });
    expect(await recordFinalVersion({ orgId: 'a', runId: 'u', finalText: 'a\nb\nc', accepted: true })).toEqual({
      diffRatio: 0,
      editedAtAll: false,
    });
    const r = await recordFinalVersion({ orgId: 'a', runId: 'v', finalText: 'a\nX\nc\nd', accepted: true });
    expect(r.editedAtAll).toBe(true);
    expect(r.diffRatio).toBeGreaterThan(0);
    expect(r.diffRatio).toBeLessThanOrEqual(1);
    await recordFinalVersion({ orgId: 'a', runId: 'w', finalText: 'q', accepted: false });
    const s = await summary('a');
    expect(s.totalRuns).toBe(3);
    expect(s.accepted).toBe(2);
    expect(s.acceptedUnchanged).toBe(1);
    expect(s.unchangedPct).toBe(50);
    expect(s.avgDiffRatio).not.toBeNull();
  });

  it('unchangedPct null khi chưa có bài duyệt; runId lạ ném lỗi có kiểu', async () => {
    expect((await summary('a')).unchangedPct).toBeNull();
    await expect(
      recordFinalVersion({ orgId: 'a', runId: 'nope', finalText: '', accepted: true }),
    ).rejects.toBeInstanceOf(UnknownRunError);
  });

  it('cô lập org', async () => {
    await recordGeneration({ orgId: 'a', lessonKey: 'L', runId: 'r1', text: 'x', ...base });
    expect(await lessonStats('b')).toEqual([]);
    expect((await summary('b')).totalRuns).toBe(0);
    await expect(
      recordFinalVersion({ orgId: 'b', runId: 'r1', finalText: 'x', accepted: true }),
    ).rejects.toBeInstanceOf(UnknownRunError);
  });

  it('lineDiffRatio biên', () => {
    expect(lineDiffRatio('', '')).toBe(0);
    expect(lineDiffRatio('a', 'b')).toBe(1);
    expect(lineDiffRatio('a\r\nb', 'a\nb')).toBe(0);
  });
});
