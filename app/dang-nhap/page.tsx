'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const ERRORS: Record<string, string> = {
  wrong_domain: 'Tài khoản này không thuộc trường. Cô/thầy hãy đăng nhập bằng email @truongvietanh.com.',
  unverified: 'Email Google chưa được xác minh. Cô/thầy kiểm tra lại tài khoản rồi thử lại.',
  bad_state: 'Phiên đăng nhập đã hết hạn hoặc không khớp. Cô/thầy bấm đăng nhập lại.',
  bad_token: 'Không xác thực được tài khoản Google. Cô/thầy thử lại.',
  exchange_failed: 'Không kết nối được với Google. Cô/thầy thử lại sau ít phút.',
  denied: 'Cô/thầy đã huỷ đăng nhập.',
  rate: 'Thử quá nhiều lần. Cô/thầy đợi một phút rồi thử lại.',
  not_configured: 'Hệ thống chưa cấu hình đăng nhập Google. Cô/thầy báo quản trị viên.',
};

function LoginInner() {
  const params = useSearchParams();
  const error = params.get('error');
  const returnTo = params.get('returnTo') ?? '/';
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Đã có phiên thì vào thẳng nơi cần đến.
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && j.session?.via === 'google') {
          window.location.replace(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/');
          return;
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [returnTo]);

  const href = `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <main
      id="main"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px 16px',
        background: 'var(--cream, #fbf9f4)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          border: '1px solid var(--line, #e6e1d6)',
          borderRadius: 16,
          padding: '32px 24px',
          boxShadow: '0 8px 30px rgba(20,21,58,0.08)',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: '0 0 8px', fontSize: 22, color: 'var(--navy, #14153a)' }}>Việt Anh MagicStudio</h1>
        <p style={{ margin: '0 0 24px', color: 'var(--muted, #5b5d7a)', lineHeight: 1.5 }}>
          Đăng nhập bằng email của trường để soạn học liệu và lưu lịch sử của riêng cô/thầy.
        </p>

        {error && (
          <div role="alert" className="ag-alert bad" style={{ textAlign: 'left', marginBottom: 16 }}>
            <span>{ERRORS[error] ?? 'Đăng nhập chưa thành công. Cô/thầy thử lại.'}</span>
          </div>
        )}

        {checking ? (
          <p role="status" className="ag-note">
            Đang kiểm tra phiên đăng nhập…
          </p>
        ) : (
          <a
            href={href}
            className="ag-btn primary"
            style={{ display: 'inline-flex', justifyContent: 'center', width: '100%', textDecoration: 'none' }}
          >
            Đăng nhập bằng Google (email trường)
          </a>
        )}

        <p className="ag-note" style={{ marginTop: 16, fontSize: 13 }}>
          Chỉ tài khoản @truongvietanh.com được vào. Cô/thầy chưa có tài khoản thì liên hệ phòng IT.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
