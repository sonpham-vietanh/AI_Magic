// Ánh xạ mã lỗi đăng nhập và kiểm tra returnTo an toàn (logic thuần, có test).
export const LOGIN_ERRORS: Record<string, string> = {
  wrong_domain: 'Tài khoản này không thuộc trường. Cô/thầy hãy đăng nhập bằng email @truongvietanh.com.',
  unverified: 'Email Google chưa được xác minh. Cô/thầy kiểm tra lại tài khoản rồi thử lại.',
  bad_state: 'Phiên đăng nhập đã hết hạn hoặc không khớp. Cô/thầy bấm đăng nhập lại.',
  bad_token: 'Không xác thực được tài khoản Google. Cô/thầy thử lại.',
  exchange_failed: 'Không kết nối được với Google. Cô/thầy thử lại sau ít phút.',
  denied: 'Cô/thầy đã huỷ đăng nhập.',
  rate: 'Thử quá nhiều lần. Cô/thầy đợi một phút rồi thử lại.',
  not_configured: 'Hệ thống chưa cấu hình đăng nhập Google. Cô/thầy báo quản trị viên.',
  blocked: 'Tài khoản này đang bị tạm khoá. Cô/thầy liên hệ quản trị viên.',
};

export const LOGIN_ERROR_FALLBACK = 'Đăng nhập chưa thành công. Cô/thầy thử lại.';

export function loginErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return Object.prototype.hasOwnProperty.call(LOGIN_ERRORS, code) ? LOGIN_ERRORS[code] : LOGIN_ERROR_FALLBACK;
}

export function safeReturnTo(value: string | null | undefined): string {
  const v = value ?? '/';
  return v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/';
}

export function googleStartHref(returnTo: string): string {
  return `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
}
