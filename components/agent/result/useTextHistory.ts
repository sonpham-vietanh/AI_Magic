'use client';

// Ngăn xếp hoàn tác / làm lại cho chỉnh sửa bản soạn (sửa tay và "Viết lại").
// Các lần gõ liên tiếp trong khoảng ngắn gộp thành một bước để hoàn tác không quá vụn.
import { useCallback, useRef, useState } from 'react';

const LIMIT = 60;
const COALESCE_MS = 900;

export function useTextHistory(text: string, onText: (t: string) => void) {
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const lastTyped = useRef(0);
  const [, bump] = useState(0);
  const textRef = useRef(text);
  textRef.current = text;

  const commit = useCallback(
    (next: string, kind: 'type' | 'replace' = 'replace') => {
      const cur = textRef.current;
      if (next === cur) return;
      const now = Date.now();
      const coalesce = kind === 'type' && now - lastTyped.current < COALESCE_MS && past.current.length > 0;
      if (!coalesce) {
        past.current.push(cur);
        if (past.current.length > LIMIT) past.current.shift();
      }
      lastTyped.current = kind === 'type' ? now : 0;
      future.current = [];
      onText(next);
      bump((n) => n + 1);
    },
    [onText],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (prev === undefined) return;
    future.current.push(textRef.current);
    lastTyped.current = 0;
    onText(prev);
    bump((n) => n + 1);
  }, [onText]);

  const redo = useCallback(() => {
    const nxt = future.current.pop();
    if (nxt === undefined) return;
    past.current.push(textRef.current);
    lastTyped.current = 0;
    onText(nxt);
    bump((n) => n + 1);
  }, [onText]);

  return { commit, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
