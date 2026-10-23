'use client';

import { useId, useRef, type ReactNode } from 'react';
import { useDialog } from '@/components/studio/useDialog';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Hành động không thể hoàn tác: nút xác nhận màu cảnh báo. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Hộp thoại xác nhận: bẫy focus, Esc để hủy, trả focus khi đóng (qua useDialog). */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Đồng ý',
  cancelLabel = 'Để sau',
  danger,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const tid = useId();
  const did = useId();
  useDialog(ref, open, () => {
    if (!busy) onCancel();
  });
  if (!open) return null;
  return (
    <div className="ui-dialog-wrap">
      <div className="ui-dialog-scrim" aria-hidden="true" onClick={() => !busy && onCancel()} />
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={tid}
        aria-describedby={description ? did : undefined}
        tabIndex={-1}
        className="ui-dialog"
      >
        <h2 id={tid} className="ui-dialog-title">
          {title}
        </h2>
        {description && (
          <div id={did} className="ui-dialog-desc">
            {description}
          </div>
        )}
        <div className="ui-dialog-actions">
          <button type="button" className="ag-btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={`ag-btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Đang xử lý…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
