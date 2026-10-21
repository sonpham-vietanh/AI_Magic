import type { NextConfig } from 'next';

// Header bảo mật áp cho mọi đường dẫn.
// CSP ở đây CHỦ ĐÍCH không có script-src/style-src (Next dùng script/style nội tuyến; CSP chặt cần nonce
// và chưa được kiểm trên trình duyệt). Chỉ khoá những thứ an toàn: nhúng khung, <base>, <object>.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=15552000' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
