import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro, Manrope } from 'next/font/google';
import './globals.css';
import './ui.css';

const manrope = Manrope({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-manrope',
  display: 'swap',
});

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-be-vietnam',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Hệ thống Công cụ Sư phạm · Trường Việt Anh',
    template: '%s · Trường Việt Anh',
  },
  description:
    'Hệ thống biên soạn học liệu chuẩn Bộ GD&ĐT (GDPT 2018), phân hóa theo Hồ sơ Lớp học (Class DNA) và tích hợp Sơ đồ Liên môn (Knowledge Graph) dành cho giáo viên Trường Việt Anh.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#14153A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${manrope.variable} ${beVietnamPro.variable}`}>
      <body>
        <a className="skip" href="#main">
          Chuyển tới nội dung chính
        </a>
        {children}
      </body>
    </html>
  );
}
