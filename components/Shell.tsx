'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AssistantDrawer } from './AssistantDrawer';

export interface ShellProps {
  children: React.ReactNode;
  onOpenAssistant?: () => void;
  title?: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
  rightActions?: React.ReactNode;
  hero?: React.ReactNode;
}

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Bàn Làm Việc Bài Dạy',
    badge: 'Studio',
    match: (pathname: string) => pathname === '/',
  },
  {
    href: '/so-do-lien-mon',
    label: 'Bản Đồ Liên Môn & Tri Thức',
    badge: '12.908',
    match: (pathname: string) => pathname.startsWith('/so-do-lien-mon'),
  },
  {
    href: '/ho-so-lop-hoc',
    label: 'Chương Trình & Đội Ngũ',
    badge: '3.153',
    match: (pathname: string) => pathname.startsWith('/ho-so-lop-hoc'),
  },
  {
    href: '/thu-vien',
    label: 'Kho Học Liệu & Mô Phỏng',
    badge: '757',
    match: (pathname: string) => pathname.startsWith('/thu-vien'),
  },
];

export function Shell({
  children,
  onOpenAssistant,
  title,
  subtitle,
  rightAction,
  rightActions,
}: ShellProps) {
  const pathname = usePathname() || '/';
  const [internalAssistantOpen, setInternalAssistantOpen] = useState(false);

  const [navOpen, setNavOpen] = useState(false);

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

  const handleOpenAssistant = () => {
    setNavOpen(false);
    if (onOpenAssistant) {
      onOpenAssistant();
    } else {
      setInternalAssistantOpen(true);
    }
  };

  const defaultTitle = pathname.startsWith('/so-do-lien-mon')
    ? 'Kho Tri thức & Sơ đồ Liên môn (Supabase)'
    : pathname.startsWith('/ho-so-lop-hoc')
      ? 'Cây Chương trình GDPT 2018 & Đội ngũ Chuyên môn (Supabase)'
      : pathname.startsWith('/thu-vien')
        ? 'Kho Tài nguyên Học thuật & Nhật ký Hoạt động (Supabase)'
        : 'Kho 82 Công cụ Sư phạm Việt Anh';

  const defaultSubtitle = pathname.startsWith('/so-do-lien-mon')
    ? 'Dữ liệu thực trực tiếp từ Supabase: 12.908 Đơn vị kiến thức, 8.968 Cạnh liên kết, 12.986 Câu hỏi & 7.612 Kịch bản Socratic.'
    : pathname.startsWith('/ho-so-lop-hoc')
      ? 'Cấu trúc 3.153 mục Cây chương trình (tree_scaffold), 13 Giáo viên & Quản trị (users) và Biên bản Thẩm định (reviews) trên Supabase.'
      : pathname.startsWith('/thu-vien')
        ? 'Quản lý 666 Tài nguyên HTML tương tác (tainguyen), 62 Học liệu (resources), 29 Gói bài giảng (packages) & 300 Nhật ký (activity).'
        : 'Biên soạn học liệu từ 12.908 Đơn vị kiến thức (Atoms), Câu hỏi đánh giá & Kịch bản Socratic 4 bậc trên Supabase.';

  return (
    <div className={`va-shell${navOpen ? ' nav-open' : ''}`}>
      <div className="va-mobilebar">
        <Link href="/" className="va-mobilebar-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-crest.webp" alt="" width={28} height={28} />
          <span>TRƯỜNG VIỆT ANH</span>
        </Link>
        <button
          type="button"
          className="va-menu-btn"
          aria-expanded={navOpen}
          aria-controls="va-sidebar"
          aria-label={navOpen ? 'Đóng menu' : 'Mở menu'}
          onClick={() => setNavOpen((v) => !v)}
        >
          <span className="va-menu-icon" aria-hidden="true" />
        </button>
      </div>
      {navOpen && (
        <div
          className="va-nav-scrim"
          aria-hidden="true"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside id="va-sidebar" className="va-sidebar">
        <div>
          <Link href="/" className="va-brand">
            <div className="va-brand-crest">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-crest.webp"
                alt="Trường Việt Anh"
                width={32}
                height={32}
              />
            </div>
            <div>
              <div className="va-brand-title">TRƯỜNG VIỆT ANH</div>
              <div className="va-brand-sub">SCHOOL AI FACTORY · SUPABASE</div>
              <div className="va-rule" />
            </div>
          </Link>

          <div className="va-nav-section-label">Không gian chuyên môn</div>
          <nav className="va-nav" aria-label="Điều hướng chính">
            {NAV_ITEMS.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`va-nav-item ${active ? 'active' : ''}`}
                >
                  <span className="va-nav-item-left">
                    <span className="va-nav-dot" />
                    <span>{item.label}</span>
                  </span>
                  <span className="va-nav-badge">{item.badge}</span>
                </Link>
              );
            })}
          </nav>

          <div className="va-nav-section-label" style={{ marginTop: '8px' }}>
            Hỗ trợ trực tuyến
          </div>
          <button
            type="button"
            className="va-assistant-trigger"
            onClick={handleOpenAssistant}
          >
            <span>Hỏi Trợ lý Chuyên môn</span>
            <span
              style={{
                background: 'var(--cta)',
                color: 'var(--navy)',
                fontSize: '11.5px',
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: '4px',
              }}
            >
              AI
            </span>
          </button>
        </div>

        <div className="va-sidebar-footer">
          <div className="va-teacher-card">
            <div className="va-avatar">AH</div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}
              >
                Anh Hùng
              </div>
              <div
                style={{ fontSize: '12px', color: 'rgba(255,255,255,0.68)' }}
              >
                Quản trị học thuật · Supabase
              </div>
            </div>
          </div>
          <div className="va-status-line">
            <span className="va-status-dot" />
            <span>Supabase Live · jhqdzrejpcvasbsnamer</span>
          </div>
        </div>
      </aside>

      <div className="va-main-wrap">
        <header className="va-topbar">
          <div>
            <div className="va-crumb">
              HỌC VIỆN QUỐC TẾ VIỆT ANH · DỮ LIỆU THỰC SUPABASE (SCHOOL AI FACTORY)
            </div>
            <h1 className="va-page-title">{title || defaultTitle}</h1>
            <p className="va-page-subtitle">{subtitle || defaultSubtitle}</p>
          </div>

          <div className="row-wrap">
            {rightActions || rightAction}
            <button
              type="button"
              className="btn"
              onClick={handleOpenAssistant}
            >
              Hỏi đáp chuyên môn
            </button>
          </div>
        </header>

        <main id="main" className="va-workspace" tabIndex={-1}>
          {children}
        </main>
      </div>

      {!onOpenAssistant && (
        <AssistantDrawer
          open={internalAssistantOpen}
          onClose={() => setInternalAssistantOpen(false)}
        />
      )}
    </div>
  );
}
