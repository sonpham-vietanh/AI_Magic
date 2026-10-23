import type { Metadata } from 'next';
import '../ui-landing.css';

export const metadata: Metadata = {
  title: 'Đăng nhập',
  description:
    'Việt Anh MagicStudio giúp giáo viên Trường Việt Anh soạn kế hoạch bài dạy, slide, phiếu học tập, quiz và đề kiểm tra từ Kho học liệu chuẩn. Đăng nhập bằng email trường.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
