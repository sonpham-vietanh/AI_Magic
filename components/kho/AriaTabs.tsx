'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabDef<T extends string> {
  id: T;
  label: ReactNode;
  /** Dòng phụ nhỏ dưới nhãn (tuỳ chọn). */
  sub?: ReactNode;
}

/** id của tab và tabpanel để nối aria-controls / aria-labelledby. */
export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

/** Thuộc tính cho vùng nội dung của tab đang chọn. */
export function panelProps(prefix: string, id: string) {
  return { role: 'tabpanel' as const, id: panelId(prefix, id), 'aria-labelledby': tabId(prefix, id), tabIndex: 0 };
}

interface Props<T extends string> {
  tabs: TabDef<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  prefix: string;
  className?: string;
  tabClassName?: string;
}

/** Bộ tab theo mẫu ARIA: roving tabindex, mũi tên trái/phải, Home/End, kích hoạt ngay khi di chuyển. */
export function AriaTabs<T extends string>({ tabs, value, onChange, label, prefix, className = '', tabClassName = '' }: Props<T>) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === value);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const t = tabs[next];
    onChange(t.id);
    refs.current[t.id]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={`kh-tablist ${className}`.trim()} onKeyDown={onKey}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={tabId(prefix, t.id)}
            aria-selected={on}
            aria-controls={panelId(prefix, t.id)}
            tabIndex={on ? 0 : -1}
            className={`kh-tabbtn ${tabClassName}`.trim()}
            onClick={() => onChange(t.id)}
          >
            <span>{t.label}</span>
            {t.sub ? <small>{t.sub}</small> : null}
          </button>
        );
      })}
    </div>
  );
}
