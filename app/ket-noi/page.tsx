'use client';

import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import type { ServiceStatus } from '@/lib/integrations/catalog';
import '../ui-ls.css';

const BADGE: Record<ServiceStatus['state'], { cls: string; text: string }> = {
  dang_dung: { cls: 'ok', text: 'Đã cấu hình và đang dùng' },
  da_cau_hinh_chua_noi: { cls: 'mid', text: 'Đã cấu hình nhưng hệ thống chưa nối' },
  chua_cau_hinh: { cls: 'off', text: 'Chưa cấu hình' },
};

export default function KetNoiPage() {
  const [services, setServices] = useState<ServiceStatus[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/integrations/status')
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.ok) setServices(j.services as ServiceStatus[]);
        else setError(j.error || 'Không thể kiểm tra trạng thái dịch vụ.');
      })
      .catch(() => alive && setError('Không thể kết nối máy chủ để kiểm tra trạng thái.'));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Shell
      title="Kết nối dịch vụ ngoài"
      subtitle="Theo sơ đồ v2.1: các dịch vụ này được mua, không tự xây. Trang chỉ cho biết dịch vụ nào đã có khoá và hệ thống đang làm gì thay."
    >
      <div className="ls">
        <p className="ls-notice">
          Hiện chưa có khoá hoặc license cho Gamma, Canva, Gemini Notebook và dịch vụ giọng nói, nên các dịch vụ này CHƯA được tích hợp.
          Trang này chỉ là danh bạ và cổng cấu hình; khoá chỉ đặt trong biến môi trường ở máy chủ và không bao giờ hiển thị ở đây.
        </p>
        {error && <p className="ls-error" role="alert">{error}</p>}
        {!services && !error && <p>Đang kiểm tra…</p>}
        {services && (
          <ul className="ls-svc-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {services.map((s) => {
              const b = BADGE[s.state];
              return (
                <li key={s.id} className="ls-svc">
                  <h2>{s.name}</h2>
                  <span className={`ls-badge ${b.cls}`}>{b.text}</span>
                  <p>{s.purpose}</p>
                  <p className="ls-svc-sub">Dùng cho: {s.products.join(' · ')}</p>
                  <p className="ls-svc-fb">
                    <strong>Hiện đang dùng thay thế:</strong> {s.fallback}
                  </p>
                  {s.note && <p className="ls-svc-sub">{s.note}</p>}
                  {s.envNames.length > 0 && (
                    <p className="ls-svc-sub">
                      Biến môi trường: {s.envNames.map((n) => (
                        <code key={n}>{n}</code>
                      )).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ' · ', el] : [el]), [])}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Shell>
  );
}
