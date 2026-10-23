'use client';

import { useEffect, useState } from 'react';
import { readActor, writeActor, writeReviewerKey } from '@/lib/agent/actor';
import { isReviewerRole, roleLabel } from '@/lib/agent/prefs';
import { useMe } from './useMe';

/** Tên cô/thầy lưu ở localStorage 'va.actor' kết hợp phiên chữ ký số `/api/auth/session`. */
export function useActor(): [string, (v: string) => void, boolean] {
  const [name, setName] = useState('');
  const [ready, setReady] = useState(false);
  const [me] = useMe();
  const ssoName = me.ssoEnabled && me.user ? me.user.name : '';
  useEffect(() => {
    if (!ssoName) return;
    setName(ssoName);
    writeActor(ssoName);
  }, [ssoName]);
  useEffect(() => {
    const local = readActor();
    setName(local);
    setReady(true);
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && j.session?.via === 'google' && j.session.name) {
          // Đăng nhập email trường: tên lấy từ phiên đã ký, không cho sửa tay.
          setName(j.session.name);
          writeActor(j.session.name);
        } else if (j?.ok && j.session?.name && !local) {
          setName(j.session.name);
          writeActor(j.session.name);
        }
      })
      .catch(() => undefined);
  }, []);
  const save = (v: string) => {
    if (ssoName) return; // đăng nhập email trường: tên lấy từ phiên, không sửa tay
    const clean = v.trim().slice(0, 100);
    setName(clean);
    writeActor(clean);
    if (clean) {
      void fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean }),
      }).catch(() => undefined);
    }
  };
  return [name, save, ready];
}

/** Ô nhỏ hỏi một lần "Tên cô/thầy"; hỗ trợ xác thực quyền Tổ trưởng/Người duyệt (cookie chữ ký số). */
export function TeacherName({
  value,
  onSave,
  ready,
  inline = false,
}: {
  value: string;
  onSave: (v: string) => void;
  ready: boolean;
  inline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [reviewerKey, setReviewerKey] = useState('');
  const [role, setRole] = useState<'teacher' | 'reviewer'>('teacher');
  const [authMsg, setAuthMsg] = useState('');
  const [ssoUser, setSsoUser] = useState<{ name: string; email?: string } | null>(null);
  const [me, meReady] = useMe();

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j?.ok && j.session?.role === 'reviewer') {
          setRole('reviewer');
        }
        if (j?.ok && j.session?.via === 'google') {
          setSsoUser({ name: j.session.name, email: j.session.email });
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [value]);

  if (!ready || !meReady) return null;

  // Khi SSO bật: tên và quyền lấy từ phiên; ẩn hẳn ô nhập tên và ô mã người duyệt.
  const sso = me.ssoEnabled && me.user ? me.user : null;

  async function logout() {
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch {
      /* vẫn chuyển về trang đăng nhập */
    }
    window.location.assign('/dang-nhap');
  }

  if (sso || ssoUser) {
    const shownName = sso?.name ?? ssoUser?.name ?? '';
    const shownEmail = sso?.email ?? ssoUser?.email;
    const shownRole = sso ? sso.role : role;
    return (
      <span className="ag-who-pill ag-who-sso">
        <span className="ag-who-dot" aria-hidden="true" />
        <span title={shownEmail}>
          {shownName}
          {isReviewerRole(shownRole) ? <em className="ag-who-role">{roleLabel(shownRole)}</em> : null}
        </span>
        <button type="button" className="ag-link" onClick={logout} aria-label="Đăng xuất">
          Đăng xuất
        </button>
      </span>
    );
  }

  async function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    const clean = draft.trim();
    if (!clean) return;
    setAuthMsg('');
    const keyTrim = reviewerKey.trim();
    if (keyTrim) {
      try {
        const res = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: clean, reviewerKey: keyTrim }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) {
          setAuthMsg(j.error || 'Mã người duyệt chưa khớp.');
          return;
        }
        writeReviewerKey(keyTrim);
        setRole('reviewer');
      } catch {
        setAuthMsg('Không kết nối được máy chủ xác thực.');
        return;
      }
    }
    onSave(clean);
    setReviewerKey('');
    setEditing(false);
  }

  if (inline) {
    if (!editing) {
      return (
        <button
          type="button"
          className="ag-who-pill"
          aria-label={value ? `Đổi tên giáo viên (${value})` : 'Nhập tên giáo viên'}
          onClick={() => {
            setDraft(value);
            setAuthMsg('');
            setEditing(true);
          }}
        >
          <span className="ag-who-dot" aria-hidden="true" />
          <span>
            {value ? `GV: ${value}` : 'Nhập tên cô/thầy'}
            {role === 'reviewer' ? ' · Người duyệt' : ''}
          </span>
        </button>
      );
    }
    return (
      <form className="ag-who-inline-form" onSubmit={submitProfile}>
        <input
          id="ag-who-input"
          className="ag-who-inline-input"
          value={draft}
          maxLength={100}
          autoFocus
          autoComplete="name"
          placeholder="Tên cô/thầy (VD: Cô Lan)"
          aria-label="Tên cô/thầy"
          onChange={(e) => setDraft(e.target.value)}
        />
        <input
          className="ag-who-inline-input"
          type="password"
          value={reviewerKey}
          maxLength={120}
          placeholder="Mã người duyệt (tuỳ chọn)"
          aria-label="Mã người duyệt (tuỳ chọn)"
          style={{ width: 155 }}
          onChange={(e) => setReviewerKey(e.target.value)}
        />
        <button type="submit" className="ag-btn small primary" disabled={!draft.trim()}>
          Lưu
        </button>
        <button type="button" className="ag-btn small ghost" onClick={() => setEditing(false)}>
          Đóng
        </button>
        {authMsg && <small style={{ color: '#b91c1c', fontSize: 11 }}>{authMsg}</small>}
      </form>
    );
  }

  if (value && !editing) {
    return (
      <div className="ag-who">
        <span>
          Cô/thầy: <strong>{value}</strong>
          {role === 'reviewer' && (
            <span className="ls-badge ok" style={{ marginLeft: 6, fontSize: 11 }}>
              Người duyệt đã xác thực
            </span>
          )}
        </span>
        <button
          type="button"
          className="ag-link"
          aria-label="Sửa tên cô/thầy"
          onClick={() => {
            setDraft(value);
            setAuthMsg('');
            setEditing(true);
          }}
        >
          Sửa
        </button>
      </div>
    );
  }

  return (
    <form className="ag-who ag-who-form" onSubmit={submitProfile}>
      <label htmlFor="ag-who-input">Tên cô/thầy</label>
      <input
        id="ag-who-input"
        className="ag-field"
        value={draft}
        maxLength={100}
        autoComplete="name"
        placeholder="Ví dụ: Cô Lan"
        onChange={(e) => setDraft(e.target.value)}
      />
      <button type="submit" className="ag-btn small" disabled={!draft.trim()}>
        Lưu
      </button>
      {editing && (
        <button type="button" className="ag-link" onClick={() => setEditing(false)}>
          Huỷ
        </button>
      )}
    </form>
  );
}
