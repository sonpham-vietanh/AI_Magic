'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/icons';
import '@/app/ui-cc.css';

/**
 * Hộp thoại dùng chung của trang Kho công cụ: Esc để đóng, giữ phím Tab trong hộp,
 * trả tiêu điểm về nút đã mở khi đóng.
 */
export function Modal({
  title,
  eyebrow,
  onClose,
  onEscape,
  lockBackdrop,
  closeLabel = 'Đóng',
  actions,
  footer,
  size = 'lg',
  children,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  /** Mặc định giống onClose. */
  onEscape?: () => void;
  /** Bấm nền mờ không đóng hộp (ví dụ lúc đang soạn). */
  lockBackdrop?: boolean;
  closeLabel?: string;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const escRef = useRef(onEscape ?? onClose);
  escRef.current = onEscape ?? onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        escRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialogRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  return createPortal(
    <div
      className="cc-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !lockBackdrop) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`cc-dialog cc-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="cc-dialog-head">
          <div className="cc-dialog-title">
            {eyebrow && <span className="cc-eyebrow">{eyebrow}</span>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <div className="cc-dialog-actions">
            {actions}
            <button type="button" className="ag-iconbtn" aria-label={closeLabel} onClick={onClose}>
              <Icon name="x" size={22} />
            </button>
          </div>
        </header>
        <div className="cc-dialog-body">{children}</div>
        {footer && <footer className="cc-dialog-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
