import { describe, expect, it } from 'vitest';
import { firstEnabled, initialOf, isAdminPath, nextIndex, parseMe, quotaLabel, quotaLeft, roleLabel } from '@/components/ui/uiLogic';

describe('nextIndex (ARIA tablist/menu)', () => {
  it('đi vòng ngang', () => {
    expect(nextIndex(0, 'ArrowRight', 3)).toBe(1);
    expect(nextIndex(2, 'ArrowRight', 3)).toBe(0);
    expect(nextIndex(0, 'ArrowLeft', 3)).toBe(2);
  });
  it('dọc dùng Up/Down, bỏ qua Left/Right', () => {
    expect(nextIndex(0, 'ArrowDown', 3, 'vertical')).toBe(1);
    expect(nextIndex(0, 'ArrowUp', 3, 'vertical')).toBe(2);
    expect(nextIndex(0, 'ArrowRight', 3, 'vertical')).toBeNull();
  });
  it('Home/End và rỗng', () => {
    expect(nextIndex(1, 'Home', 4)).toBe(0);
    expect(nextIndex(1, 'End', 4)).toBe(3);
    expect(nextIndex(0, 'End', 0)).toBeNull();
    expect(nextIndex(0, 'a', 3)).toBeNull();
  });
});

describe('initialOf / roleLabel', () => {
  it('lấy chữ cái cuối tên, viết hoa có dấu', () => {
    expect(initialOf('Cô Lan')).toBe('L');
    expect(initialOf('nguyễn văn đức')).toBe('Đ');
    expect(initialOf('')).toBe('?');
    expect(initialOf(undefined, 'G')).toBe('G');
  });
  it('nhãn vai trò', () => {
    expect(roleLabel('admin')).toBe('Quản trị viên');
    expect(roleLabel('reviewer')).toBe('Người duyệt');
    expect(roleLabel('x')).toBe('Giáo viên');
  });
});

describe('parseMe', () => {
  it('chịu lỗi', () => {
    expect(parseMe(null)).toEqual({ ssoEnabled: false, user: null });
    expect(parseMe({ ok: true, ssoEnabled: true, user: null })).toEqual({ ssoEnabled: true, user: null });
    expect(parseMe({ user: { name: 1 } }).user).toBeNull();
  });
  it('đọc người dùng và role lạ về teacher', () => {
    const r = parseMe({ ssoEnabled: true, user: { name: 'Cô Lan', email: 'a@b.vn', role: 'boss', via: 'google' } });
    expect(r.user).toMatchObject({ name: 'Cô Lan', role: 'teacher', initial: 'L' });
  });
});

describe('quota', () => {
  it('tính lượt còn lại', () => {
    expect(quotaLeft({ today: { used: 3, limit: 20 } })).toBe(17);
    expect(quotaLeft({ today: { used: 30, limit: 20 } })).toBe(0);
    expect(quotaLeft({ today: { used: 1, limit: 0 } })).toBeNull();
    expect(quotaLeft({})).toBeNull();
    expect(quotaLabel(5)).toBe('Còn 5 lượt hôm nay');
    expect(quotaLabel(0)).toBe('Đã hết lượt hôm nay');
  });
});

describe('khác', () => {
  it('firstEnabled', () => {
    const items = [{ id: 'a', disabled: true }, { id: 'b' }, { id: 'c' }];
    expect(firstEnabled(items)).toBe('b');
    expect(firstEnabled(items, 'c')).toBe('c');
    expect(firstEnabled(items, 'a')).toBe('b');
  });
  it('isAdminPath', () => {
    expect(isAdminPath('/quan-tri')).toBe(true);
    expect(isAdminPath('/quan-tri/su-dung')).toBe(true);
    expect(isAdminPath('/quan-tri-khac')).toBe(false);
  });
});

describe('thanh bên: không dùng chung tên lớp với trang chủ', () => {
  it('Shell dùng rail-hist, không dùng ag-recent', async () => {
    const { readFileSync } = await import('node:fs');
    const shell = readFileSync('components/Shell.tsx', 'utf8');
    expect(shell).not.toMatch(/ag-recent/);
    expect(shell).toMatch(/rail-hist-item/);
    expect(readFileSync('app/ui-shell.css', 'utf8')).toMatch(/\.rail-hist-item:hover/);
    expect(readFileSync('app/ui.css', 'utf8')).not.toMatch(/\.ag-recent/);
  });
});
