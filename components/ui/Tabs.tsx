'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { firstEnabled, nextIndex } from './uiLogic';

export interface TabItem {
  id: string;
  label: ReactNode;
  panel: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  /** Chế độ có kiểm soát. */
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  label: string;
  className?: string;
}

/** Tabs đúng mẫu ARIA: tablist/tab/tabpanel, mũi tên, Home/End, roving tabindex, kích hoạt tự động. */
export function Tabs({ items, value, defaultValue, onChange, label, className }: TabsProps) {
  const base = useId();
  const [inner, setInner] = useState(() => firstEnabled(items, defaultValue));
  const current = firstEnabled(items, value ?? inner);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (id: string, focus = false) => {
    if (value === undefined) setInner(id);
    onChange?.(id);
    if (focus) refs.current[id]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const enabled = items.filter((i) => !i.disabled);
    const idx = enabled.findIndex((i) => i.id === current);
    const n = nextIndex(idx, e.key, enabled.length, 'horizontal');
    if (n === null) return;
    e.preventDefault();
    select(enabled[n].id, true);
  };

  return (
    <div className={`ui-tabs${className ? ` ${className}` : ''}`}>
      <div className="ui-tablist" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {items.map((t) => {
          const selected = t.id === current;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={t.disabled}
              className="ui-tab"
              onClick={() => select(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {items.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={t.id !== current}
          tabIndex={0}
          className="ui-tabpanel"
        >
          {t.id === current ? t.panel : null}
        </div>
      ))}
    </div>
  );
}
