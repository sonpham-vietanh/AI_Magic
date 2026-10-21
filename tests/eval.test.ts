import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { RUBRIC_6, aggregate, averageScore, blindize, coverage } from '@/lib/eval';

const hdr = { 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' };
const req = (url: string, method = 'GET', body?: unknown) =>
  new Request(url, {
    method,
    headers: hdr,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
const sc = (n: number) => Object.fromEntries(RUBRIC_6.map((c) => [c.id, n]));

beforeEach(() => {
  const d = mkdtempSync(join(tmpdir(), 'ev-'));
  process.env.EVAL_FILE = join(d, 'eval.json');
  process.env.SIGNALS_FILE = join(d, 'signals.json');
});

describe('rubric', () => {
  it('6 tiêu chí và trung bình', () => {
    expect(RUBRIC_6).toHaveLength(6);
    expect(averageScore(Object.fromEntries(RUBRIC_6.map((c, i) => [c.id, i < 3 ? 5 : 3])))).toBe(4);
    expect(averageScore({})).toBe(0);
  });
});

describe('eval pure', () => {
  it('blindize: xáo trộn xác định, nhãn mờ, mapping đầy đủ', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ text: `t${i}`, version: i % 2 ? 'v2' : 'v1' }));
    const a = blindize(items, 7);
    const b = blindize(items, 7);
    expect(a.blinded).toEqual(b.blinded);
    expect(Object.keys(a.mapping)).toHaveLength(10);
    expect(new Set(a.blinded.map((x) => x.label)).size).toBe(10);
    for (const x of a.blinded) {
      expect(Object.keys(x).sort()).toEqual(['label', 'text']);
      expect(a.mapping[x.label].text).toBe(x.text);
    }
  });
  it('aggregate theo phiên bản', () => {
    const rows = aggregate([
      { version: 'v1', scores: sc(2) },
      { version: 'v1', scores: sc(4) },
      { version: 'v2', scores: sc(5) },
    ]);
    expect(rows.find((r) => r.version === 'v1')).toMatchObject({ n: 2, overall: 3 });
    expect(rows.find((r) => r.version === 'v2')!.perCriterion.dung_duoc_ngay).toBe(5);
  });
  it('coverage', () => {
    const c = coverage([
      { subject: 'toan', grade: '7' },
      { subject: 'toan', grade: '8' },
      { subject: 'van', grade: '7' },
    ]);
    expect(c).toMatchObject({ total: 3, target: 100, bySubject: { toan: 2, van: 1 }, byGrade: { '7': 2, '8': 1 } });
  });
});

describe('eval routes', () => {
  it('baseline mặc định null, lưu được, từ chối JSON hỏng', async () => {
    const m = await import('@/app/api/eval/baseline/route');
    const g = await (await m.GET(req('http://x/api/eval/baseline'))).json();
    expect(g.baseline).toEqual({ baselineMinutes: null, targetMinutes: null });
    expect((await m.POST(req('http://x/b', 'POST', '{bad'))).status).toBe(400);
    expect((await m.POST(req('http://x/b', 'POST', { baselineMinutes: -1, targetMinutes: null }))).status).toBe(400);
    expect((await m.POST(req('http://x/b', 'POST', { baselineMinutes: 30, targetMinutes: 10 }))).status).toBe(200);
    expect((await (await m.GET(req('http://x/b'))).json()).baseline.baselineMinutes).toBe(30);
    expect((await m.GET(new Request('http://x/b'))).status).toBe(401);
  });
  it('cases bắt buộc nguồn + giáo viên', async () => {
    const m = await import('@/app/api/eval/cases/route');
    const ok = { subject: 'toan', grade: '7', title: 'T', text: 'đề', source: 'Zalo', teacher: 'Lan' };
    expect((await m.POST(req('http://x/c', 'POST', { ...ok, source: '' }))).status).toBe(400);
    expect((await m.POST(req('http://x/c', 'POST', { ...ok, teacher: ' ' }))).status).toBe(400);
    expect((await m.POST(req('http://x/c', 'POST', ok))).status).toBe(201);
    const j = await (await m.GET(req('http://x/c'))).json();
    expect(j.cases).toHaveLength(1);
    expect(j.coverage.bySubject.toan).toBe(1);
  });
  it('chấm mù end-to-end, báo cáo giải mù ở server', async () => {
    const blind = await import('@/app/api/eval/blind/route');
    const score = await import('@/app/api/eval/score/route');
    const report = await import('@/app/api/eval/report/route');
    const r = await blind.POST(
      req('http://x/b', 'POST', {
        seed: 1,
        items: [
          { version: 'p1', caseId: 'c1', text: 'A' },
          { version: 'p2', caseId: 'c1', text: 'B' },
        ],
      }),
    );
    const items = (await r.json()).items as { label: string; text: string }[];
    expect(JSON.stringify(items)).not.toMatch(/p1|p2/);
    expect(JSON.stringify(await (await blind.GET(req('http://x/b'))).json())).not.toMatch(/p1|p2/);
    for (const it of items) {
      const n = it.text === 'A' ? 2 : 4;
      const res = await score.POST(req('http://x/s', 'POST', { caseId: 'c1', blindLabel: it.label, rater: 'r', scores: sc(n) }));
      expect(res.status).toBe(200);
    }
    expect((await score.POST(req('http://x/s', 'POST', { caseId: 'c1', blindLabel: 'B-nope', rater: 'r', scores: sc(3) }))).status).toBe(404);
    expect(
      (await score.POST(req('http://x/s', 'POST', { caseId: 'c1', blindLabel: items[0].label, rater: 'r', scores: { ...sc(3), dung_duoc_ngay: 6 } }))).status,
    ).toBe(400);
    const rep = await (await report.GET(req('http://x/r'))).json();
    type Row = { version: string; overall: number };
    expect(rep.versions.find((v: Row) => v.version === 'p1').overall).toBe(2);
    expect(rep.versions.find((v: Row) => v.version === 'p2').overall).toBe(4);
    const only = await (await report.GET(req('http://x/r?version=p2'))).json();
    expect(only.versions).toHaveLength(1);
  });
  it('signals routes: 404 runId lạ, 400 JSON hỏng, summary', async () => {
    const fin = await import('@/app/api/signals/final/route');
    const sum = await import('@/app/api/signals/summary/route');
    const { recordGeneration } = await import('@/lib/signals');
    expect((await fin.POST(req('http://x/f', 'POST', '{'))).status).toBe(400);
    expect((await fin.POST(req('http://x/f', 'POST', { runId: 'zz', finalText: 'a', accepted: true }))).status).toBe(404);
    await recordGeneration({ orgId: 'vietanh', lessonKey: 'L', teacher: 't', workflow: 'w', runId: 'r1', text: 'a\nb' });
    const ok = await fin.POST(req('http://x/f', 'POST', { runId: 'r1', finalText: 'a\nb', accepted: true }));
    expect((await ok.json()).diffRatio).toBe(0);
    const s = await (await sum.GET(req('http://x/s'))).json();
    expect(s.summary.unchangedPct).toBe(100);
  });
});
