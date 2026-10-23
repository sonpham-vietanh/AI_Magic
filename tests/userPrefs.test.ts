import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let dir: string;
async function load() {
  vi.resetModules();
  return await import('@/lib/users/prefs');
}

describe('user prefs', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prefs-test-'));
    vi.stubEnv('USER_PREFS_FILE', join(dir, 'user-prefs.json'));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    rmSync(dir, { recursive: true, force: true });
  });

  it('userKey ưu tiên email chữ thường, sau đó tên chuẩn hoá', async () => {
    const { userKey } = await load();
    expect(userKey({ email: ' Co.Lan@TruongVietAnh.com ', name: 'x' })).toBe('co.lan@truongvietanh.com');
    expect(userKey({ name: '  Cô   Lan ' })).toBe('name:cô lan');
    expect(userKey({})).toBe('');
  });

  it('lưu, đọc lại, gộp từng phần và xoá bằng chuỗi rỗng', async () => {
    const { setPrefs, getPrefs } = await load();
    expect(await getPrefs('a@x.vn')).toEqual({});
    await setPrefs('a@x.vn', { mon: 'toan', khoi: '10' });
    await setPrefs('a@x.vn', { phongCach: 'hop_tac' });
    expect(await getPrefs('a@x.vn')).toEqual({ mon: 'toan', khoi: '10', phongCach: 'hop_tac' });
    await setPrefs('a@x.vn', { khoi: '' });
    expect(await getPrefs('a@x.vn')).toEqual({ mon: 'toan', phongCach: 'hop_tac' });
  });

  it('tuỳ chọn của người này không lộ sang người khác', async () => {
    const { setPrefs, getPrefs } = await load();
    await setPrefs('a@x.vn', { mon: 'toan' });
    await setPrefs('b@x.vn', { mon: 'vat_ly' });
    expect(await getPrefs('a@x.vn')).toEqual({ mon: 'toan' });
    expect(await getPrefs('b@x.vn')).toEqual({ mon: 'vat_ly' });
    expect(await getPrefs('__proto__')).toEqual({});
  });

  it('ghi đồng thời không mất cập nhật', async () => {
    const { setPrefs, getPrefs } = await load();
    await Promise.all([
      setPrefs('a@x.vn', { mon: 'toan' }),
      setPrefs('b@x.vn', { mon: 'hoa_hoc' }),
      setPrefs('c@x.vn', { khoi: '7' }),
    ]);
    expect((await getPrefs('a@x.vn')).mon).toBe('toan');
    expect((await getPrefs('b@x.vn')).mon).toBe('hoa_hoc');
    expect((await getPrefs('c@x.vn')).khoi).toBe('7');
  });

  it('schema từ chối giá trị lạ và trường thừa (ví dụ email)', async () => {
    const { prefsSchema } = await load();
    expect(prefsSchema.safeParse({ mon: 'toan', khoi: '12', phongCach: 'du_an' }).success).toBe(true);
    expect(prefsSchema.safeParse({ mon: 'Toán <script>' }).success).toBe(false);
    expect(prefsSchema.safeParse({ khoi: '123' }).success).toBe(false);
    expect(prefsSchema.safeParse({ phongCach: 'khac' }).success).toBe(false);
    expect(prefsSchema.safeParse({ email: 'victim@x.vn' }).success).toBe(false);
    expect(prefsSchema.safeParse({ mon: 'a'.repeat(41) }).success).toBe(false);
  });
});
