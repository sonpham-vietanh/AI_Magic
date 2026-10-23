import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET as getUsers, PUT as putUsers } from '@/app/api/admin/users/route';
import { GET as getAudit } from '@/app/api/admin/audit/route';
import { createSessionToken } from '@/lib/server/sessionToken';
import { resetRoleCache } from '@/lib/users/roles';
import { updateUser } from '@/lib/users/directory';

let dir: string;
const saved = { ...process.env };

function call(url: string, email: string | null, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (email) headers.set('x-va-session', createSessionToken({ name: 'T', email, role: 'teacher', via: 'google' }).token);
  headers.set('x-forwarded-for', `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`);
  return new Request(url, { ...init, headers });
}
const put = (email: string | null, body: unknown) =>
  putUsers(
    call('http://x/api/admin/users', email, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
  );

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'va-admin-'));
  process.env.USER_ROLES_STORE_PATH = join(dir, 'r.json');
  process.env.AUDIT_LOG_STORE_PATH = join(dir, 'a.json');
  process.env.TEACHER_SESSION_STORE_PATH = join(dir, 's.json');
  process.env.ADMIN_EMAILS = 'boss@truongvietanh.com';
  delete process.env.REVIEWER_EMAILS;
  resetRoleCache();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  process.env = { ...saved };
  resetRoleCache();
});

describe('API quản trị', () => {
  it('401 khi chưa đăng nhập, 403 khi không phải admin, không lộ dữ liệu', async () => {
    expect((await getUsers(call('http://x/api/admin/users', null))).status).toBe(401);
    const r = await getUsers(call('http://x/api/admin/users', 'gv@truongvietanh.com'));
    expect(r.status).toBe(403);
    expect(JSON.stringify(await r.json())).not.toContain('boss@');
    expect((await getAudit(call('http://x/api/admin/audit', 'gv@truongvietanh.com'))).status).toBe(403);
    expect((await put('gv@truongvietanh.com', { email: 'a@truongvietanh.com', role: 'admin' })).status).toBe(403);
  });

  it('admin xem danh sách, đổi vai trò, xem nhật ký', async () => {
    const list = await (await getUsers(call('http://x/api/admin/users?q=boss', 'boss@truongvietanh.com'))).json();
    expect(list.ok).toBe(true);
    expect(list.users[0].email).toBe('boss@truongvietanh.com');
    const res = await put('boss@truongvietanh.com', { email: 'Lan@truongvietanh.com', role: 'reviewer' });
    expect(res.status).toBe(200);
    expect((await res.json()).user.role).toBe('reviewer');
    const audit = await (await getAudit(call('http://x/api/admin/audit', 'boss@truongvietanh.com'))).json();
    expect(audit.total).toBe(1);
    expect(audit.entries[0].target).toBe('lan@truongvietanh.com');
  });

  it('kiểm tra dữ liệu vào bằng zod và tên miền', async () => {
    expect((await put('boss@truongvietanh.com', { email: 'a@truongvietanh.com', role: 'god' })).status).toBe(400);
    expect((await put('boss@truongvietanh.com', { email: 'a@truongvietanh.com' })).status).toBe(400);
    expect((await put('boss@truongvietanh.com', { email: 'a@gmail.com', role: 'reviewer' })).status).toBe(400);
    expect((await getUsers(call('http://x/api/admin/users?page=0', 'boss@truongvietanh.com'))).status).toBe(400);
  });

  it('không tự chặn mình; không hạ quản trị viên cuối cùng (409)', async () => {
    expect((await put('boss@truongvietanh.com', { email: 'boss@truongvietanh.com', blocked: true })).status).toBe(400);
    process.env.ADMIN_EMAILS = '';
    resetRoleCache();
    await updateUser('x@truongvietanh.com', { email: 'a@truongvietanh.com', role: 'admin' });
    const r = await put('a@truongvietanh.com', { email: 'a@truongvietanh.com', role: 'teacher' });
    expect(r.status).toBe(409);
  });
});
