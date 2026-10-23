'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  EVENT_HISTORY,
  EVENT_NEW_CHAT,
  EVENT_OPEN_HISTORY,
  formatWhen,
  loadHistory,
  type HistoryItem,
} from '@/lib/agent/history';
import { readActor } from '@/lib/agent/actor';
import { QuickSearch } from './studio/QuickSearch';
import { AccountMenu } from './ui/AccountMenu';
import { Icon, type IconName } from './ui/icons';
import { parseMe, quotaLeft, type MeState } from './ui/uiLogic';
import { hocBaMinutes } from '@/lib/stats/localSavings';
import '../app/ui-ls.css';
import '../app/ui-shell.css';

export interface ShellProps {
  children: React.ReactNode;
  onOpenAssistant?: () => void;
  title?: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
  rightActions?: React.ReactNode;
  hero?: React.ReactNode;
  /** 'chat': toàn màn hình cho trợ lý; 'page': trang thường có tiêu đề. */
  variant?: 'page' | 'chat';
}

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
}

// Menu gom theo việc cô/thầy làm, dùng từ ngữ quen thuộc với giáo viên.
const ASSIST_NAV: NavItem[] = [{ href: '/', label: 'Trợ lý soạn bài', icon: 'sparkles', exact: true }];

const WORK_NAV: NavItem[] = [
  { href: '/hoc-ba', label: 'Nhận xét học bạ', icon: 'edit' },
  { href: '/soan-bai', label: 'Soạn bài bằng biểu mẫu', icon: 'clipboard' },
  { href: '/kiem-tra', label: 'Kiểm tra & Đề thi', icon: 'exam' },
];

const MINE_NAV: NavItem[] = [
  { href: '/thu-vien', label: 'Học liệu đã lưu', icon: 'folder' },
  { href: '/lich-su', label: 'Lịch sử của tôi', icon: 'clock' },
];

const EXTRA_NAV: NavItem[] = [
  { href: '/kho', label: 'Thư viện tiết học', icon: 'library' },
  { href: '/cong-cu', label: 'Bộ công cụ sư phạm', icon: 'grid' },
  { href: '/so-do-lien-mon', label: 'Sơ đồ liên môn', icon: 'graph' },
  { href: '/ho-so-lop-hoc', label: 'Lớp học & chương trình', icon: 'users' },
];

const BUILD_NAV: NavItem[] = [
  { href: '/duyet', label: 'Duyệt học liệu mẫu', icon: 'shield' },
  { href: '/chat-luong', label: 'Chất lượng bài soạn', icon: 'chart' },
  { href: '/ket-noi', label: 'Kết nối dịch vụ ngoài', icon: 'plug' },
];

const EXTRA_KEY = 'va.nav.extra';

const PAGE_TITLES: { prefix: string; title: string; subtitle: string }[] = [
  {
    prefix: '/cong-cu',
    title: 'Kho 82 công cụ sư phạm',
    subtitle: 'Biên soạn học liệu từ kho kiến thức, câu hỏi và kịch bản hỏi đáp của trường.',
  },
  {
    prefix: '/so-do-lien-mon',
    title: 'Sơ đồ liên môn',
    subtitle: 'Tìm bài học và xem các liên kết giữa các môn trong cùng chủ đề.',
  },
  {
    prefix: '/ho-so-lop-hoc',
    title: 'Lớp học & chương trình',
    subtitle: 'Cây chương trình GDPT 2018, đội ngũ chuyên môn và ghi chú của giáo viên chủ nhiệm.',
  },
  {
    prefix: '/thu-vien',
    title: 'Học liệu đã lưu',
    subtitle: 'Học liệu đã lưu, tài nguyên tương tác và nhật ký hoạt động.',
  },
];

function isActive(item: NavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export function Shell({
  children,
  onOpenAssistant,
  title,
  subtitle,
  rightAction,
  rightActions,
  variant,
}: ShellProps) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [savedWeek, setSavedWeek] = useState<number | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [recent, setRecent] = useState<HistoryItem[]>([]);
  const [extraOpen, setExtraOpen] = useState(true);
  const [me, setMe] = useState<MeState>({ ssoEnabled: false, user: null });
  const [meLoaded, setMeLoaded] = useState(false);
  const [quota, setQuota] = useState<number | null>(null);
  const [declared, setDeclared] = useState('');

  const mode = variant ?? 'page';
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const wasNavOpen = useRef(false);

  // Ngăn kéo mobile: chuyển focus vào khi mở, trả về nút Mở menu khi đóng.
  useEffect(() => {
    if (navOpen) {
      railRef.current?.querySelector<HTMLElement>('a[href], button')?.focus();
    } else if (wasNavOpen.current) {
      const rail = railRef.current;
      const active = document.activeElement;
      if (!active || active === document.body || (rail && rail.contains(active))) menuBtnRef.current?.focus();
    }
    wasNavOpen.current = navOpen;
  }, [navOpen]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Phím tắt toàn cục: Ctrl+K (Cmd+K) hoặc "/" mở hộp tìm nhanh, trừ khi đang gõ trong ô nhập.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      const combo = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k';
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing;
      if (combo || slash) {
        e.preventDefault();
        setNavOpen(false);
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Danh tính và hạn mức: chịu được chưa đăng nhập, API chưa có (404) hoặc lỗi mạng.
  useEffect(() => {
    const ctl = new AbortController();
    setDeclared(readActor());
    (async () => {
      let next: MeState = { ssoEnabled: false, user: null };
      try {
        const r = await fetch('/api/me', { credentials: 'same-origin', signal: ctl.signal, cache: 'no-store' });
        if (r.ok) next = parseMe(await r.json());
      } catch {
        /* giữ trạng thái mặc định */
      }
      if (ctl.signal.aborted) return;
      setMe(next);
      setMeLoaded(true);
      try {
        const r = await fetch('/api/usage/me', { credentials: 'same-origin', signal: ctl.signal, cache: 'no-store' });
        if (r.ok && !ctl.signal.aborted) setQuota(quotaLeft(await r.json()));
      } catch {
        /* bỏ qua êm */
      }
      if (next.user) {
        try {
          const r = await fetch('/api/me/savings', { credentials: 'same-origin', signal: ctl.signal, cache: 'no-store' });
          const j = (await r.json()) as { ok?: boolean; week?: { minutes?: number } };
          if (r.ok && j.ok && !ctl.signal.aborted) setSavedWeek((j.week?.minutes ?? 0) + hocBaMinutes(7));
        } catch {
          /* bỏ qua êm */
        }
      }
    })();
    return () => ctl.abort();
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNavOpen(false);
        menuBtnRef.current?.focus();
        return;
      }
      if (e.key !== 'Tab') return;
      // Giữ phím Tab trong ngăn kéo (cùng nút Đóng menu), không lọt ra nội dung phía sau.
      const rail = railRef.current;
      if (!rail) return;
      const sel = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const list = [...(menuBtnRef.current ? [menuBtnRef.current] : []), ...Array.from(rail.querySelectorAll<HTMLElement>(sel))].filter(
        (el) => el.offsetParent !== null || el === menuBtnRef.current,
      );
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !active || !list.includes(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !active || !list.includes(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(EXTRA_KEY);
      if (saved === '0') setExtraOpen(false);
      else setExtraOpen(true);
    } catch {
      /* không có localStorage */
    }
  }, []);

  useEffect(() => {
    if (EXTRA_NAV.some((i) => isActive(i, pathname))) setExtraOpen(true);
  }, [pathname]);

  const toggleExtra = () => {
    setExtraOpen((v) => {
      try {
        localStorage.setItem(EXTRA_KEY, v ? '0' : '1');
      } catch {
        /* bỏ qua */
      }
      return !v;
    });
  };

  useEffect(() => {
    const refresh = () => setRecent(loadHistory());
    refresh();
    window.addEventListener(EVENT_HISTORY, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(EVENT_HISTORY, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const startNewChat = () => {
    setNavOpen(false);
    if (pathname === '/') window.dispatchEvent(new CustomEvent(EVENT_NEW_CHAT));
    else router.push('/?new=1');
  };

  const openHistory = (id: string) => {
    setNavOpen(false);
    if (pathname === '/') window.dispatchEvent(new CustomEvent(EVENT_OPEN_HISTORY, { detail: id }));
    else router.push(`/?h=${encodeURIComponent(id)}`);
  };

  const goTo = (href: string) => {
    setNavOpen(false);
    router.push(href);
  };

  const askQuick = () => {
    setNavOpen(false);
    if (onOpenAssistant) onOpenAssistant();
    else router.push('/?ask=1');
  };

  const meta = PAGE_TITLES.find((p) => pathname.startsWith(p.prefix));
  const pageTitle = title ?? meta?.title ?? '';
  const pageSubtitle = subtitle ?? meta?.subtitle ?? '';

  const renderNav = (items: NavItem[], label = 'Điều hướng') => (
    <nav className="ag-nav" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`ag-nav-item${isActive(item, pathname) ? ' active' : ''}`}
          aria-current={isActive(item, pathname) ? 'page' : undefined}
        >
          <Icon name={item.icon} />
          <span className="ag-nav-text">{item.label}</span>
        </Link>
      ))}
    </nav>
  );

  return (
    <div className={`ag-shell${navOpen ? ' nav-open' : ''}`}>
      <div className="ag-mobilebar">
        <Link href="/" className="ag-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-crest.webp" alt="" />
          <span className="ag-brand-name">Việt Anh MagicStudio</span>
        </Link>
        <div className="qk-mobileactions">
          <button type="button" className="ag-iconbtn" aria-label="Tìm nhanh" onClick={() => setSearchOpen(true)}>
            <Icon name="search" size={22} />
          </button>
          <button
          ref={menuBtnRef}
          type="button"
          className="ag-iconbtn"
          aria-expanded={navOpen}
          aria-controls="ag-rail"
          aria-label={navOpen ? 'Đóng menu' : 'Mở menu'}
          onClick={() => setNavOpen((v) => !v)}
        >
            <Icon name={navOpen ? 'x' : 'menu'} size={22} />
          </button>
        </div>
      </div>
      {navOpen && <div className="ag-scrim" aria-hidden="true" onClick={() => setNavOpen(false)} />}

      <aside id="ag-rail" ref={railRef} className="ag-rail">
        <div className="ag-rail-head">
          <Link href="/" className="ag-brand">
            <span className="ag-brand-crest">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-crest.webp" alt="Trường Việt Anh" />
            </span>
            <span>
              <span className="ag-brand-name">Việt Anh MagicStudio</span>
              <span className="ag-brand-sub" style={{ display: 'block' }}>
                Hệ thống Công cụ Sư phạm
              </span>
            </span>
          </Link>
          <button type="button" className="ag-new" onClick={startNewChat}>
            <Icon name="plus" />
            Cuộc trò chuyện mới
          </button>
          <button
            type="button"
            className="qk-trigger"
            onClick={() => {
              setNavOpen(false);
              setSearchOpen(true);
            }}
            aria-keyshortcuts="Control+K /"
          >
            <Icon name="search" size={18} />
            <span className="qk-trigger-text">Tìm nhanh</span>
            <kbd className="qk-trigger-kbd" aria-hidden="true">
              Ctrl K
            </kbd>
          </button>
        </div>

        <div className="ag-rail-scroll">
          <div className="ag-label">Trợ lý</div>
          {renderNav(ASSIST_NAV, 'Trợ lý')}

          <div className="ag-label">Soạn bài</div>
          {renderNav(WORK_NAV, 'Soạn bài')}

          <div className="ag-label">Của tôi</div>
          {renderNav(MINE_NAV, 'Của tôi')}

          <button
            type="button"
            className="ls-nav-toggle"
            aria-expanded={extraOpen}
            aria-controls="ls-nav-extra"
            onClick={toggleExtra}
          >
            <span>Khám phá kho học liệu</span>
            <Icon name="chevronDown" size={18} />
          </button>
          {extraOpen && (
            <div id="ls-nav-extra">
              {renderNav(EXTRA_NAV, 'Khám phá kho học liệu')}
            </div>
          )}

          <div className="ag-label">Duyệt và cài đặt</div>
          {renderNav(BUILD_NAV, 'Duyệt và cài đặt')}

          {recent.length > 0 && (
            <>
              <div className="ag-label">Gần đây</div>
              <div className="rail-hist">
                {recent.slice(0, 5).map((h) => (
                  <button key={h.id} type="button" className="rail-hist-item" onClick={() => openHistory(h.id)}>
                    <span className="rail-hist-title">{h.title}</span>
                    <span className="rail-hist-meta">{formatWhen(h.at)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="ag-rail-foot">
          <AccountMenu
            me={me}
            loaded={meLoaded}
            quota={quota}
            declaredName={declared}
            savedWeekMinutes={savedWeek}
            onNavigate={() => setNavOpen(false)}
          />
          <button type="button" className="ag-assist-btn" onClick={askQuick}>
            <Icon name="book" />
            Hỏi nhanh
          </button>
        </div>
      </aside>

      <div className="ag-main">
        {mode === 'chat' ? (
          <main id="main" tabIndex={-1} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {children}
          </main>
        ) : (
          <div className="ag-page">
            {(pageTitle || rightActions || rightAction) && (
              <header className="ag-pagehead">
                <div>
                  {pageTitle && <h1>{pageTitle}</h1>}
                  {pageSubtitle && <p>{pageSubtitle}</p>}
                </div>
                <div className="row-wrap">{rightActions || rightAction}</div>
              </header>
            )}
            <main id="main" className="va-workspace" tabIndex={-1}>
              {children}
            </main>
          </div>
        )}
      </div>

      <QuickSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        history={recent.slice(0, 8).map((h) => ({ id: h.id, title: h.title, when: formatWhen(h.at) }))}
        onNavigate={goTo}
        onOpenHistory={openHistory}
      />
    </div>
  );
}
