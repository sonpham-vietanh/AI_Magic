import { describe, expect, it } from 'vitest';
import { LOGIN_ERRORS, LOGIN_ERROR_FALLBACK, googleStartHref, loginErrorMessage, safeReturnTo } from '@/components/landing/errors';

describe('landing errors', () => {
  it('có text cho blocked', () => {
    expect(loginErrorMessage('blocked')).toBe('Tài khoản này đang bị tạm khoá. Cô/thầy liên hệ quản trị viên.');
  });
  it('mọi mã đều có text', () => {
    for (const k of Object.keys(LOGIN_ERRORS)) expect(loginErrorMessage(k)).toBe(LOGIN_ERRORS[k]);
    expect(Object.keys(LOGIN_ERRORS)).toHaveLength(9);
  });
  it('mã lạ dùng text mặc định, không có mã thì null', () => {
    expect(loginErrorMessage('zzz')).toBe(LOGIN_ERROR_FALLBACK);
    expect(loginErrorMessage('constructor')).toBe(LOGIN_ERROR_FALLBACK);
    expect(loginErrorMessage(null)).toBeNull();
  });
  it('returnTo an toàn', () => {
    expect(safeReturnTo('/soan-bai?x=1')).toBe('/soan-bai?x=1');
    expect(safeReturnTo('//evil.com')).toBe('/');
    expect(safeReturnTo('https://evil.com')).toBe('/');
    expect(safeReturnTo('/\\evil.com')).toBe('/');
    expect(safeReturnTo(null)).toBe('/');
  });
  it('liên kết bắt đầu Google', () => {
    expect(googleStartHref('/a?b=1')).toBe('/api/auth/google/start?returnTo=%2Fa%3Fb%3D1');
  });
});
