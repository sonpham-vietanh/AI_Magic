// Quyết định ai được vào gì khi bật đăng nhập Google. Hàm thuần để dễ kiểm thử; proxy.ts chỉ gọi hàm này.
export type AccessDecision = 'allow' | 'login' | 'unauthorized';

const PUBLIC_PAGES = ['/dang-nhap'];
// Các API tự có cơ chế xác thực riêng hoặc phải mở: đăng nhập, kiểm tra sống, Major OS dùng Bearer riêng.
// Tệp mà trình duyệt/mạng xã hội cần đọc khi chưa đăng nhập (biểu tượng, ảnh chia sẻ, manifest).
const PUBLIC_API_EXACT = ['/api/health', '/manifest.webmanifest', '/robots.txt'];
const PUBLIC_API_PREFIXES = ['/api/auth/', '/api/major-os/'];

export function decideAccess(input: {
  pathname: string;
  ssoEnabled: boolean;
  hasSession: boolean;
  hasBearer: boolean;
}): AccessDecision {
  if (!input.ssoEnabled) return 'allow';
  const p = input.pathname;
  if (PUBLIC_PAGES.some((x) => p === x || p.startsWith(`${x}/`))) return 'allow';
  if (PUBLIC_API_EXACT.includes(p) || PUBLIC_API_PREFIXES.some((x) => p.startsWith(x))) return 'allow';
  if (input.hasSession) return 'allow';
  if (p.startsWith('/api/')) return input.hasBearer ? 'allow' : 'unauthorized';
  return 'login';
}
