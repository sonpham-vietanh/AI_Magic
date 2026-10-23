'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';

type Role = 'teacher' | 'reviewer' | 'admin';

interface UserRow {
  email: string;
  name: string;
  role: Role;
  assignedRole: Role;
  fromEnv: Role | null;
  blocked: boolean;
  firstSeen: string | null;
  lastSeen: string | null;
  loginCount: number;
}
interface Stats {
  total: number;
  newLast7Days: number;
  reviewers: number;
  admins: number;
  blocked: number;
}
interface AuditRow {
  id: string;
  at: string;
  actor: string;
  action: 'role_change' | 'block' | 'unblock';
  target: string;
  detail: { from?: string; to?: string };
}

const ROLE_LABEL: Record<Role, string> = { teacher: 'Giáo viên', reviewer: 'Người duyệt', admin: 'Quản trị viên' };
const ROLES: Role[] = ['teacher', 'reviewer', 'admin'];

type Gate = 'loading' | 'ok' | 'login' | 'forbidden' | 'error';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Ngày trên, giờ dưới (chữ nhỏ) để cột ngày không quá rộng. */
function FmtCell({ iso }: { iso: string | null }) {
  const text = fmt(iso);
  const [time, date] = text.split(' ');
  if (!date) return <>{text}</>;
  return (
    <>
      <span>{date}</span>
      <small className="qt-time">{time}</small>
    </>
  );
}

function describe(a: AuditRow): string {
  if (a.action === 'block') return 'Chặn tài khoản';
  if (a.action === 'unblock') return 'Mở chặn tài khoản';
  const f = ROLE_LABEL[a.detail.from as Role] ?? a.detail.from ?? '?';
  const t = ROLE_LABEL[a.detail.to as Role] ?? a.detail.to ?? '?';
  return `Đổi vai trò: ${f} → ${t}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<{ status: number; body: (T & { ok?: boolean; error?: string }) | null }> {
  try {
    const res = await fetch(url, { cache: 'no-store', ...init });
    let body: (T & { ok?: boolean; error?: string }) | null = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

export function AdminUsers() {
  const [tab, setTab] = useState<'users' | 'audit'>('users');
  const [gate, setGate] = useState<Gate>('loading');
  const [gateMsg, setGateMsg] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [q, setQ] = useState('');
  const [qLive, setQLive] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPages, setAuditPages] = useState(1);
  const [loadingList, setLoadingList] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qLive.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [qLive]);

  const loadUsers = useCallback(async () => {
    const id = ++reqId.current;
    setLoadingList(true);
    const sp = new URLSearchParams({ page: String(page), pageSize: '15' });
    if (q) sp.set('q', q);
    if (roleFilter) sp.set('role', roleFilter);
    if (statusFilter) sp.set('status', statusFilter);
    const { status, body } = await api<{
      users: UserRow[];
      stats: Stats;
      total: number;
      pages: number;
      page: number;
    }>(`/api/admin/users?${sp.toString()}`);
    if (id !== reqId.current) return;
    setLoadingList(false);
    if (status === 401) {
      setGate('login');
      return;
    }
    if (status === 403) {
      setGate('forbidden');
      return;
    }
    if (!body?.ok) {
      setGate('error');
      setGateMsg(body?.error ?? 'Không tải được danh sách người dùng.');
      return;
    }
    setGate('ok');
    setUsers(body.users);
    setStats(body.stats);
    setTotal(body.total);
    setPages(body.pages);
    if (body.page !== page) setPage(body.page);
  }, [page, q, roleFilter, statusFilter]);

  const loadAudit = useCallback(async () => {
    const { body } = await api<{ entries: AuditRow[]; total: number; pages: number }>(
      `/api/admin/audit?page=${auditPage}&pageSize=20`,
    );
    if (body?.ok) {
      setAudit(body.entries);
      setAuditTotal(body.total);
      setAuditPages(body.pages);
    }
  }, [auditPage]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (tab === 'audit' && gate === 'ok') void loadAudit();
  }, [tab, gate, loadAudit]);

  const save = async (u: UserRow, patch: { role?: Role; blocked?: boolean }) => {
    const label =
      patch.blocked === true
        ? `Chặn tài khoản ${u.email}? Người này sẽ không đăng nhập lại được.`
        : patch.role === 'admin'
          ? `Cấp quyền Quản trị viên cho ${u.email}?`
          : u.role === 'admin' && patch.role
            ? `Hạ quyền Quản trị viên của ${u.email} xuống ${ROLE_LABEL[patch.role]}?`
            : '';
    if (label && !window.confirm(label)) return;
    setBusy(u.email);
    setNotice(null);
    const { body } = await api<{ user: { keptByEnv: boolean } }>('/api/admin/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, ...patch }),
    });
    setBusy(null);
    if (!body?.ok) {
      setNotice({ kind: 'err', text: body?.error ?? 'Không lưu được thay đổi, cô/thầy thử lại.' });
      return;
    }
    setNotice({
      kind: 'ok',
      text: body.user.keptByEnv
        ? `Đã lưu cho ${u.email}, nhưng vai trò cao hơn từ cấu hình máy chủ vẫn được giữ.`
        : `Đã cập nhật ${u.email}.`,
    });
    void loadUsers();
    if (tab === 'audit') void loadAudit();
  };

  const filtersActive = Boolean(q || roleFilter || statusFilter);

  if (gate === 'loading') {
    return (
      <p className="qt-state" role="status">
        Đang tải dữ liệu quản trị…
      </p>
    );
  }
  if (gate === 'login' || gate === 'forbidden') {
    return (
      <div className="qt-gate" role="alert">
        <span className="qt-gate-ico" aria-hidden="true">
          <Icon name="shield" size={28} />
        </span>
        <h2>{gate === 'login' ? 'Cần đăng nhập' : 'Không đủ quyền truy cập'}</h2>
        <p>
          {gate === 'login'
            ? 'Cô/thầy đăng nhập bằng email của trường (tài khoản quản trị) để quản lý người dùng.'
            : 'Trang này chỉ dành cho quản trị viên. Nếu cô/thầy cần quyền, vui lòng liên hệ quản trị viên của trường.'}
        </p>
        {gate === 'login' ? (
          <a className="ag-btn primary" href="/dang-nhap?returnTo=%2Fquan-tri">
            Đăng nhập
          </a>
        ) : (
          <a className="ag-btn" href="/">
            Về trang chủ
          </a>
        )}
      </div>
    );
  }
  if (gate === 'error') {
    return (
      <div className="qt-gate" role="alert">
        <span className="qt-gate-ico warn" aria-hidden="true">
          <Icon name="alert" size={28} />
        </span>
        <h2>Chưa tải được dữ liệu</h2>
        <p>{gateMsg}</p>
        <button type="button" className="ag-btn primary" onClick={() => void loadUsers()}>
          <Icon name="refresh" size={18} /> Thử lại
        </button>
      </div>
    );
  }

  const tiles: { label: string; value: number; hint: string; star?: boolean }[] = [
    { label: 'Tổng người dùng', value: stats?.total ?? 0, hint: 'đã đăng nhập hoặc được cấp quyền', star: true },
    { label: 'Mới 7 ngày qua', value: stats?.newLast7Days ?? 0, hint: 'lần đầu đăng nhập' },
    { label: 'Người duyệt', value: stats?.reviewers ?? 0, hint: `${stats?.admins ?? 0} quản trị viên` },
    { label: 'Bị chặn', value: stats?.blocked ?? 0, hint: 'không đăng nhập được' },
  ];

  return (
    <div className="qt-wrap">
      <div className="qt-tiles">
        {tiles.map((t) => (
          <div key={t.label} className={`qt-tile${t.star ? ' star' : ''}`}>
            <div className="qt-tile-label">{t.label}</div>
            <div className="qt-tile-num">{t.value}</div>
            <div className="qt-tile-hint">{t.hint}</div>
          </div>
        ))}
      </div>

      <div className="qt-note">
        <Icon name="info" size={18} />
        <p>
          Đổi vai trò hoặc chặn có hiệu lực ngay với các thao tác duyệt và quản trị. Giao diện của người đó có thể vẫn
          hiện vai trò cũ cho đến khi họ đăng nhập lại (phiên lưu tối đa 14 ngày). Tài khoản bị chặn không thể đăng nhập lại.
        </p>
      </div>

      <div role="tablist" aria-label="Mục quản trị" className="qt-tabs">
        <button type="button" role="tab" id="qt-tab-users" aria-selected={tab === 'users'} aria-controls="qt-panel-users" className="qt-tab" onClick={() => setTab('users')}>
          <Icon name="users" size={18} /> Người dùng
        </button>
        <button type="button" role="tab" id="qt-tab-audit" aria-selected={tab === 'audit'} aria-controls="qt-panel-audit" className="qt-tab" onClick={() => setTab('audit')}>
          <Icon name="clipboard" size={18} /> Nhật ký quản trị
        </button>
      </div>

      <div className="qt-live" role="status" aria-live="polite">
        {notice && <p className={`qt-toast ${notice.kind}`}>{notice.text}</p>}
      </div>

      {tab === 'users' ? (
        <section id="qt-panel-users" role="tabpanel" aria-labelledby="qt-tab-users" className="qt-panel">
          <div className="qt-toolbar">
            <label className="qt-search">
              <span className="qt-sr">Tìm theo tên hoặc email</span>
              <input className="ag-field" type="search" placeholder="Tìm theo tên hoặc email" value={qLive} onChange={(e) => setQLive(e.target.value)} />
            </label>
            <label className="qt-filter">
              <span className="qt-lbl">Vai trò</span>
              <select className="ag-field" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
                <option value="">Tất cả</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </label>
            <label className="qt-filter">
              <span className="qt-lbl">Trạng thái</span>
              <select className="ag-field" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                <option value="">Tất cả</option>
                <option value="active">Đang hoạt động</option>
                <option value="blocked">Bị chặn</option>
              </select>
            </label>
          </div>

          {users.length === 0 ? (
            <div className="qt-empty">
              <Icon name="users" size={28} />
              <p>{filtersActive ? 'Không có người dùng nào khớp bộ lọc.' : 'Chưa có ai đăng nhập. Danh sách sẽ xuất hiện khi giáo viên đăng nhập bằng email trường.'}</p>
            </div>
          ) : (
            <div className="qt-scroll" role="region" aria-label="Bảng người dùng, cuộn ngang để xem đủ cột" tabIndex={0} aria-busy={loadingList}>
              <table className="qt-table">
                <thead>
                  <tr>
                    <th scope="col">Người dùng</th>
                    <th scope="col">Vai trò</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Lần đầu</th>
                    <th scope="col">Gần nhất</th>
                    <th scope="col" className="num">Lượt đăng nhập</th>
                    <th scope="col">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const locked = busy === u.email;
                    return (
                      <tr key={u.email} className={u.blocked ? 'blocked' : undefined}>
                        <td>
                          <div className="qt-who">
                            <span className="qt-avatar" aria-hidden="true">{(u.name || u.email).trim().charAt(0).toUpperCase()}</span>
                            <span className="qt-who-t">
                              <strong>{u.name}</strong>
                              <small>{u.email}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          <select
                            className="ag-field qt-role"
                            aria-label={`Vai trò của ${u.email}`}
                            value={u.role}
                            disabled={locked}
                            onChange={(e) => void save(u, { role: e.target.value as Role })}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                            ))}
                          </select>
                          {u.fromEnv && <small className="qt-env">Cấu hình máy chủ: {ROLE_LABEL[u.fromEnv]}</small>}
                        </td>
                        <td>
                          <span className={`qt-badge ${u.blocked ? 'bad' : 'good'}`}>{u.blocked ? 'Bị chặn' : 'Hoạt động'}</span>
                        </td>
                        <td className="qt-nowrap">
                          <FmtCell iso={u.firstSeen} />
                        </td>
                        <td className="qt-nowrap">
                          <FmtCell iso={u.lastSeen} />
                        </td>
                        <td className="num">{u.loginCount}</td>
                        <td>
                          <button type="button" className={`ag-btn small${u.blocked ? '' : ' qt-danger'}`} disabled={locked} onClick={() => void save(u, { blocked: !u.blocked })}>
                            {u.blocked ? 'Mở chặn' : 'Chặn'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <Pager page={page} pages={pages} total={total} unit="người dùng" onPage={setPage} />
        </section>
      ) : (
        <section id="qt-panel-audit" role="tabpanel" aria-labelledby="qt-tab-audit" className="qt-panel">
          {audit.length === 0 ? (
            <div className="qt-empty">
              <Icon name="clipboard" size={28} />
              <p>Chưa có thao tác quản trị nào được ghi lại.</p>
            </div>
          ) : (
            <div className="qt-scroll" role="region" aria-label="Nhật ký quản trị, cuộn ngang để xem đủ cột" tabIndex={0}>
              <table className="qt-table audit">
                <thead>
                  <tr>
                    <th scope="col">Thời gian</th>
                    <th scope="col">Người thực hiện</th>
                    <th scope="col">Thao tác</th>
                    <th scope="col">Tài khoản bị tác động</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id}>
                      <td className="qt-nowrap">
                          <FmtCell iso={a.at} />
                        </td>
                      <td>{a.actor}</td>
                      <td><span className={`qt-badge ${a.action === 'block' ? 'bad' : a.action === 'unblock' ? 'good' : 'info'}`}>{describe(a)}</span></td>
                      <td>{a.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={auditPage} pages={auditPages} total={auditTotal} unit="mục" onPage={setAuditPage} />
        </section>
      )}
    </div>
  );
}

function Pager({ page, pages, total, unit, onPage }: { page: number; pages: number; total: number; unit: string; onPage: (n: number) => void }) {
  return (
    <div className="qt-pager">
      <span>
        {total} {unit}
      </span>
      {pages > 1 && (
        <div className="qt-pager-btns">
          <button type="button" className="ag-btn small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Trước
          </button>
          <span aria-live="polite">
            Trang {page}/{pages}
          </span>
          <button type="button" className="ag-btn small" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            Sau
          </button>
        </div>
      )}
    </div>
  );
}
