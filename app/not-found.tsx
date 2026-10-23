import Link from 'next/link';
import { Icon } from '@/components/ui/icons';
import './ui-shell.css';

export const metadata = { title: 'Không tìm thấy trang' };

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="ui-status">
      <div className="ui-status-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ui-status-crest" src="/logo-crest.webp" alt="" width={56} height={56} />
        <p className="ui-status-code" aria-hidden="true">
          404
        </p>
        <h1>Chưa tìm thấy trang này</h1>
        <p className="ui-status-desc">
          Đường dẫn có thể đã đổi hoặc gõ chưa đúng. Cô/thầy quay về trang chủ để tiếp tục soạn bài nhé.
        </p>
        <div className="ui-status-actions">
          <Link href="/" className="ag-btn primary">
            <Icon name="sparkles" size={18} />
            Về trang chủ
          </Link>
          <Link href="/thu-vien" className="ag-btn">
            <Icon name="folder" size={18} />
            Học liệu đã lưu
          </Link>
        </div>
      </div>
    </main>
  );
}
