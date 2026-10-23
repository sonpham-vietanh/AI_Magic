import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dir: string;

function call(path: string, init: { method?: string; token?: string; body?: unknown; ip?: string; site?: string } = {}) {
  const headers: Record<string, string> = {
    'sec-fetch-site': init.site ?? 'same-origin',
    'content-type': 'application/json',
    'x-forwarded-for': init.ip ?? `10.1.0.${Math.floor(Math.random() * 250)}`,
  };
  if (init.token) headers['x-va-session'] = init.token;
  return new Request(`http://localhost${path}`, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}

async function setup() {
  vi.resetModules();
  const sess = await import('@/lib/server/sessionToken');
  const fb = await import('@/app/api/feedback/route');
  const sv = await import('@/app/api/me/savings/route');
  const versions = await import('@/lib/versions/store');
  const tok = (name: string, email: string) => sess.createSessionToken({ name, email, role: 'teacher', via: 'google' }).token;
  return { fb, sv, versions, tok };
}

describe('API /api/feedback và /api/me/savings', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fb-test-'));
    mkdirSync(join(dir, '.data'));
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    vi.stubEnv('FEEDBACK_STORE_PATH', join(dir, 'feedback.json'));
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    rmSync(dir, { recursive: true, force: true });
  });

  it('feedback: lưu phản hồi hợp lệ kèm người gửi từ phiên', async () => {
    const { fb, tok } = await setup();
    const t = tok('Cô Lan', 'lan@truongvietanh.com');
    const res = await fb.POST(
      call('/api/feedback', {
        method: 'POST',
        token: t,
        body: { kind: 'sai_kien_thuc', message: 'Ví dụ ở phần khởi động tính sai', context: { workflow: 'khbd', lessonTitle: 'Phân số' } },
      }),
    );
    expect(res.status).toBe(200);
    const saved = JSON.parse(readFileSync(join(dir, 'feedback.json'), 'utf8'));
    expect(saved.entries).toHaveLength(1);
    expect(saved.entries[0]).toMatchObject({ actor: 'lan@truongvietanh.com', kind: 'sai_kien_thuc' });
  });

  it('feedback: từ chối cross-site, loại lỗi lạ và nội dung quá ngắn hoặc quá dài', async () => {
    const { fb } = await setup();
    expect((await fb.POST(call('/api/feedback', { method: 'POST', site: 'cross-site', body: { kind: 'khac', message: 'abc def' } }))).status).toBe(401);
    expect((await fb.POST(call('/api/feedback', { method: 'POST', body: { kind: 'la', message: 'abc def' } }))).status).toBe(400);
    expect((await fb.POST(call('/api/feedback', { method: 'POST', body: { kind: 'khac', message: 'a' } }))).status).toBe(400);
    const long = await fb.POST(call('/api/feedback', { method: 'POST', body: { kind: 'khac', message: 'x'.repeat(1001) } }));
    expect(long.status).toBe(400);
    expect((await long.json()).error).toContain('1000');
  });

  it('feedback: giới hạn tần suất 10 lần mỗi phút theo địa chỉ', async () => {
    const { fb } = await setup();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      codes.push((await fb.POST(call('/api/feedback', { method: 'POST', ip: '9.9.9.9', body: { kind: 'khac', message: `lỗi số ${i}` } }))).status);
    }
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[11]).toBe(429);
  });

  it('savings: cần phiên, chỉ tính bản của chính người đó, theo quy ước phút', async () => {
    const { sv, versions, tok } = await setup();
    expect((await sv.GET(call('/api/me/savings'))).status).toBe(401);

    const base = { runId: 'r', title: 'T', workflow: 'khbd', text: 'a' };
    await versions.saveVersion('vietanh', { ...base, format: 'ke_hoach', lessonKey: 'k1', actor: 'lan@truongvietanh.com' });
    await versions.saveVersion('vietanh', { ...base, format: 'slide', lessonKey: 'k1', actor: 'lan@truongvietanh.com' });
    await versions.saveVersion('vietanh', { ...base, format: 'ke_hoach', lessonKey: 'k9', actor: 'nam@truongvietanh.com' });

    const j = await (await sv.GET(call('/api/me/savings', { token: tok('Cô Lan', 'lan@truongvietanh.com') }))).json();
    expect(j.ok).toBe(true);
    expect(j.estimate).toBe(true);
    expect(j.week).toEqual({ minutes: 65, count: 2 });
    expect(j.note).toContain('ước lượng');
    const none = await (await sv.GET(call('/api/me/savings', { token: tok('Khách', 'khac@truongvietanh.com') }))).json();
    expect(none.total).toEqual({ minutes: 0, count: 0 });
  });
});

describe('API /api/hoc-ba/generate', () => {
  beforeEach(() => {
    vi.stubEnv('USAGE_LEDGER_FILE', join(tmpdir(), `hb-ledger-${process.pid}-${Date.now()}.json`));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const LONG =
    'Em chăm chỉ học tập, luôn hoàn thành bài đầy đủ và có tinh thần hợp tác tốt với bạn bè trong lớp. Em cần tự tin hơn khi phát biểu để phát huy hết năng lực của mình.';
  const opts = { capHoc: 'thcs', doDai: 'vua', giong: 'am_ap', kyHoc: 'cuoi_hk1', xungHo: 'em' };

  async function load(llm: (sys: string, user: string) => unknown) {
    vi.resetModules();
    vi.doMock('@/lib/engine/llmClient', () => ({ callLiveLlm: async (s: string, u: string) => llm(s, u) }));
    return import('@/app/api/hoc-ba/generate/route');
  }

  it('trả nhận xét theo id, không gửi tên cho AI', async () => {
    const seen: string[] = [];
    const route = await load((s, u) => {
      seen.push(s + u);
      return { ok: true, modelUsed: 'fake', content: JSON.stringify([{ stt: 1, nhan_xet: LONG }]) };
    });
    const res = await route.POST(
      call('/api/hoc-ba/generate', { method: 'POST', body: { students: [{ id: 'x1', ten: 'Nguyễn Văn Kín', ghiChu: 'chăm chỉ' }], options: opts } }),
    );
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.results[0]).toMatchObject({ id: 'x1' });
    expect(j.results[0].text).toContain('chăm chỉ');
    expect(seen.join('')).not.toContain('Kín');
  });

  it('từ chối quá 12 học sinh mỗi lô, ghi chú quá 400 ký tự và cross-site', async () => {
    const route = await load(() => ({ ok: true, modelUsed: 'fake', content: '[]' }));
    const mk = (n: number, note = 'a') => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, ten: `HS ${i}`, ghiChu: note }));
    expect((await route.POST(call('/api/hoc-ba/generate', { method: 'POST', body: { students: mk(13), options: opts } }))).status).toBe(400);
    expect((await route.POST(call('/api/hoc-ba/generate', { method: 'POST', body: { students: mk(1, 'x'.repeat(401)), options: opts } }))).status).toBe(400);
    expect((await route.POST(call('/api/hoc-ba/generate', { method: 'POST', site: 'cross-site', body: { students: mk(1), options: opts } }))).status).toBe(401);
  });

  it('AI không trả lời được thì báo lỗi thân thiện', async () => {
    const route = await load(() => ({ ok: false, modelUsed: 'x', error: 'boom' }));
    const res = await route.POST(
      call('/api/hoc-ba/generate', { method: 'POST', body: { students: [{ id: 'a', ten: 'An', ghiChu: '' }], options: opts } }),
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain('thử lại');
  });
});
