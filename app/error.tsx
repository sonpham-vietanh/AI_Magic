'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Icon } from '@/components/ui/icons';
import './ui-shell.css';

export default function ErrorPage({
  error,
  retry,
  reset,
}: {
  error: unknown;
  retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    // Chỉ ghi ở console của trình duyệt để kỹ thuật viên tra cứu; không hiện chi tiết cho người dùng.
    console.error(error);
  }, [error]);

  const again = () => {
    if (retry) retry();
    else if (reset) reset();
    else window.location.reload();
  };

  return (
    <main id="main" tabIndex={-1} className="ui-status">
      <div className="ui-status-card" role="alert">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ui-status-crest" src="/logo-crest.webp" alt="" width={56} height={56} />
        <p className="ui-status-code is-error" aria-hidden="true">
          Rất tiếc
        </p>
        <h1>Trang gặp trục trặc</h1>
        <p className="ui-status-desc">
          Hệ thống chưa hiển thị được trang này. Bài đã soạn của cô/thầy không bị mất. Cô/thầy thử tải lại, nếu vẫn chưa được
          thì quay về trang chủ.
        </p>
        <div className="ui-status-actions">
          <button type="button" className="ag-btn primary" onClick={again}>
            <Icon name="refresh" size={18} />
            Thử lại
          </button>
          <Link href="/" className="ag-btn">
            <Icon name="sparkles" size={18} />
            Về trang chủ
          </Link>
        </div>
      </div>
    </main>
  );
}
