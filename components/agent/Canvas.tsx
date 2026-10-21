'use client';

import { Icon } from '@/components/ui/icons';
import { formatLabel } from '@/lib/agent/flow';
import { ResultPanel } from './ResultPanel';
import { WORKFLOW_LABELS, type ResultEntry } from './types';

// Giữ nguyên đường dẫn nhập cũ: nhiều trang khác dùng classifyLine từ đây.
export { classifyLine } from './ResultPanel';

interface Props {
  entry: ResultEntry;
  busy: boolean;
  onClose: () => void;
  onText: (text: string) => void;
  onRegenerate: () => void;
  onAccept: () => Promise<void> | void;
}

export function Canvas({ entry, busy, onClose, onText, onRegenerate, onAccept }: Props) {
  const r = entry.result;
  return (
    <aside className="ag-canvas" aria-label="Bản soạn">
      <div className="ag-canvas-head">
        <div className="ag-canvas-title">
          <h2>{entry.title}</h2>
          <p>
            {formatLabel(entry.slots.format)} · {WORKFLOW_LABELS[r.workflow] ?? r.workflow}
          </p>
        </div>
        <button type="button" className="ag-iconbtn" onClick={onClose} aria-label="Đóng bản soạn">
          <Icon name="x" />
        </button>
      </div>
      <ResultPanel
        key={entry.id}
        title={entry.title}
        formatText={formatLabel(entry.slots.format)}
        result={r}
        text={entry.text}
        onText={onText}
        busy={busy}
        accepted={entry.accepted}
        diffRatio={entry.diffRatio}
        version={entry.version}
        versionFailed={entry.versionFailed}
        fromVersion={entry.fromVersion}
        lessonTitle={entry.slots.baiTitle}
        onRegenerate={onRegenerate}
        onAccept={onAccept}
      />
    </aside>
  );
}
