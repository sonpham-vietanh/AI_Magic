'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { Icon, type IconName } from '@/components/ui/icons';
import { fetchJson, friendlyError } from '@/lib/ui/fetchJson';
import '../ui-ls.css';

interface ServiceInfo {
  id: string;
  name: string;
  state: 'dang_dung' | 'da_cau_hinh_chua_noi' | 'chua_cau_hinh';
}
interface StatusPayload {
  services: ServiceInfo[];
  ai: { openrouter: boolean; gemini: boolean; groq: boolean; openai: boolean; any: boolean };
  login: { google: boolean };
  cloud: { configured: boolean };
}
interface CloudStore {
  configured: boolean;
  keys: { key: string; updatedAt?: string }[];
}
interface MeInfo {
  ssoEnabled?: boolean;
  user?: { role?: string } | null;
}

type Tone = 'ok' | 'mid' | 'off';

/** Dịch vụ bên thứ ba chưa nối: nói rõ cách dùng thay thế, không nhắc tên kỹ thuật. */
const EXTERNAL: { id: string; name: string; icon: IconName; what: string; instead: string }[] = [
  {
    id: 'gamma',
    name: 'Gamma',
    icon: 'slides',
    what: 'Dựng slide đẹp tự động từ dàn ý.',
    instead: 'Trợ lý tự dựng tệp PowerPoint (.pptx) từ nội dung slide. Cô/thầy bấm Xuất ở trợ lý để tải về rồi chỉnh thêm.',
  },
  {
    id: 'canva',
    name: 'Canva',
    icon: 'layers',
    what: 'Ảnh minh hoạ và infographic thiết kế sẵn.',
    instead: 'Trợ lý tự vẽ infographic và sơ đồ tư duy dạng ảnh. Cô/thầy bấm Xuất ở trợ lý để tải ảnh về.',
  },
  {
    id: 'gemini-notebook',
    name: 'NotebookLM',
    icon: 'podcast',
    what: 'Tạo podcast và tranh luận âm thanh từ tài liệu đã duyệt.',
    instead: 'Trợ lý chỉ soạn kịch bản. Cô/thầy bấm Nghe thử để máy đọc to, chưa tạo được tệp âm thanh.',
  },
  {
    id: 'tts-stt',
    name: 'Giọng đọc (TTS)',
    icon: 'video',
    what: 'Giọng đọc chuyên nghiệp cho podcast và video.',
    instead: 'Dùng giọng đọc có sẵn của trình duyệt trên máy cô/thầy. Video hiện chỉ có kịch bản phân cảnh.',
  },
];

function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const ico: IconName = tone === 'ok' ? 'check' : tone === 'mid' ? 'info' : 'alert';
  return (
    <span className={`ls-badge ${tone}`}>
      <Icon name={ico} size={14} aria-hidden="true" />
      {children}
    </span>
  );
}

export default function KetNoiPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [cloud, setCloud] = useState<CloudStore | null>(null);
  const [me, setMe] = useState<MeInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStatus(await fetchJson<StatusPayload>('/api/integrations/status'));
    } catch (e) {
      setError(friendlyError(e, 'Chưa kiểm tra được trạng thái kết nối. Cô/thầy thử lại sau ít phút nhé.'));
    } finally {
      setLoading(false);
    }
    fetchJson<{ status: CloudStore }>('/api/supabase/app-store')
      .then((j) => setCloud(j.status))
      .catch(() => setCloud(null));
    fetchJson<MeInfo>('/api/me')
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canSync = !me || me.ssoEnabled === false || me.user?.role === 'admin';

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const j = await fetchJson<{ sync?: { synced?: unknown[] }; status?: CloudStore }>('/api/supabase/app-store', {
        method: 'POST',
      });
      if (j.status) setCloud(j.status);
      const n = Array.isArray(j.sync?.synced) ? j.sync.synced.length : 0;
      setSyncMsg({ ok: true, text: `Đã sao lưu ${n} kho dữ liệu lên đám mây. Dữ liệu gốc không bị thay đổi.` });
    } catch (e) {
      setSyncMsg({ ok: false, text: friendlyError(e, 'Chưa sao lưu được lên đám mây. Cô/thầy thử lại sau nhé.') });
    } finally {
      setSyncing(false);
    }
  }

  const svc = (id: string) => status?.services.find((s) => s.id === id);
  const lastSync = cloud?.keys
    .map((k) => k.updatedAt)
    .filter((x): x is string => !!x)
    .sort()
    .pop();

  return (
    <Shell
      title="Kết nối dịch vụ"
      subtitle="Xem hệ thống đang nối với những dịch vụ nào, và cô/thầy dùng cách thay thế ra sao khi chưa nối."
    >
      <div className="ls">
        <div className="ag-alert info" role="note" style={{ marginTop: 0 }}>
          <Icon name="info" size={18} aria-hidden="true" />
          <span>
            Dịch vụ nào chưa nối thì cô/thầy vẫn soạn bài bình thường: hệ thống tự dùng bộ dựng có sẵn (PowerPoint, ảnh
            infographic, giọng đọc của trình duyệt).
          </span>
        </div>

        {error && (
          <div className="ls-error" role="alert">
            {error}{' '}
            <button type="button" className="ag-btn small" onClick={() => void load()}>
              Thử lại
            </button>
          </div>
        )}

        {loading && !status && (
          <div className="ls-cards" aria-busy="true" aria-label="Đang kiểm tra kết nối">
            {[0, 1, 2].map((i) => (
              <div key={i} className="ls-skel" />
            ))}
          </div>
        )}

        {status && (
          <>
            <section aria-labelledby="kn-core">
              <h2 id="kn-core" className="ls-h2">Nền tảng của hệ thống</h2>
              <div className="ls-cards">
                <article className="ls-card">
                  <div className="ls-card-head">
                    <span className="ls-card-ico"><Icon name="sparkles" size={22} aria-hidden="true" /></span>
                    <h3>Trợ lý AI soạn bài</h3>
                  </div>
                  <Badge tone={status.ai.any ? 'ok' : 'mid'}>
                    {status.ai.any ? 'Đã nối' : 'Đang dùng mẫu dựng sẵn'}
                  </Badge>
                  <p>Soạn kế hoạch bài dạy, slide, phiếu học tập, quiz và đề kiểm tra.</p>
                  <ul className="ls-chips" aria-label="Các nguồn AI">
                    <li className={status.ai.openrouter ? 'on' : ''}>OpenRouter: {status.ai.openrouter ? 'đã nối' : 'chưa nối'}</li>
                    <li className={status.ai.gemini ? 'on' : ''}>Gemini: {status.ai.gemini ? 'đã nối' : 'chưa nối'}</li>
                    <li className={status.ai.groq ? 'on' : ''}>Groq: {status.ai.groq ? 'đã nối' : 'chưa nối'}</li>
                  </ul>
                  {!status.ai.any && (
                    <p className="ls-svc-sub">
                      Chưa nối AI nên hệ thống dùng bộ mẫu dựng sẵn, không gọi AI bên ngoài và không tốn phí.
                    </p>
                  )}
                </article>

                <article className="ls-card">
                  <div className="ls-card-head">
                    <span className="ls-card-ico"><Icon name="shield" size={22} aria-hidden="true" /></span>
                    <h3>Đăng nhập Google của trường</h3>
                  </div>
                  <Badge tone={status.login.google ? 'ok' : 'off'}>
                    {status.login.google ? 'Đã bật' : 'Chưa bật'}
                  </Badge>
                  <p>
                    {status.login.google
                      ? 'Cô/thầy đăng nhập bằng email của trường. Lịch sử và bài soạn được ghi đúng tên người dùng.'
                      : 'Hiện chưa yêu cầu đăng nhập. Khi bật, mỗi người dùng đăng nhập bằng email Google Workspace của trường.'}
                  </p>
                  {me?.user && <Link href="/tai-khoan" className="ag-btn small">Mở trang tài khoản</Link>}
                </article>

                <article className="ls-card">
                  <div className="ls-card-head">
                    <span className="ls-card-ico"><Icon name="folder" size={22} aria-hidden="true" /></span>
                    <h3>Kho lưu trên đám mây</h3>
                  </div>
                  <Badge tone={status.cloud.configured ? 'ok' : 'mid'}>
                    {status.cloud.configured ? 'Đã nối' : 'Đang lưu trên máy chủ nhà trường'}
                  </Badge>
                  <p>
                    {status.cloud.configured
                      ? `${cloud && cloud.keys.length === 0 ? 'Chưa có bản sao lưu nào, cô/thầy bấm Sao lưu ngay để tạo bản đầu tiên' : `Bản sao lưu an toàn của dữ liệu vận hành${cloud ? `: ${cloud.keys.length} kho` : ''}`}${
                          lastSync
                            ? `, cập nhật ${new Date(lastSync).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}`
                            : ''
                        }.`
                      : 'Dữ liệu đang được lưu ngay trên máy chủ của trường. Có thể nối đám mây để có thêm bản sao lưu.'}
                  </p>
                  {status.cloud.configured && canSync && (
                    <button type="button" className="ag-btn small primary" disabled={syncing} onClick={handleSync}>
                      <Icon name="refresh" size={16} aria-hidden="true" />
                      {syncing ? 'Đang sao lưu…' : 'Sao lưu ngay'}
                    </button>
                  )}
                  {syncMsg && (
                    <p className={`ls-msg ${syncMsg.ok ? 'ok' : 'bad'}`} role={syncMsg.ok ? 'status' : 'alert'}>
                      {syncMsg.text}
                    </p>
                  )}
                </article>
              </div>
            </section>

            <section aria-labelledby="kn-ext">
              <h2 id="kn-ext" className="ls-h2">Dịch vụ thiết kế và âm thanh bên ngoài</h2>
              <div className="ls-cards">
                {EXTERNAL.map((x) => {
                  const tone: Tone = svc(x.id)?.state === 'dang_dung' ? 'ok' : 'off';
                  return (
                    <article key={x.id} className="ls-card">
                      <div className="ls-card-head">
                        <span className="ls-card-ico"><Icon name={x.icon} size={22} aria-hidden="true" /></span>
                        <h3>{x.name}</h3>
                      </div>
                      <Badge tone={tone}>{tone === 'ok' ? 'Đã nối' : 'Chưa nối'}</Badge>
                      <p>{x.what}</p>
                      {tone !== 'ok' && (
                        <div className="ls-svc-fb">
                          <strong>Cô/thầy dùng thay thế:</strong> {x.instead}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>

            <div className="ls-cta">
              <Link href="/" className="ag-btn primary">
                <Icon name="sparkles" size={18} aria-hidden="true" />
                Mở trợ lý soạn bài
              </Link>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
