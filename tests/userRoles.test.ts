import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  effectiveSessionRole,
  getEffectiveRole,
  getEffectiveRoleAsync,
  isAllowedEmail,
  isBlocked,
  isBlockedAsync,
  resetRoleCache,
} from '@/lib/users/roles';
import { AdminRuleError, listUsers, updateUser } from '@/lib/users/directory';
import { listAudit } from '@/lib/users/audit';
import { recordTeacherSessionAudit } from '@/lib/server/auth';
import { requireAdmin, requireReviewer } from '@/lib/server/roles';
import { createSessionToken } from '@/lib/server/sessionToken';

let dir: string;
const saved = { ...process.env };

function req(email: string, role: 'teacher' | 'reviewer' | 'admin') {
  const { token } = createSessionToken({ name: 'Test', email, role, via: 'google' });
  return new Request('http://x/api', { headers: { 'x-va-session': token } });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'va-roles-'));
  process.env.USER_ROLES_STORE_PATH = join(dir, 'user-roles.json');
  process.env.AUDIT_LOG_STORE_PATH = join(dir, 'audit-log.json');
  process.env.TEACHER_SESSION_STORE_PATH = join(dir, 'teacher-sessions.json');
  process.env.ADMIN_EMAILS = 'boss@truongvietanh.com';
  process.env.REVIEWER_EMAILS = 'rev@truongvietanh.com';
  delete process.env.REVIEWER_KEY;
  resetRoleCache();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  process.env = { ...saved };
  resetRoleCache();
});

describe('vai trò hiệu lực', () => {
  it('lấy mức cao nhất giữa biến môi trường và kho, không phân biệt hoa thường', async () => {
    expect(getEffectiveRole('BOSS@truongvietanh.com')).toBe('admin');
    expect(getEffectiveRole('rev@truongvietanh.com')).toBe('reviewer');
    expect(getEffectiveRole('lan@truongvietanh.com')).toBe('teacher');
    await updateUser('boss@truongvietanh.com', { email: 'Lan@TruongVietAnh.com', role: 'reviewer' });
    expect(await getEffectiveRoleAsync('lan@truongvietanh.com')).toBe('reviewer');
  });

  it('hạ trong kho không làm mất quyền đến từ cấu hình máy chủ', async () => {
    const r = await updateUser('boss@truongvietanh.com', { email: 'rev@truongvietanh.com', role: 'teacher' }).catch((e) => e);
    // Kho chưa có bản ghi nên role teacher là "không đổi" -> bị từ chối là đúng; gán rồi hạ để thấy env giữ nguyên.
    expect(r).toBeInstanceOf(Error);
    await updateUser('boss@truongvietanh.com', { email: 'rev@truongvietanh.com', role: 'admin' });
    const r2 = await updateUser('boss@truongvietanh.com', { email: 'rev@truongvietanh.com', role: 'teacher' });
    expect(r2.keptByEnv).toBe(true);
    expect(getEffectiveRole('rev@truongvietanh.com')).toBe('reviewer');
  });

  it('chặn và mở chặn', async () => {
    await updateUser('boss@truongvietanh.com', { email: 'lan@truongvietanh.com', blocked: true });
    expect(isBlocked('lan@truongvietanh.com')).toBe(true);
    expect(await isBlockedAsync('lan@truongvietanh.com')).toBe(true);
    await updateUser('boss@truongvietanh.com', { email: 'lan@truongvietanh.com', blocked: false });
    expect(isBlocked('lan@truongvietanh.com')).toBe(false);
  });

  it('chỉ nhận email thuộc tên miền cho phép', () => {
    expect(isAllowedEmail('a@truongvietanh.com')).toBe(true);
    expect(isAllowedEmail('a@gmail.com')).toBe(false);
    expect(isAllowedEmail('khong-hop-le')).toBe(false);
  });
});

describe('bảo vệ', () => {
  it('không tự chặn chính mình', async () => {
    await expect(updateUser('boss@truongvietanh.com', { email: 'boss@truongvietanh.com', blocked: true })).rejects.toBeInstanceOf(AdminRuleError);
  });

  it('không chặn quản trị viên cuối cùng, nhưng chặn được khi còn người khác', async () => {
    await updateUser('boss@truongvietanh.com', { email: 'lan@truongvietanh.com', role: 'admin' });
    await updateUser('boss@truongvietanh.com', { email: 'lan@truongvietanh.com', blocked: true });
    await expect(updateUser('lan@truongvietanh.com', { email: 'boss@truongvietanh.com', blocked: true })).rejects.toThrow(/cuối cùng/);
    expect(isBlocked('boss@truongvietanh.com')).toBe(false);
  });

  it('admin chỉ do kho gán: hạ người cuối cùng bị từ chối', async () => {
    delete process.env.ADMIN_EMAILS;
    resetRoleCache();
    await updateUser('x@truongvietanh.com', { email: 'a@truongvietanh.com', role: 'admin' });
    await expect(updateUser('x@truongvietanh.com', { email: 'a@truongvietanh.com', role: 'teacher' })).rejects.toThrow(/cuối cùng/);
    expect(getEffectiveRole('a@truongvietanh.com')).toBe('admin');
  });

  it('từ chối email ngoài tên miền', async () => {
    await expect(updateUser('boss@truongvietanh.com', { email: 'a@gmail.com', role: 'reviewer' })).rejects.toThrow(/tên miền/);
  });
});

describe('nhật ký', () => {
  it('ghi ai, làm gì, với ai, lúc nào', async () => {
    await updateUser('boss@truongvietanh.com', { email: 'lan@truongvietanh.com', role: 'reviewer' });
    await updateUser('boss@truongvietanh.com', { email: 'lan@truongvietanh.com', blocked: true });
    const { entries, total } = await listAudit();
    expect(total).toBe(2);
    expect(entries[0]).toMatchObject({ actor: 'boss@truongvietanh.com', action: 'block', target: 'lan@truongvietanh.com' });
    expect(entries[1].detail).toEqual({ from: 'teacher', to: 'reviewer' });
    expect(Date.parse(entries[0].at)).not.toBeNaN();
  });

  it('thay đổi bị từ chối không để lại nhật ký', async () => {
    await expect(updateUser('boss@truongvietanh.com', { email: 'boss@truongvietanh.com', blocked: true })).rejects.toThrow();
    expect((await listAudit()).total).toBe(0);
  });
});

describe('danh bạ', () => {
  it('đếm lượt đăng nhập, firstSeen/lastSeen và giữ tương thích dữ liệu cũ', async () => {
    writeFileSync(
      process.env.TEACHER_SESSION_STORE_PATH!,
      JSON.stringify({
        sessions: [
          { name: 'Cô Cũ', email: 'cu@truongvietanh.com', role: 'teacher', updatedAt: '2026-01-01T00:00:00.000Z' },
          { name: 'Chỉ tên', role: 'teacher', updatedAt: '2026-01-02T00:00:00.000Z' },
        ],
      }),
    );
    const s = { name: 'Cô Lan', email: 'lan@truongvietanh.com', role: 'teacher' as const, via: 'google' as const, iat: 0, exp: 0 };
    await recordTeacherSessionAudit(s);
    await recordTeacherSessionAudit(s);
    await recordTeacherSessionAudit({ ...s, name: 'Cô Cũ', email: 'cu@truongvietanh.com' });
    const res = await listUsers({ pageSize: 50 });
    const lan = res.users.find((u) => u.email === 'lan@truongvietanh.com')!;
    expect(lan.loginCount).toBe(2);
    expect(lan.firstSeen).toBeTruthy();
    const cu = res.users.find((u) => u.email === 'cu@truongvietanh.com')!;
    expect(cu.loginCount).toBe(2);
    expect(cu.firstSeen).toBe('2026-01-01T00:00:00.000Z');
    expect(res.users.some((u) => u.name === 'Chỉ tên')).toBe(false);
    expect(res.users.find((u) => u.email === 'boss@truongvietanh.com')?.role).toBe('admin');
  });

  it('tìm kiếm, lọc và thống kê', async () => {
    await recordTeacherSessionAudit({ name: 'Cô Lan', email: 'lan@truongvietanh.com', role: 'teacher', via: 'google', iat: 0, exp: 0 });
    await updateUser('boss@truongvietanh.com', { email: 'lan@truongvietanh.com', blocked: true });
    const r = await listUsers({ q: 'LAN' });
    expect(r.users).toHaveLength(1);
    expect((await listUsers({ status: 'blocked' })).total).toBe(1);
    expect((await listUsers({ role: 'admin' })).users[0].email).toBe('boss@truongvietanh.com');
    expect(r.stats.blocked).toBe(1);
    expect(r.stats.newLast7Days).toBe(1);
  });
});

describe('phiên được tính lại từ kho', () => {
  it('hạ vai trò có hiệu lực dù cookie cũ còn ghi reviewer', async () => {
    await updateUser('boss@truongvietanh.com', { email: 'lan@truongvietanh.com', role: 'reviewer' });
    expect(requireReviewer(req('lan@truongvietanh.com', 'reviewer'))).toBeNull();
    await updateUser('boss@truongvietanh.com', { email: 'lan@truongvietanh.com', role: 'teacher' });
    expect(requireReviewer(req('lan@truongvietanh.com', 'reviewer'))?.status).toBe(503);
  });

  it('cookie ghi admin nhưng kho không cấp thì từ chối; bị chặn thì 403', async () => {
    expect(requireAdmin(req('fake@truongvietanh.com', 'admin'))?.status).toBe(403);
    expect(requireAdmin(req('boss@truongvietanh.com', 'teacher'))).toBeNull();
    await updateUser('boss@truongvietanh.com', { email: 'lan@truongvietanh.com', role: 'admin' });
    expect(requireAdmin(req('lan@truongvietanh.com', 'teacher'))).toBeNull();
    await updateUser('boss@truongvietanh.com', { email: 'lan@truongvietanh.com', blocked: true });
    expect(requireAdmin(req('lan@truongvietanh.com', 'admin'))?.status).toBe(403);
    expect(effectiveSessionRole({ name: 'x', email: 'lan@truongvietanh.com', role: 'admin', via: 'google', iat: 0, exp: 1 })).toBeNull();
  });

  it('chưa đăng nhập thì 401', () => {
    expect(requireAdmin(new Request('http://x/'))?.status).toBe(401);
  });
});
