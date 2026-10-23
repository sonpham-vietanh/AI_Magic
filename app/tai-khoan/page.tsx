'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { Icon } from '@/components/ui/icons';
import { GRADE_OPTIONS, SUBJECT_OPTIONS } from '@/components/agent/types';
import { FORMAT_DAU_RA, PHONG_CACH } from '@/lib/workflows/types';
import '../ui-tk.css';

interface MeUser {
  name: string;
  email: string;
  role: 'teacher' | 'reviewer' | 'admin';
  via: 'google' | 'name';
  initial: string;
}
interface Prefs {
  mon?: string;
  khoi?: string;
  phongCach?: string;
}
interface MeResp {
  ok: boolean;
  ssoEnabled?: boolean;
  user?: MeUser | null;
  prefs?: Prefs;
  error?: string;
}
interface Activity {
  stats: { versionCount: number; lastAt: string | null; byFormat: Record<string, number> };
  recent: { id: string; title: string; format: string; lessonTitle?: string; number: number; createdAt: string }[];
}

const ROLE_LABEL: Record<MeUser['role'], string> = {
  teacher: 'Giáo viên',
  reviewer: 'Người duyệt',
  admin: 'Quản trị viên',
};

function formatLabel(id: string): string {
  return FORMAT_DAU_RA.find((f) => f.id === id)?.label ?? id;
}
function when(iso: string | null): string {
  if (!iso) return 'Chưa có';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export default function TaiKhoanPage() {
  const [me, setMe] = useState<MeResp | null>(null);
  const [loadError, setLoadError] = useState('');
  const [activity, setActivity] = useState<Activity | null>(null);
  const [activityError, setActivityError] = useState(false);
  const [form, setForm] = useState<Prefs>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const r = await fetch('/api/me', { cache: 'no-store' });
      const j = (await r.json()) as MeResp;
      if (!j.ok) {
        setLoadError(j.error || 'Không tải được thông tin tài khoản.');
        setMe({ ok: false, user: null, prefs: {} });
        return;
      }
      setMe(j);
      setForm(j.prefs ?? {});
      if (j.user) {
        try {
          const a = await fetch('/api/me/activity', { cache: 'no-store' });
          const aj = await a.json();
          if (aj.ok) setActivity({ stats: aj.stats, recent: aj.recent });
          else setActivityError(true);
        } catch {
          setActivityError(true);
        }
      }
    } catch {
      setLoadError('Không kết nối được máy chủ để tải thông tin tài khoản.');
      setMe({ ok: false, user: null, prefs: {} });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savePrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch('/api/me/prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mon: form.mon ?? '', khoi: form.khoi ?? '', phongCach: form.phongCach ?? '' }),
      });
      const j = await r.json();
      if (j.ok) {
        setForm(j.prefs ?? {});
        setSaveMsg({ kind: 'ok', text: 'Đã lưu tuỳ chọn mặc định.' });
      } else {
        setSaveMsg({ kind: 'bad', text: j.error || 'Chưa lưu được tuỳ chọn.' });
      }
    } catch {
      setSaveMsg({ kind: 'bad', text: 'Không kết nối được máy chủ. Cô/thầy thử lại.' });
    } finally {
      setSaving(false);
    }
  };

  const downloadData = async () => {
    setExporting(true);
    setExportMsg(null);
    try {
      const r = await fetch('/api/me/export', { cache: 'no-store' });
      if (!r.ok) {
        let text = 'Chưa tải được dữ liệu.';
        try {
          text = (await r.json()).error || text;
        } catch {
          /* giữ thông báo mặc định */
        }
        setExportMsg({ kind: 'bad', text });
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `du-lieu-cua-toi-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportMsg({ kind: 'ok', text: 'Đã tải tệp dữ liệu về máy.' });
    } catch {
      setExportMsg({ kind: 'bad', text: 'Không kết nối được máy chủ. Cô/thầy thử lại.' });
    } finally {
      setExporting(false);
    }
  };

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch {
      /* vẫn chuyển về trang đăng nhập */
    }
    window.location.assign('/dang-nhap');
  };

  const user = me?.user ?? null;
  const sso = Boolean(me?.ssoEnabled);

  return (
    <Shell title="Tài khoản của tôi" subtitle="Hồ sơ, tuỳ chọn mặc định khi soạn bài và dữ liệu cá nhân của cô/thầy.">
      <div className="tk">
        {me === null && (
          <p role="status" className="tk-skeleton">
            Đang tải thông tin tài khoản…
          </p>
        )}

        {loadError && (
          <div role="alert" className="tk-alert tk-alert-bad">
            <Icon name="alert" size={20} />
            <span>{loadError}</span>
            <button type="button" className="ag-btn small" onClick={() => void load()}>
              Thử lại
            </button>
          </div>
        )}

        {me !== null && !user && !loadError && (
          <section className="tk-empty" aria-labelledby="tk-empty-h">
            <div className="tk-empty-art" aria-hidden="true">
              <svg viewBox="0 0 120 120" width="96" height="96" fill="none">
                <circle cx="60" cy="60" r="56" fill="#FBF6DC" />
                <circle cx="60" cy="46" r="16" fill="#26275D" />
                <path d="M28 96c2-18 15-28 32-28s30 10 32 28" fill="#26275D" />
                <circle cx="88" cy="32" r="7" fill="#E8C40A" />
              </svg>
            </div>
            <h2 id="tk-empty-h">{sso ? 'Cô/thầy chưa đăng nhập' : 'Chưa bật đăng nhập bằng email trường'}</h2>
            <p>
              {sso
                ? 'Đăng nhập bằng email @truongvietanh.com để xem hồ sơ, lưu tuỳ chọn mặc định và tải dữ liệu của riêng cô/thầy.'
                : 'Hệ thống đang chạy ở chế độ không cần đăng nhập, nên chưa có hồ sơ cá nhân để hiển thị. Khi quản trị viên bật đăng nhập Google Workspace, hồ sơ và tuỳ chọn của cô/thầy sẽ xuất hiện tại đây. Các công cụ soạn bài vẫn dùng bình thường.'}
            </p>
            <div className="tk-actions">
              {sso && (
                <a className="ag-btn primary" href="/dang-nhap?returnTo=/tai-khoan">
                  <Icon name="shield" size={18} />
                  Đăng nhập bằng email trường
                </a>
              )}
              <Link className="ag-btn" href="/">
                Về trợ lý soạn bài
              </Link>
            </div>
          </section>
        )}

        {user && (
          <>
            <section className="tk-profile" aria-label="Hồ sơ">
              <div className="tk-profile-band" aria-hidden="true" />
              <div className="tk-profile-body">
                <div className="tk-avatar" aria-hidden="true">
                  {user.initial}
                </div>
                <div className="tk-id">
                  <h2>{user.name}</h2>
                  <p className="tk-email">{user.email || 'Chưa có email (đăng nhập bằng tên)'}</p>
                  <div className="tk-badges">
                    <span className={`tk-badge role-${user.role}`}>
                      <Icon name={user.role === 'teacher' ? 'users' : 'shield'} size={14} />
                      {ROLE_LABEL[user.role]}
                    </span>
                    <span className="tk-badge">
                      {user.via === 'google' ? 'Đăng nhập qua Google Workspace' : 'Đăng nhập bằng tên'}
                    </span>
                  </div>
                </div>
                <button type="button" className="ag-btn tk-logout" onClick={logout} disabled={loggingOut}>
                  {loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
                </button>
              </div>
              {user.role === 'admin' && (
                <div className="tk-adminlink">
                  <Link href="/quan-tri">Vào trang quản trị người dùng</Link>
                </div>
              )}
            </section>

            <section aria-labelledby="tk-act-h" className="tk-card">
              <h2 id="tk-act-h">Hoạt động của tôi</h2>
              {activityError && (
                <p className="ag-note" role="status">
                  Chưa tải được thống kê. Cô/thầy tải lại trang sau ít phút.
                </p>
              )}
              {!activityError && !activity && <p className="tk-skeleton">Đang tải thống kê…</p>}
              {activity && (
                <>
                  <div className="tk-stats">
                    <div className="tk-stat">
                      <span className="tk-stat-n">{activity.stats.versionCount}</span>
                      <span className="tk-stat-l">Bản đã soạn</span>
                    </div>
                    <div className="tk-stat">
                      <span className="tk-stat-n tk-stat-date">{when(activity.stats.lastAt)}</span>
                      <span className="tk-stat-l">Lần soạn gần nhất</span>
                    </div>
                    <div className="tk-stat">
                      <span className="tk-stat-n">{Object.keys(activity.stats.byFormat).length}</span>
                      <span className="tk-stat-l">Dạng học liệu đã dùng</span>
                    </div>
                  </div>
                  {activity.recent.length === 0 ? (
                    <p className="ag-note">
                      Cô/thầy chưa lưu bản soạn nào. <Link href="/">Bắt đầu soạn bài</Link> để thấy hoạt động tại đây.
                    </p>
                  ) : (
                    <ul className="tk-recent">
                      {activity.recent.map((v) => (
                        <li key={v.id}>
                          <Link href="/lich-su">
                            <span className="tk-recent-t">{v.lessonTitle || v.title}</span>
                            <span className="tk-recent-m">
                              {formatLabel(v.format)} · bản {v.number} · {when(v.createdAt)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>

            <section aria-labelledby="tk-pref-h" className="tk-card">
              <h2 id="tk-pref-h">Tuỳ chọn mặc định</h2>
              <p className="tk-hint">Dùng để điền sẵn khi cô/thầy soạn bài mới. Có thể đổi bất kỳ lúc nào.</p>
              <form onSubmit={savePrefs} className="tk-form">
                <label className="tk-field">
                  <span className="tk-label">Môn thường dạy</span>
                  <select
                    className="tk-input"
                    value={form.mon ?? ''}
                    onChange={(e) => setForm({ ...form, mon: e.target.value })}
                  >
                    <option value="">Chưa chọn</option>
                    {SUBJECT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tk-field">
                  <span className="tk-label">Khối</span>
                  <select
                    className="tk-input"
                    value={form.khoi ?? ''}
                    onChange={(e) => setForm({ ...form, khoi: e.target.value })}
                  >
                    <option value="">Chưa chọn</option>
                    {GRADE_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        Lớp {g}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tk-field">
                  <span className="tk-label">Phong cách giảng dạy</span>
                  <select
                    className="tk-input"
                    value={form.phongCach ?? ''}
                    onChange={(e) => setForm({ ...form, phongCach: e.target.value })}
                  >
                    <option value="">Chưa chọn</option>
                    {PHONG_CACH.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="tk-form-foot">
                  <button type="submit" className="ag-btn primary" disabled={saving}>
                    {saving ? 'Đang lưu…' : 'Lưu tuỳ chọn'}
                  </button>
                  {saveMsg && (
                    <span role={saveMsg.kind === 'bad' ? 'alert' : 'status'} className={`tk-msg tk-msg-${saveMsg.kind}`}>
                      {saveMsg.text}
                    </span>
                  )}
                </div>
              </form>
            </section>

            <section aria-labelledby="tk-data-h" className="tk-card">
              <h2 id="tk-data-h">Dữ liệu của tôi</h2>
              <p className="tk-hint">
                Tải về một tệp JSON gồm hồ sơ, tuỳ chọn, danh sách bản đã soạn và tín hiệu sử dụng của riêng cô/thầy. Tệp không chứa dữ
                liệu của người khác.
              </p>
              <div className="tk-form-foot">
                <button type="button" className="ag-btn" onClick={downloadData} disabled={exporting}>
                  <Icon name="download" size={18} />
                  {exporting ? 'Đang chuẩn bị…' : 'Tải dữ liệu của tôi'}
                </button>
                {exportMsg && (
                  <span role={exportMsg.kind === 'bad' ? 'alert' : 'status'} className={`tk-msg tk-msg-${exportMsg.kind}`}>
                    {exportMsg.text}
                  </span>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
