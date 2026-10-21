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
import { AssistantDrawer } from './AssistantDrawer';
import { Icon, type IconName } from './ui/icons';
import '../app/ui-ls.css';

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

// Menu theo mục "Web App" của sơ đồ v2.1.
const WORK_NAV: NavItem[] = [
  { href: '/', label: 'Trợ lý soạn bài', icon: 'sparkles', exact: true },
  { href: '/kho', label: 'Thư viện tiết học', icon: 'library' },
  { href: '/kiem-tra', label: 'Kiểm tra & Đề thi', icon: 'exam' },
  { href: '/lich-su', label: 'Lịch sử của tôi', icon: 'clock' },
];

const BUILD_NAV: NavItem[] = [
  { href: '/duyet', label: 'Duyệt học liệu mẫu', icon: 'shield' },
  { href: '/chat-luong', label: 'Chất lượng bài soạn', icon: 'chart' },
];

const EXTRA_NAV: NavItem[] = [
  { href: '/cong-cu', label: 'Kho 82 công cụ', icon: 'grid' },
  { href: '/thu-vien', label: 'Học liệu đã lưu', icon: 'folder' },
  { href: '/so-do-lien-mon', label: 'Sơ đồ liên môn', icon: 'graph' },
  { href: '/ho-so-lop-hoc', label: 'Lớp học & chương trình', icon: 'users' },
  { href: '/soan-bai', label: 'Soạn bài bằng biểu mẫu', icon: 'clipboard' },
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
    title: 'Thư viện học liệu',
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
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [recent, setRecent] = useState<HistoryItem[]>([]);
  const [extraOpen, setExtraOpen] = useState(false);

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

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  useEffect(() => {
    try {
      setExtraOpen(localStorage.getItem(EXTRA_KEY) === '1');
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

  const openAssistant = () => {
    setNavOpen(false);
    if (onOpenAssistant) onOpenAssistant();
    else setAssistantOpen(true);
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
      {navOpen && <div className="ag-scrim" aria-hidden="true" onClick={() => setNavOpen(false)} />}

      <aside id="ag-rail" ref={railRef} className="ag-rail">
        <div className="ag-rail-head">
          <Link href="/" className="ag-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-crest.webp" alt="Trường Việt Anh" />
            <span>
              <span className="ag-brand-name">Việt Anh MagicStudio</span>
              <span className="ag-brand-sub" style={{ display: 'block' }}>
                Trợ lý soạn bài
              </span>
            </span>
          </Link>
          <button type="button" className="ag-new" onClick={startNewChat}>
            <Icon name="plus" />
            Cuộc trò chuyện mới
          </button>
        </div>

        <div className="ag-rail-scroll">
          <div className="ag-label">Soạn và dùng</div>
          {renderNav(WORK_NAV, 'Soạn và dùng')}

          <div className="ag-label">Gần đây</div>
          {recent.length === 0 ? (
            <p className="ag-empty-note">Các bản soạn của cô/thầy sẽ hiện ở đây.</p>
          ) : (
            <div className="ag-recent">
              {recent.map((h) => (
                <button key={h.id} type="button" className="ag-recent-item" onClick={() => openHistory(h.id)}>
                  <span className="ag-recent-title">{h.title}</span>
                  <span className="ag-recent-meta">{formatWhen(h.at)}</span>
                </button>
              ))}
            </div>
          )}

          <div className="ag-label">Duyệt và chất lượng</div>
          {renderNav(BUILD_NAV, 'Duyệt và chất lượng')}

          <button
            type="button"
            className="ls-nav-toggle"
            aria-expanded={extraOpen}
            aria-controls="ls-nav-extra"
            onClick={toggleExtra}
          >
            <span>Công cụ khác</span>
            <Icon name="chevronDown" size={18} />
          </button>
          {(extraOpen) && (
            <div id="ls-nav-extra">
              {renderNav(EXTRA_NAV, 'Công cụ khác')}
            </div>
          )}
        </div>

        <div className="ag-rail-foot">
          <button type="button" className="ag-assist-btn" onClick={openAssistant}>
            <Icon name="book" />
            Hỏi đáp chuyên môn
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

      {!onOpenAssistant && <AssistantDrawer open={assistantOpen} onClose={() => setAssistantOpen(false)} />}
    </div>
  );
}
