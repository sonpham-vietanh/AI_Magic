'use client';

import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '@/components/studio/useDialog';
import { Icon } from './icons';
import { readActor } from '@/lib/agent/actor';

export interface FeedbackContext {
  workflow?: string;
  format?: string;
  lessonTitle?: string;
  runId?: string;
}

interface Props {
  context?: FeedbackContext;
  /** Đoạn văn bản bản soạn bị lỗi (tự cắt còn 1500 ký tự). */
  excerpt?: string;
  label?: string;
  /** Thêm lớp CSS cho nút mở (mặc định là nút phụ nhỏ). */
  className?: string;
}

const KINDS = [
  { id: 'sai_kien_thuc', label: 'Sai kiến thức hoặc số liệu' },
  { id: 'sai_cong_thuc', label: 'Công thức hiển thị sai' },
  { id: 'khong_phu_hop', label: 'Không phù hợp lớp hoặc chương trình' },
  { id: 'thieu_noi_dung', label: 'Thiếu nội dung cần có' },
  { id: 'khac', label: 'Lỗi khác' },
];

/**
 * Nút "Báo lỗi bản soạn": mở hộp thoại nhỏ để giáo viên báo AI soạn sai. Dùng ở bất kỳ đâu có bản soạn:
 *   <FeedbackButton context={{ workflow, format, lessonTitle, runId }} excerpt={text.slice(0, 1500)} />
 */
export function FeedbackButton({ context, excerpt, label = 'Báo lỗi bản soạn', className }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(KINDS[0].id);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const dlgRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = () => {
    setOpen(false);
    if (done) {
      setDone(false);
      setMessage('');
    }
    setError('');
  };
  useDialog(dlgRef, open, () => {
    if (!busy) close();
    return true;
  });

  const send = async () => {
    const text = message.trim();
    if (text.length < 3) {
      setError('Cô/thầy mô tả giúp lỗi bằng vài chữ để nhóm phát triển sửa đúng chỗ.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          message: text,
          excerpt: excerpt ? excerpt.slice(0, 1500) : undefined,
          teacherName: readActor() || undefined,
          context: {
            ...context,
            page: typeof window !== 'undefined' ? window.location.pathname : undefined,
          },
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) {
        setError(j.error || 'Chưa gửi được phản hồi. Cô/thầy thử lại sau ít giây.');
        return;
      }
      setDone(true);
    } catch {
      setError('Không kết nối được máy chủ. Cô/thầy kiểm tra mạng rồi gửi lại.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className ?? 'ag-btn small fb-open'} onClick={() => setOpen(true)}>
        <Icon name="alert" size={16} />
        {label}
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fb-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && close()}>
            <div ref={dlgRef} className="fb-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
              <h2 id={titleId} className="fb-title">
                Báo lỗi bản soạn
              </h2>
              {done ? (
                <>
                  <p className="fb-ok" role="status">
                    Đã gửi. Cảm ơn cô/thầy, nhóm phát triển sẽ xem và cải thiện cho những lần soạn sau.
                  </p>
                  <div className="fb-actions">
                    <button type="button" className="ag-btn primary" onClick={close}>
                      Đóng
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="fb-hint">
                    Cô/thầy chỉ cho mình chỗ AI soạn chưa đúng. Phản hồi này giúp bản soạn sau chính xác hơn.
                  </p>
                  <label className="fb-label" htmlFor={`${titleId}-k`}>
                    Loại lỗi
                  </label>
                  <select id={`${titleId}-k`} className="fb-field" value={kind} onChange={(e) => setKind(e.target.value)}>
                    {KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <label className="fb-label" htmlFor={`${titleId}-m`}>
                    Cô/thầy thấy sai ở đâu?
                  </label>
                  <textarea
                    id={`${titleId}-m`}
                    className="fb-field fb-text"
                    rows={4}
                    maxLength={1000}
                    value={message}
                    placeholder="Ví dụ: Ở phần Khởi động, ví dụ về phân số tính sai kết quả."
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  {error && (
                    <p className="fb-err" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="fb-actions">
                    <button type="button" className="ag-btn" onClick={close} disabled={busy}>
                      Để sau
                    </button>
                    <button type="button" className="ag-btn primary" onClick={() => void send()} disabled={busy}>
                      {busy ? 'Đang gửi…' : 'Gửi phản hồi'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
