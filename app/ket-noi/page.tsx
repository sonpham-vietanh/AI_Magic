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

interface CloudStoreInfo {
  configured: boolean;
  backend: 'dedicated_table' | 'isolated_kv' | 'disabled';
  tableName: string;
  isolatedCollection: string;
  keys: { key: string; updatedAt?: string }[];
}

export default function KetNoiPage() {
  const [services, setServices] = useState<ServiceStatus[] | null>(null);
  const [cloud, setCloud] = useState<CloudStoreInfo | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
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

    fetch('/api/supabase/app-store')
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.ok && j.status) setCloud(j.status as CloudStoreInfo);
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, []);

  async function handleSyncCloud() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const r = await fetch('/api/supabase/app-store', { method: 'POST' });
      const j = await r.json();
      if (j.status) setCloud(j.status as CloudStoreInfo);
      if (j.ok) {
        const count = Array.isArray(j.sync?.synced) ? j.sync.synced.length : 0;
        setSyncMsg(`Đã đồng bộ ${count} kho dữ liệu lên Supabase an toàn (không chạm dữ liệu gốc).`);
      } else {
        setSyncMsg(j.error || 'Chưa đồng bộ được toàn bộ kho dữ liệu.');
      }
    } catch {
      setSyncMsg('Lỗi kết nối khi đồng bộ lên Supabase.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Shell
      title="Kết nối dịch vụ ngoài"
      subtitle="Danh bạ các dịch vụ AI chuyên biệt và phương thức dựng học liệu dự phòng của hệ thống."
    >
      <div className="ls">
        <div className="ag-alert info" role="note" style={{ marginTop: 0 }}>
          <span>
            Khi dịch vụ bên thứ ba chưa gắn khoá license riêng, hệ thống tự động sử dụng bộ dựng học liệu nội bộ (PowerPoint .pptx, SVG/PNG Infographic &amp; Sơ đồ tư duy, giọng đọc trình duyệt) để giáo viên luôn soạn bài liền mạch.
          </span>
        </div>
        {cloud && (
          <div className="ls-svc" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0 }}>Đồng bộ Đám mây Supabase (Cô lập an toàn)</h2>
                <p className="ls-svc-sub" style={{ marginTop: 4 }}>
                  Phân vùng đích:{' '}
                  <code>{cloud.backend === 'dedicated_table' ? `public.${cloud.tableName}` : `studio_kv (${cloud.isolatedCollection})`}</code>
                  {' · '}Đã lưu <strong>{cloud.keys.length}</strong> kho vận hành mà không tác động bảng dữ liệu gốc.
                </p>
              </div>
              <button
                type="button"
                className="ag-btn primary small"
                disabled={syncing || !cloud.configured}
                onClick={handleSyncCloud}
              >
                {syncing ? 'Đang đồng bộ…' : 'Đồng bộ ngay lên Supabase'}
              </button>
            </div>
            {cloud.keys.length > 0 && (
              <p className="ls-svc-sub" style={{ marginTop: 8 }}>
                Các kho đã đồng bộ: {cloud.keys.map((k) => <code key={k.key} style={{ marginRight: 6 }}>{k.key}</code>)}
              </p>
            )}
            {syncMsg && <p className="ls-svc-sub" style={{ marginTop: 8, fontWeight: 600 }}>{syncMsg}</p>}
          </div>
        )}
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
