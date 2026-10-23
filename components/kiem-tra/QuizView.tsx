'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { MathText } from '@/components/MathText';
import { useWordExport } from './useWordExport';
import { initPresent, presentKey, presentReduce } from '@/lib/assessment/present';
import { quizPlainSections, quizPrintHtml, type QuizItem } from '@/lib/assessment/examDoc';
import { printHtml } from './printFrame';

function TextBlock({ text }: { text: string }) {
  return (
    <>
      {text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .filter((l) => l.trim())
        .map((l, i) => (
          <p key={i} className="kt-line">
            <MathText text={l.trim()} />
          </p>
        ))}
    </>
  );
}

function Options({ options }: { options: string[] }) {
  if (!options.length) return null;
  return (
    <ul className="kt-opts">
      {options.map((o, k) => (
        <li key={k}>
          <b>{String.fromCharCode(65 + k)}.</b> <MathText text={o} />
        </li>
      ))}
    </ul>
  );
}

function Present({ items, onClose }: { items: QuizItem[]; onClose: () => void }) {
  const [st, setSt] = useState(() => initPresent(items.length));
  const ref = useRef<HTMLDivElement>(null);
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const a = presentKey(e.key);
      if (!a) return;
      e.preventDefault();
      if (a === 'exit') onClose();
      else setSt((s) => presentReduce(s, a));
    },
    [onClose],
  );
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);
  const q = items[st.index];
  if (!q) return null;
  return (
    <div className="kt-present" role="dialog" aria-modal="true" aria-label="Chế độ chiếu lớp" ref={ref} tabIndex={-1}>
      <div className="kt-present-bar">
        <span>Câu {st.index + 1} / {st.total}</span>
        <span className="kt-present-hint">Phím: mũi tên trái/phải đổi câu, Cách hoặc Enter xem đáp án, Esc thoát</span>
        <button type="button" className="ag-btn small" onClick={onClose}>Thoát chiếu</button>
      </div>
      <div className="kt-present-body">
        <div className="kt-present-q">
          <TextBlock text={q.noiDung} />
          <Options options={q.options} />
        </div>
        {st.revealed ? (
          <div className="kt-present-a" aria-live="polite">
            <b>Đáp án</b>
            <TextBlock text={q.dapAn || '(chưa có đáp án)'} />
            {q.loiGiai && <TextBlock text={q.loiGiai} />}
          </div>
        ) : null}
      </div>
      <div className="kt-present-nav">
        <button type="button" className="ag-btn" onClick={() => setSt((s) => presentReduce(s, 'prev'))} disabled={st.index === 0}>Câu trước</button>
        <button type="button" className="ag-btn primary" onClick={() => setSt((s) => presentReduce(s, 'toggle'))}>{st.revealed ? 'Ẩn đáp án' : 'Xem đáp án'}</button>
        <button type="button" className="ag-btn" onClick={() => setSt((s) => presentReduce(s, 'next'))} disabled={st.index >= st.total - 1}>Câu sau</button>
      </div>
    </div>
  );
}

export function QuizView({ items, notes, title }: { items: QuizItem[]; notes: string[]; title: string }) {
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const word = useWordExport();
  const docx = () =>
    word.run(async () => {
      const { buildDocxBlob } = await import('@/lib/export/docx');
      const blob = await buildDocxBlob({ title: title.toUpperCase(), subtitle: [], sections: quizPlainSections(items) });
      return { blob, filename: `${title.replace(/[^\w\-]+/g, '-').slice(0, 40) || 'quiz'}.docx` };
    });
  return (
    <div className="kt-set">
      <div className="kt-set-tools">
        <button type="button" className="ag-btn small primary" onClick={() => setPresent(true)} disabled={!items.length}>
          <Icon name="slides" size={16} /> Chiếu lớp
        </button>
        <button type="button" className="ag-btn small" onClick={() => setOpen((v) => !v)} aria-pressed={open}>
          {open ? 'Ẩn tất cả đáp án' : 'Hiện tất cả đáp án'}
        </button>
        <button type="button" className="ag-btn small" onClick={() => void docx()} disabled={!items.length || word.busy}>
          {word.busy ? <span className="ag-spin" aria-hidden="true" /> : <Icon name="download" size={16} />} Tải .docx
        </button>
        <button type="button" className="ag-btn small" onClick={() => printHtml(quizPrintHtml(items, title, false))} disabled={!items.length}>
          <Icon name="print" size={16} /> In câu hỏi
        </button>
        <button type="button" className="ag-btn small" onClick={() => printHtml(quizPrintHtml(items, title, true))} disabled={!items.length}>
          <Icon name="print" size={16} /> In kèm đáp án
        </button>
      </div>
      {notes.length > 0 && (
        <div className="ag-alert info" role="note">
          <Icon name="info" size={18} />
          <div>{notes.map((n, i) => <div key={i}>{n}</div>)}</div>
        </div>
      )}
      {items.length === 0 && <p className="ag-note">Chưa có câu hỏi phù hợp.</p>}
      <ol className="kt-qs">
        {items.map((q) => (
          <li key={q.id} className="ag-card kt-q">
            <div className="kt-q-head">
              <span className="kt-q-no">Câu {q.n}</span>
              <span className="kt-tag">{q.bloom}</span>
            </div>
            <div className="kt-q-text">
              <TextBlock text={q.noiDung} />
              <Options options={q.options} />
            </div>
            <details className="kt-ans" open={open}>
              <summary>Xem đáp án</summary>
              <TextBlock text={q.dapAn || '(chưa có đáp án)'} />
              {q.loiGiai && <TextBlock text={`Giải thích: ${q.loiGiai}`} />}
            </details>
          </li>
        ))}
      </ol>
      {present && <Present items={items} onClose={() => setPresent(false)} />}
    </div>
  );
}
