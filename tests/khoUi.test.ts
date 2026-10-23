import { describe, expect, it } from 'vitest';
import { deriveMe } from '@/components/kho/useMe';
import { diffSignal, minutesSaved, regenSignal, unchangedSignal } from '@/app/chat-luong/signals';
import { panelId, tabId } from '@/components/kho/AriaTabs';

describe('deriveMe (quyền giao diện theo vai trò)', () => {
  it('SSO bật + teacher: chỉ xem, ẩn ô mã', () => {
    const m = deriveMe({ ok: true, ssoEnabled: true, user: { name: 'Cô Lan', email: 'a@b.vn', role: 'teacher' } });
    expect(m.canReview).toBe(false);
    expect(m.useKey).toBe(false);
  });
  it('SSO bật + reviewer/admin: được duyệt', () => {
    for (const role of ['reviewer', 'admin']) {
      const m = deriveMe({ ssoEnabled: true, user: { name: 'X', email: 'x@y.vn', role } });
      expect(m.canReview).toBe(true);
      expect(m.useKey).toBe(false);
    }
  });
  it('SSO bật nhưng chưa có user: không duyệt', () => {
    const m = deriveMe({ ssoEnabled: true, user: null });
    expect(m.canReview).toBe(false);
    expect(m.useKey).toBe(false);
  });
  it('SSO tắt hoặc dữ liệu hỏng: giữ ô mã người duyệt như cũ', () => {
    for (const body of [{ ssoEnabled: false, user: null }, null, 'x', {}]) {
      const m = deriveMe(body);
      expect(m.useKey).toBe(true);
      expect(m.canReview).toBe(true);
      expect(m.ready).toBe(true);
    }
  });
  it('vai trò lạ được hạ về teacher', () => {
    const m = deriveMe({ ssoEnabled: true, user: { name: 'X', email: 'x', role: 'root' } });
    expect(m.user?.role).toBe('teacher');
    expect(m.canReview).toBe(false);
  });
});

describe('tín hiệu chất lượng', () => {
  it('chưa có dữ liệu', () => {
    expect(unchangedSignal(null, 0).tone).toBe('none');
    expect(unchangedSignal(NaN, 3).tone).toBe('none');
  });
  it('ngưỡng 70 và 40', () => {
    expect(unchangedSignal(80, 10).tone).toBe('good');
    expect(unchangedSignal(70, 10).tone).toBe('good');
    expect(unchangedSignal(55, 10).tone).toBe('ok');
    expect(unchangedSignal(10, 10).tone).toBe('low');
  });
  it('mẫu ít thì có cảnh báo tham khảo', () => {
    expect(unchangedSignal(100, 2).hint).toMatch(/tham khảo/);
    expect(unchangedSignal(100, 20).hint).not.toMatch(/tham khảo/);
  });
  it('sinh lại và mức chỉnh sửa', () => {
    expect(regenSignal(0.5, true).tone).toBe('low');
    expect(regenSignal(0.3, false).tone).toBe('ok');
    expect(regenSignal(0.05, false).tone).toBe('good');
    expect(diffSignal(0.05).tone).toBe('good');
    expect(diffSignal(0.2).tone).toBe('ok');
    expect(diffSignal(0.6).tone).toBe('low');
    expect(diffSignal(null).tone).toBe('none');
  });
  it('tính phút tiết kiệm', () => {
    expect(minutesSaved(60, 15)).toEqual({ minutes: 45, pct: 75 });
    expect(minutesSaved(null, 10)).toBeNull();
    expect(minutesSaved(0, 10)).toBeNull();
  });
});

describe('AriaTabs id', () => {
  it('nối tab và panel nhất quán', () => {
    expect(tabId('kt', 'A')).toBe('kt-tab-A');
    expect(panelId('kt', 'A')).toBe('kt-panel-A');
  });
});
