import type { CSSProperties } from 'react';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  /** Số dòng chữ giả (dòng cuối ngắn hơn). */
  lines?: number;
  circle?: boolean;
  className?: string;
}

/** Khung chờ tải. Chỉ trang trí (aria-hidden); nơi dùng nên có vùng aria-busy hoặc chữ "Đang tải". */
export function Skeleton({ width, height = 14, lines, circle, className }: SkeletonProps) {
  if (lines && lines > 1) {
    return (
      <div className={`ui-skel-stack${className ? ` ${className}` : ''}`} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className="ui-skel" style={{ height, width: i === lines - 1 ? '62%' : '100%' }} />
        ))}
      </div>
    );
  }
  const style: CSSProperties = { width: width ?? (circle ? height : '100%'), height };
  return <span className={`ui-skel${circle ? ' is-circle' : ''}${className ? ` ${className}` : ''}`} style={style} aria-hidden="true" />;
}
