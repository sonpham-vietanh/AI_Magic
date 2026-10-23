import type { KeyboardEvent } from 'react';

/**
 * Bộ tab đúng mẫu ARIA cho các thanh tab viết tay: gắn vào phần tử role="tablist" bằng
 *   <div role="tablist" ref={rovingRef} onKeyDown={rovingKeyDown}>
 * - roving tabindex: chỉ tab đang chọn nằm trong thứ tự Tab (tabindex 0), các tab khác -1.
 * - mũi tên trái/phải đi vòng, Home/End về đầu/cuối, tự kích hoạt tab nhận focus.
 * Không cần hook nên đặt được ở bất kỳ đâu trong JSX, kể cả sau return sớm.
 */
const SELECTOR = '[role="tab"]';

function tabs(list: Element): HTMLElement[] {
  return Array.from(list.querySelectorAll<HTMLElement>(SELECTOR)).filter(
    (t) => t.closest('[role="tablist"]') === list && !t.hasAttribute('disabled') && t.getAttribute('aria-disabled') !== 'true',
  );
}

function sync(list: Element) {
  const all = tabs(list);
  const current = all.find((t) => t.getAttribute('aria-selected') === 'true') ?? all[0];
  for (const t of all) t.setAttribute('tabindex', t === current ? '0' : '-1');
}

export function rovingRef(el: HTMLElement | null): void | (() => void) {
  if (!el) return;
  sync(el);
  const mo = new MutationObserver(() => sync(el));
  mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected', 'disabled'] });
  return () => mo.disconnect();
}

export function rovingKeyDown(e: KeyboardEvent<HTMLElement>): void {
  const key = e.key;
  if (key !== 'ArrowRight' && key !== 'ArrowLeft' && key !== 'Home' && key !== 'End') return;
  const list = e.currentTarget;
  const all = tabs(list);
  if (all.length === 0) return;
  const active = document.activeElement as HTMLElement | null;
  const idx = Math.max(0, all.findIndex((t) => t === active));
  let next = idx;
  if (key === 'ArrowRight') next = (idx + 1) % all.length;
  else if (key === 'ArrowLeft') next = (idx - 1 + all.length) % all.length;
  else if (key === 'Home') next = 0;
  else next = all.length - 1;
  e.preventDefault();
  all[next].focus();
  all[next].click();
}
