import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dir: string;

function call(path: string, init: { method?: string; token?: string; body?: unknown; ip?: string } = {}) {
  const headers: Record<string, string> = {
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/json',
    'x-forwarded-for': init.ip ?? `10.0.0.${Math.floor(Math.random() * 250)}`,
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
  const me = await import('@/app/api/me/route');
  const prefs = await import('@/app/api/me/prefs/route');
  const exp = await import('@/app/api/me/export/route');
  const act = await import('@/app/api/me/activity/route');
  const versions = await import('@/lib/versions/store');
  const tok = (name: string, email: string, role: 'teacher' | 'admin' = 'teacher') =>
    sess.createSessionToken({ name, email, role, via: 'google' }).token;
  return { me, prefs, exp, act, versions, tok, sess };
}

describe('API /api/me', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'me-test-'));
    mkdirSync(join(dir, '.data'));
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    vi.stubEnv('USER_PREFS_FILE', join(dir, 'user-prefs.json'));
    vi.stubEnv('SIGNALS_FILE', join(dir, 'signals.json'));
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    rmSync(dir, { recursive: true, force: true });
  });

  it('chưa đăng nhập: user=null, không lỗi', async () => {
    const { me } = await setup();
    const res = await me.GET(call('/api/me'));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ ok: true, user: null, prefs: {} });
    expect(typeof j.ssoEnabled).toBe('boolean');
  });

  it('từ chối gọi cross-site không có Bearer', async () => {
    const { me } = await setup();
    const req = new Request('http://localhost/api/me', { headers: { 'sec-fetch-site': 'cross-site' } });
    expect((await me.GET(req)).status).toBe(401);
  });

  it('đã đăng nhập: trả hồ sơ có chữ cái đầu và tuỳ chọn đã lưu', async () => {
    const { me, prefs, tok } = await setup();
    const t = tok('Cô Lan', 'Co.Lan@truongvietanh.com');
    const put = await prefs.PUT(call('/api/me/prefs', { method: 'PUT', token: t, body: { mon: 'toan', khoi: '10' } }));
    expect(put.status).toBe(200);
    const j = await (await me.GET(call('/api/me', { token: t }))).json();
    expect(j.user).toEqual({
      name: 'Cô Lan',
      email: 'co.lan@truongvietanh.com',
      role: 'teacher',
      via: 'google',
      initial: 'L',
    });
    expect(j.prefs).toEqual({ mon: 'toan', khoi: '10' });
  });

  it('PUT prefs: cần phiên, chỉ ghi cho chính mình, từ chối email giả và giá trị sai', async () => {
    const { me, prefs, tok } = await setup();
    expect((await prefs.PUT(call('/api/me/prefs', { method: 'PUT', body: { mon: 'toan' } }))).status).toBe(401);

    const lan = tok('Cô Lan', 'lan@truongvietanh.com');
    const nam = tok('Thầy Nam', 'nam@truongvietanh.com');
    const bad = await prefs.PUT(
      call('/api/me/prefs', { method: 'PUT', token: lan, body: { mon: 'toan', email: 'nam@truongvietanh.com' } }),
    );
    expect(bad.status).toBe(400);
    expect((await prefs.PUT(call('/api/me/prefs', { method: 'PUT', token: lan, body: { khoi: 'abc' } }))).status).toBe(400);

    await prefs.PUT(call('/api/me/prefs', { method: 'PUT', token: lan, body: { mon: 'toan' } }));
    const namMe = await (await me.GET(call('/api/me', { token: nam }))).json();
    expect(namMe.prefs).toEqual({});
  });

  it('export: chỉ gồm bản và tín hiệu của chính người đó', async () => {
    const { exp, versions, tok } = await setup();
    const base = { runId: 'r', title: 'KHBD', format: 'ke_hoach', workflow: 'khbd', lessonKey: 'k1', text: 'a' };
    await versions.saveVersion('vietanh', { ...base, actor: 'lan@truongvietanh.com' });
    await versions.saveVersion('vietanh', { ...base, actor: 'lan@truongvietanh.com', lessonKey: 'k2' });
    await versions.saveVersion('vietanh', { ...base, actor: 'nam@truongvietanh.com', title: 'CUA-NAM' });
    writeFileSync(
      join(dir, 'signals.json'),
      JSON.stringify({
        runs: [
          { orgId: 'vietanh', runId: 'a1', teacher: 'lan@truongvietanh.com', lessonKey: 'k1', workflow: 'khbd', at: 'x', text: 'BI-MAT' },
          { orgId: 'vietanh', runId: 'b1', teacher: 'nam@truongvietanh.com', lessonKey: 'k1', workflow: 'khbd', at: 'x' },
        ],
      }),
    );
    const res = await exp.GET(call('/api/me/export', { token: tok('Cô Lan', 'lan@truongvietanh.com') }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const text = await res.text();
    const j = JSON.parse(text);
    expect(j.versions).toHaveLength(2);
    expect(text).not.toContain('CUA-NAM');
    expect(text).not.toContain('nam@truongvietanh.com');
    expect(text).not.toContain('BI-MAT');
    expect(j.signals.map((s: { runId: string }) => s.runId)).toEqual(['a1']);
    expect(j.profile.email).toBe('lan@truongvietanh.com');
  });

  it('export và activity: 401 khi chưa đăng nhập', async () => {
    const { exp, act } = await setup();
    expect((await exp.GET(call('/api/me/export'))).status).toBe(401);
    expect((await act.GET(call('/api/me/activity'))).status).toBe(401);
  });

  it('activity: đếm bản và lần soạn gần nhất', async () => {
    const { act, versions, tok } = await setup();
    const base = { runId: 'r', title: 'T', format: 'slide', workflow: 'slide', lessonKey: 'k1', text: 'a' };
    await versions.saveVersion('vietanh', { ...base, actor: 'lan@truongvietanh.com' });
    const j = await (await act.GET(call('/api/me/activity', { token: tok('Cô Lan', 'lan@truongvietanh.com') }))).json();
    expect(j.ok).toBe(true);
    expect(j.stats.versionCount).toBe(1);
    expect(j.stats.byFormat).toEqual({ slide: 1 });
    expect(j.stats.lastAt).toBeTruthy();
  });
});
