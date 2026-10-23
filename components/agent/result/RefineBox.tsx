'use client';

// "Viết lại" cho một mục của bản soạn: lệnh nhanh + ô gõ lệnh tự do. Kết quả thay vào chỗ cũ ngay, có Hoàn tác.
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { INSTRUCTION_MAX, QUICK_COMMANDS, requestRefine, type RefineContext } from './refine';

interface Props {
  heading: string;
  body: string;
  format?: string;
  context?: RefineContext;
  disabled?: boolean;
  /** Nhận thân mục mới. */
  onApply: (body: string) => void;
  /** Khôi phục bản trước đó. */
  onUndo: () => void;
  canUndo: boolean;
}

export function RefineBox({ heading, body, format, context, disabled, onApply, onUndo, canUndo }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<null | { mathChanged: boolean }>(null);
  const abort = useRef<AbortController | null>(null);
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const applied = useRef<string | null>(null);

  // Thân mục bị đổi từ nơi khác (Hoàn tác ở thanh trên, sửa tay): thông báo cũ không còn đúng.
  useEffect(() => {
    if (applied.current !== null && body.replace(/\s+/g, '') !== applied.current.replace(/\s+/g, '')) {
      setDone(null);
      applied.current = null;
    }
  }, [body]);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const run = async (instruction: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setDone(null);
    const ctl = new AbortController();
    abort.current = ctl;
    const res = await requestRefine({ instruction, text: body, sectionHeading: heading, format, context }, fetch, ctl.signal);
    abort.current = null;
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    applied.current = res.text;
    onApply(res.text);
    setDone({ mathChanged: res.mathChanged });
    setText('');
    setOpen(false);
  };

  const label = heading ? `Viết lại mục “${heading}”` : 'Viết lại đoạn này';

  return (
    <div className="rf-box">
      <button
        type="button"
        className="rf-open"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled || busy}
        onClick={() => {
          setOpen((v) => !v);
          setError('');
        }}
      >
        <Icon name="sparkles" size={16} />
        Viết lại
      </button>

      {open && (
        <div className="rf-panel" role="group" aria-label={label}>
          <div className="rf-quick">
            {QUICK_COMMANDS.map((c) => (
              <button key={c.id} type="button" className="rf-chip" disabled={busy} onClick={() => void run(c.instruction)}>
                {c.label}
              </button>
            ))}
          </div>
          <form
            className="rf-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) void run(text);
            }}
          >
            <label htmlFor={inputId} className="rf-label">
              Hoặc nói điều cô/thầy muốn chỉnh
            </label>
            <div className="rf-row">
              <input
                id={inputId}
                ref={input}
                className="rf-input"
                value={text}
                maxLength={INSTRUCTION_MAX}
                disabled={busy}
                placeholder="Ví dụ: rút còn 10 phút, thêm câu hỏi gợi mở"
                onChange={(e) => setText(e.target.value)}
              />
              <button type="submit" className="rf-go" disabled={busy || !text.trim()}>
                {busy ? 'Đang viết lại...' : 'Viết lại'}
              </button>
            </div>
          </form>
          {busy && (
            <p className="rf-msg" role="status">
              Trợ lý đang viết lại mục này. Thường mất vài giây.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="rf-msg rf-bad" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="rf-msg rf-ok" role="status">
          Đã viết lại mục này.
          {done.mathChanged && ' Có công thức đã thay đổi, cô/thầy kiểm tra lại nhé.'}{' '}
          {canUndo && (
            <button type="button" className="rf-undo" onClick={() => (onUndo(), setDone(null))}>
              Hoàn tác
            </button>
          )}
        </p>
      )}
    </div>
  );
}
