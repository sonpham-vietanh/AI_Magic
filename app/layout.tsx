import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro, Manrope } from 'next/font/google';
import './globals.css';
import './ui.css';
import './ui-shell.css';
import { ToastProvider } from '@/components/ui/Toast';

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
  applicationName: 'Việt Anh MagicStudio',
  // Công cụ nội bộ: không cho công cụ tìm kiếm lập chỉ mục, nhưng vẫn có thẻ chia sẻ để liên kết hiện logo trên Zalo, Facebook.
  robots: { index: false, follow: false },
  metadataBase: new URL(process.env.APP_BASE_URL?.trim() || 'https://magic.truongvietanh.com'),
  openGraph: {
    type: 'website',
    siteName: 'Việt Anh MagicStudio',
    locale: 'vi_VN',
    title: 'Việt Anh MagicStudio · Soạn học liệu chuẩn chương trình',
    description:
      'Công cụ soạn kế hoạch bài dạy, slide, phiếu học tập, quiz và đề kiểm tra từ Kho học liệu chuẩn, dành cho giáo viên Trường Việt Anh.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Việt Anh MagicStudio · Soạn học liệu chuẩn chương trình',
    description:
      'Công cụ soạn kế hoạch bài dạy, slide, phiếu học tập, quiz và đề kiểm tra từ Kho học liệu chuẩn, dành cho giáo viên Trường Việt Anh.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#14153A',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${manrope.variable} ${beVietnamPro.variable}`}>
      <body>
        <a className="skip" href="#main">
          Chuyển tới nội dung chính
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
