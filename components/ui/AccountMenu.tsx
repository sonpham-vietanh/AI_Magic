'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icon, type IconName } from './icons';
import { initialOf, nextIndex, quotaLabel, roleLabel, type MeState } from './uiLogic';

interface Props {
  me: MeState;
  loaded: boolean;
  /** Số lượt AI còn lại hôm nay; null nếu chưa biết. */
  quota: number | null;
  /** Tên khai báo (chế độ khai tên). */
  declaredName: string;
  /** Gọi sau khi menu điều hướng, để đóng ngăn kéo trên điện thoại. */
  onNavigate?: () => void;
}

interface Entry {
  href: string;
  label: string;
  icon: IconName;
}

const ADMIN_ENTRIES: Entry[] = [
  { href: '/quan-tri', label: 'Người dùng & quyền', icon: 'users' },
  { href: '/quan-tri/su-dung', label: 'Sử dụng AI và chi phí', icon: 'chart' },
  { href: '/quan-tri/du-lieu', label: 'Sao lưu và dữ liệu', icon: 'download' },
];

/** Menu tài khoản: avatar + vai trò, mở menu role=menu có đủ phím mũi tên, Home/End, Esc, Tab. */
export function AccountMenu({ me, loaded, quota, declaredName, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const user = me.user;
  const isAdmin = user?.role === 'admin';
  const name = user?.name || declaredName || '';
  const initial = user ? user.initial || initialOf(user.name) : initialOf(declaredName, '?');
  const sub = !loaded ? 'Đang tải…' : user ? roleLabel(user.role) : me.ssoEnabled ? 'Chưa đăng nhập' : 'Chế độ khai tên';
  const title = name || (me.ssoEnabled ? 'Khách' : 'Chưa khai tên');

  const items = useCallback(
    () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []),
    [],
  );

  const close = useCallback((restore: boolean) => {
    setOpen(false);
    if (restore) btnRef.current?.focus();
  }, []);

  // Mở menu: chuyển focus vào mục đầu tiên.
  useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open, items]);

  // Bấm ra ngoài thì đóng (không cướp focus của chỗ vừa bấm).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // không để Esc đóng luôn ngăn kéo menu bên ngoài
      close(true);
      return;
    }
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    const list = items();
    const idx = list.indexOf(document.activeElement as HTMLElement);
    const n = nextIndex(idx, e.key, list.length, 'vertical');
    if (n !== null) {
      e.preventDefault();
      list[n]?.focus();
    }
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const navigated = () => {
    setOpen(false);
    onNavigate?.();
  };

  const logout = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const r = await fetch('/api/auth/session', { method: 'DELETE', credentials: 'same-origin' });
      if (!r.ok) throw new Error('logout');
      window.location.assign('/dang-nhap');
    } catch {
      setBusy(false);
      setFailed(true);
    }
  };

  return (
    <div className="ui-acct" ref={wrapRef}>
      {quota !== null && (
        <div className={`ui-quota${quota === 0 ? ' is-out' : ''}`} role="status">
          <Icon name="sparkles" size={16} />
          <span>{quotaLabel(quota)}</span>
        </div>
      )}
      <button
        ref={btnRef}
        type="button"
        className="ui-acct-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
      >
        <span className={`ui-avatar${user ? '' : ' is-guest'}`} aria-hidden="true">
          {initial}
        </span>
        <span className="ui-acct-text">
          <span className="ui-acct-name">{title}</span>
          <span className="ui-acct-role">{sub}</span>
        </span>
        <Icon name="chevronDown" size={18} className={`ui-acct-chev${open ? ' open' : ''}`} />
        <span className="ui-sr">Tài khoản của tôi</span>
      </button>

      {open && (
        <div id={menuId} ref={menuRef} className="ui-menu" role="menu" aria-label="Tài khoản" onKeyDown={onMenuKey}>
          <div className="ui-menu-head" role="presentation">
            <strong>{title}</strong>
            {user?.email && <span>{user.email}</span>}
            {!user && !me.ssoEnabled && <span>Chưa bật đăng nhập Google, cô/thầy tự khai tên khi soạn bài.</span>}
          </div>
          <Link href="/tai-khoan" role="menuitem" className="ui-menu-item" tabIndex={-1} onClick={navigated}>
            <Icon name="users" size={18} />
            Tài khoản của tôi
          </Link>
          {isAdmin && (
            <>
              <div className="ui-menu-sep" role="separator" />
              <div className="ui-menu-group" role="presentation">
                Quản trị
              </div>
              {ADMIN_ENTRIES.map((en) => (
                <Link key={en.href} href={en.href} role="menuitem" className="ui-menu-item" tabIndex={-1} onClick={navigated}>
                  <Icon name={en.icon} size={18} />
                  {en.label}
                </Link>
              ))}
            </>
          )}
          {(user || me.ssoEnabled) && <div className="ui-menu-sep" role="separator" />}
          {user ? (
            <button type="button" role="menuitem" className="ui-menu-item is-out" tabIndex={-1} onClick={logout} disabled={busy}>
              <Icon name="x" size={18} />
              {busy ? 'Đang đăng xuất…' : 'Đăng xuất'}
            </button>
          ) : me.ssoEnabled ? (
            <Link href="/dang-nhap" role="menuitem" className="ui-menu-item" tabIndex={-1} onClick={navigated}>
              <Icon name="send" size={18} />
              Đăng nhập bằng Google
            </Link>
          ) : null}
          {failed && (
            <p className="ui-menu-err" role="alert">
              Chưa đăng xuất được, cô/thầy thử lại sau ít giây.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
