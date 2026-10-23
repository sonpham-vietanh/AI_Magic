import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: IconName;
  /** Nút hoặc liên kết hành động tiếp theo. */
  action?: ReactNode;
  /** 'error' dùng role=alert cho thông báo lỗi. */
  tone?: 'neutral' | 'error';
  className?: string;
}

/** Trạng thái trống/lỗi: minh hoạ SVG tự vẽ, tiêu đề, gợi ý bước tiếp theo. */
export function EmptyState({ title, description, icon = 'folder', action, tone = 'neutral', className }: EmptyStateProps) {
  return (
    <div
      className={`ui-empty${tone === 'error' ? ' is-error' : ''}${className ? ` ${className}` : ''}`}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <div className="ui-empty-art" aria-hidden="true">
        <svg viewBox="0 0 120 120" width="96" height="96" focusable="false">
          <circle cx="60" cy="60" r="52" className="ui-empty-bg" />
          <circle cx="94" cy="26" r="6" className="ui-empty-dot" />
          <circle cx="24" cy="92" r="4" className="ui-empty-dot2" />
        </svg>
        <span className="ui-empty-ico">
          <Icon name={tone === 'error' ? 'alert' : icon} size={34} />
        </span>
      </div>
      <h3 className="ui-empty-title">{title}</h3>
      {description && <p className="ui-empty-desc">{description}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}
