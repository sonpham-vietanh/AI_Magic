'use client';

import { Icon } from '@/components/ui/icons';

export type StepState = 'done' | 'doing' | 'todo' | 'bad';

export interface PhaAStep {
  n: number;
  title: string;
  state: StepState;
  detail: string;
  /** id phần nội dung để cuộn tới khi bấm. */
  target?: string;
}

const STATE_LABEL: Record<StepState, string> = {
  done: 'Xong',
  doing: 'Đang làm',
  todo: 'Chưa làm',
  bad: 'Chưa đạt',
};

export function PhaAStepper({ steps }: { steps: PhaAStep[] }) {
  const go = (id?: string) => {
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <ol className="kh-steps" aria-label="Quy trình dựng kho, 6 bước">
      {steps.map((s) => (
        <li key={s.n} className={`kh-step kh-step-${s.state}`}>
          <button type="button" className="kh-step-btn" onClick={() => go(s.target)} aria-label={`Bước ${s.n}: ${s.title}. ${STATE_LABEL[s.state]}. ${s.detail}`}>
            <span className="kh-step-num" aria-hidden="true">
              {s.state === 'done' ? <Icon name="check" size={16} /> : s.n}
            </span>
            <span className="kh-step-txt">
              <b>{s.title}</b>
              <small>{s.detail}</small>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

