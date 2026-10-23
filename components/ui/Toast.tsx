'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

export type ToastTone = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}

interface ToastApi {
  show: (text: string, tone?: ToastTone) => void;
}

const Ctx = createContext<ToastApi>({ show: () => {} });

/** Hook gọi thông báo nổi. Ngoài ToastProvider thì không làm gì (không ném lỗi). */
export function useToast(): ToastApi {
  return useContext(Ctx);
}

const LIFETIME: Record<ToastTone, number> = { info: 4500, success: 4000, error: 8000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((l) => l.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (text: string, tone: ToastTone = 'info') => {
      const id = ++seq.current;
      setItems((l) => [...l.slice(-3), { id, tone, text }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), LIFETIME[tone]),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="ui-toasts" role="region" aria-label="Thông báo">
        {items.map((t) => (
          <div key={t.id} className={`ui-toast is-${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <Icon name={t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'check' : 'info'} size={20} />
            <span className="ui-toast-text">{t.text}</span>
            <button type="button" className="ui-toast-x" aria-label="Đóng thông báo" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={18} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
