'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '@/components/ui/icons';
import { COMPOSE_ITEMS, KIND_LABEL, PAGE_ITEMS, fold, lessonHref, rankItems, scoreItem, type QuickItem, type QuickKind } from './quickSearchLogic';
import { useDialog } from './useDialog';

export interface QuickHistory {
  id: string;
  title: string;
  when: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  history: QuickHistory[];
  onNavigate: (href: string) => void;
  onOpenHistory: (id: string) => void;
}

interface AtomHit {
  id: string;
  code?: string;
  title: string;
  subject?: string;
  grade?: number | string;
}

const KIND_ICON: Record<QuickKind, IconName> = {
  compose: 'sparkles',
  page: 'chevron',
  history: 'clock',
  lesson: 'book',
};

/** Hộp tìm nhanh toàn cục: tìm bài trong thư viện, mở lịch sử, đi tới trang, soạn nhanh. */
export function QuickSearch({ open, onClose, history, onNavigate, onOpenHistory }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [lessons, setLessons] = useState<AtomHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [lessonError, setLessonError] = useState(false);
  const dlgRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const titleId = useId();

  useDialog(dlgRef, open, () => {
    onClose();
    return true;
  });

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setLessons([]);
    setLessonError(false);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Tìm bài trong thư viện (máy chủ), chờ ngừng gõ 250ms.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setLessons([]);
      setLoading(false);
      setLessonError(false);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);
    setLessonError(false);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/supabase/knowledge?q=${encodeURIComponent(q)}&limit=6`, { signal: ctl.signal });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; atoms?: AtomHit[] };
        if (ctl.signal.aborted) return;
        if (!r.ok || !j.ok) throw new Error('lỗi');
        setLessons((j.atoms ?? []).slice(0, 6));
        setLoading(false);
      } catch {
        if (ctl.signal.aborted) return;
        setLessons([]);
        setLoading(false);
        setLessonError(true);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query, open]);

  const items = useMemo<QuickItem[]>(() => {
    const q = query.trim();
    const hist: QuickItem[] = history.map((h) => ({ id: `h-${h.id}`, kind: 'history', label: h.title, hint: h.when, ref: h.id }));
    const lessonItems: QuickItem[] = lessons.map((a) => ({
      id: `l-${a.id}`,
      kind: 'lesson',
      label: a.title,
      hint: [a.subject, a.grade ? `lớp ${a.grade}` : ''].filter(Boolean).join(', '),
      href: lessonHref(a.id, a.title),
    }));
    if (!q) {
      return [...COMPOSE_ITEMS.slice(0, 3), ...hist.slice(0, 3), ...PAGE_ITEMS.slice(0, 6)];
    }
    const free: QuickItem[] =
      q.length >= 2
        ? [{ id: 'free', kind: 'compose', label: `Soạn nhanh: “${q.slice(0, 80)}”`, hint: 'Mở trợ lý với nội dung này', href: `/?ask=1&q=${encodeURIComponent(q.slice(0, 300))}` }]
        : [];
    // Nhóm nào có mục khớp nhất thì đứng trước; bài trong thư viện (do máy chủ xếp hạng) luôn đứng đầu khi có.
    const groups = [rankItems(hist, q, 4), rankItems(COMPOSE_ITEMS, q, 3), rankItems(PAGE_ITEMS, q, 5)]
      .filter((g) => g.length > 0)
      .sort((a, b) => scoreItem(b[0], q) - scoreItem(a[0], q));
    return [...lessonItems, ...groups.flat(), ...free];
  }, [query, history, lessons]);

  useEffect(() => {
    setActive(0);
  }, [query, lessons.length]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (it: QuickItem | undefined) => {
    if (!it) return;
    onClose();
    if (it.kind === 'history' && it.ref) onOpenHistory(it.ref);
    else if (it.href) onNavigate(it.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[active]);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  const q = query.trim();
  let lastKind: QuickKind | null = null;
  const noLesson = q.length >= 2 && !loading && !lessonError && lessons.length === 0;

  return createPortal(
    <div className="qk-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dlgRef} className="qk-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId} className="ui-sr">
          Tìm nhanh
        </h2>
        <div className="qk-inputrow">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            className="qk-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items.length ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder="Gõ tên bài, trang hoặc việc cần làm, ví dụ “phân số”"
            aria-label="Tìm nhanh"
            value={query}
            maxLength={100}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="qk-kbd" aria-hidden="true">
            Esc
          </kbd>
        </div>

        <ul ref={listRef} id={listId} role="listbox" aria-label="Kết quả tìm nhanh" className="qk-list">
          {items.map((it, i) => {
            const head = it.kind !== lastKind;
            lastKind = it.kind;
            return (
              <li key={it.id} role="presentation" className="qk-li">
                {head && <div className="qk-group">{KIND_LABEL[it.kind]}</div>}
                <div
                  id={`${listId}-${i}`}
                  data-idx={i}
                  role="option"
                  aria-selected={i === active}
                  className={`qk-item${i === active ? ' is-active' : ''}`}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={() => choose(it)}
                >
                  <Icon name={KIND_ICON[it.kind]} size={18} />
                  <span className="qk-label">{it.label}</span>
                  {it.hint && <span className="qk-hint">{it.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="qk-status" role="status" aria-live="polite">
          {loading && 'Đang tìm bài trong thư viện…'}
          {lessonError && 'Chưa tìm được bài trong thư viện (mạng chậm). Các mục khác vẫn dùng được.'}
          {noLesson && fold(q) === q && 'Chưa thấy bài khớp. Cô/thầy thử gõ có dấu, ví dụ “phân số”.'}
          {noLesson && fold(q) !== q && 'Chưa thấy bài nào khớp trong thư viện.'}
        </div>
        <div className="qk-foot" aria-hidden="true">
          <span>
            <kbd className="qk-kbd">↑</kbd> <kbd className="qk-kbd">↓</kbd> chọn
          </span>
          <span>
            <kbd className="qk-kbd">Enter</kbd> mở
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
