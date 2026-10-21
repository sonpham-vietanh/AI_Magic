/** Chế độ chiếu lớp cho quiz: trạng thái và phím tắt (hàm thuần, dễ kiểm thử). */
export interface PresentState {
  index: number;
  revealed: boolean;
  total: number;
}

export type PresentAction = 'next' | 'prev' | 'first' | 'last' | 'toggle' | 'reveal' | 'hide';

export const initPresent = (total: number): PresentState => ({ index: 0, revealed: false, total });

export function presentReduce(s: PresentState, a: PresentAction): PresentState {
  const max = Math.max(0, s.total - 1);
  const go = (i: number): PresentState => ({ ...s, index: Math.min(max, Math.max(0, i)), revealed: false });
  switch (a) {
    case 'next':
      return s.index >= max ? s : go(s.index + 1);
    case 'prev':
      return s.index <= 0 ? s : go(s.index - 1);
    case 'first':
      return go(0);
    case 'last':
      return go(max);
    case 'toggle':
      return { ...s, revealed: !s.revealed };
    case 'reveal':
      return { ...s, revealed: true };
    case 'hide':
      return { ...s, revealed: false };
  }
}

/** Phím -> hành động; 'exit' để thoát chế độ chiếu. */
export function presentKey(key: string): PresentAction | 'exit' | null {
  switch (key) {
    case 'ArrowRight':
    case 'PageDown':
    case 'n':
      return 'next';
    case 'ArrowLeft':
    case 'PageUp':
    case 'p':
      return 'prev';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    case ' ':
    case 'Enter':
    case 'a':
      return 'toggle';
    case 'Escape':
      return 'exit';
    default:
      return null;
  }
}
