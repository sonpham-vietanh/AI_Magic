'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/icons';
import { formatLabel } from '@/lib/agent/flow';
import { DocBody, ResultPanel } from './ResultPanel';
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
  /** Hoàn tác lần chỉnh bằng lời gần nhất. */
  onUndo?: () => void;
}

export function Canvas({ entry, busy, onClose, onText, onRegenerate, onAccept, onUndo }: Props) {
  const r = entry.result;
  const canUndo = Boolean(onUndo && entry.undo && entry.undo.length > 0);
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
      {canUndo && (
        <div className="ag-lv-undo" role="status">
          <span>
            Vừa chỉnh: <strong>{entry.lastRefine}</strong>
          </span>
          <button type="button" className="ag-btn small" onClick={onUndo}>
            <Icon name="refresh" size={16} />
            Hoàn tác
          </button>
        </div>
      )}
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

/** Khung bản soạn trong lúc AI đang soạn: chữ chảy dần vào, không để khung trống chờ. */
export function LiveCanvas({
  title,
  subtitle,
  text,
  stageMessage,
  seconds,
  onCancel,
}: {
  title: string;
  subtitle: string;
  text: string;
  stageMessage?: string;
  seconds: number;
  onCancel: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <aside className="ag-canvas ag-lv" aria-label="Bản soạn đang được viết">
      <div className="ag-canvas-head">
        <div className="ag-canvas-title">
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className="ag-lv-badge" role="status">
          <span className="ag-spin" aria-hidden="true" />
          Đang soạn · {seconds} giây
        </span>
      </div>
      <div className="ag-canvas-body ag-lv-body" ref={bodyRef}>
        <p className="ag-lv-note">
          {stageMessage || 'Mình đang viết'}. Đây là bản đang chảy dần về, cô/thầy có thể đọc trước; khi xong mình sẽ kiểm tra cấu trúc và mở đủ các nút chỉnh, tải về.
        </p>
        <div className="ag-lv-text" aria-live="off">
          <DocBody text={text} />
          <span className="ag-lv-caret" aria-hidden="true" />
        </div>
      </div>
      <div className="ag-canvas-foot">
        <button type="button" className="ag-btn small" onClick={onCancel}>
          <Icon name="stop" size={16} />
          Dừng lại
        </button>
      </div>
    </aside>
  );
}
