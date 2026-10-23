'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface DayPoint {
  day: string;
  runs: number;
  tokens: number;
  costUsd: number;
}

export type Metric = 'tokens' | 'costUsd' | 'runs';

const H = 240;
const PAD = { top: 16, right: 12, bottom: 34, left: 48 };

/** Làm tròn trần "đẹp" cho trục Y: 1, 2, 2.5, 5 x 10^n. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * p;
}

export function formatMetric(metric: Metric, v: number): string {
  if (metric === 'costUsd') return `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`;
  if (metric === 'tokens') {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 1e7 ? 0 : 1).replace('.', ',')} tr`;
    if (v >= 1000) return `${(v / 1000).toFixed(v >= 1e4 ? 0 : 1).replace('.', ',')}k`;
    return String(Math.round(v));
  }
  return String(Math.round(v));
}

const METRIC_LABEL: Record<Metric, string> = { tokens: 'Token', costUsd: 'Chi phí (USD, ước tính)', runs: 'Lượt soạn' };
export const metricLabel = (m: Metric) => METRIC_LABEL[m];

const shortDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Biểu đồ cột theo ngày, vẽ bằng SVG thuần; kích thước theo bề rộng thật để chữ không bị co nhỏ. */
export function UsageChart({ data, metric, today }: { data: DayPoint[]; metric: Metric; today: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => setWidth(Math.max(240, Math.floor(el.clientWidth)));
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { bars, ticks, max, step } = useMemo(() => {
    const values = data.map((d) => d[metric]);
    const max = niceMax(Math.max(0, ...values));
    const inner = width - PAD.left - PAD.right;
    const slot = inner / Math.max(1, data.length);
    const bw = Math.max(3, Math.min(34, slot * 0.68));
    const innerH = H - PAD.top - PAD.bottom;
    const bars = data.map((d, i) => {
      const h = max > 0 ? (d[metric] / max) * innerH : 0;
      return { d, x: PAD.left + slot * i + (slot - bw) / 2, w: bw, h, y: PAD.top + innerH - h, cx: PAD.left + slot * i + slot / 2 };
    });
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ v: max * t, y: PAD.top + innerH - innerH * t }));
    const step = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(inner / 52))));
    return { bars, ticks, max, step };
  }, [data, metric, width]);

  const total = data.reduce((s, d) => s + d[metric], 0);
  const sel = active !== null ? bars[active] : null;

  return (
    <div className="su-chart" ref={wrapRef}>
      <svg
        width={width}
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        role="img"
        aria-label={`Biểu đồ cột ${METRIC_LABEL[metric].toLowerCase()} theo ngày, từ ${shortDay(data[0]?.day ?? '0000-00-00')} đến ${shortDay(
          data[data.length - 1]?.day ?? '0000-00-00',
        )}, tổng ${formatMetric(metric, total)}. Số liệu chi tiết có trong bảng bên dưới.`}
        onMouseLeave={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t.y}>
            <line x1={PAD.left} x2={width - PAD.right} y1={t.y} y2={t.y} className="su-grid" />
            <text x={PAD.left - 8} y={t.y + 4} textAnchor="end" className="su-axis">
              {formatMetric(metric, t.v)}
            </text>
          </g>
        ))}
        {bars.map((b, i) => (
          <g key={b.d.day}>
            <rect
              x={b.x}
              y={b.h > 0 ? b.y : H - PAD.bottom - 1}
              width={b.w}
              height={Math.max(b.h, 1)}
              rx={Math.min(4, b.w / 3)}
              className={b.d.day === today ? 'su-bar su-bar-today' : 'su-bar'}
              opacity={active === null || active === i ? 1 : 0.55}
            />
            {/* vùng chạm rộng cho chuột / cảm ứng */}
            <rect
              x={b.cx - Math.max(b.w, 18) / 2}
              y={PAD.top}
              width={Math.max(b.w, 18)}
              height={H - PAD.top - PAD.bottom}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(i === active ? null : i)}
            />
            {i % step === 0 && (
              <text x={b.cx} y={H - 12} textAnchor="middle" className="su-axis">
                {shortDay(b.d.day)}
              </text>
            )}
          </g>
        ))}
        {sel && (
          <g pointerEvents="none">
            <rect
              x={Math.min(Math.max(sel.cx - 66, 4), width - 136)}
              y={Math.max(sel.y - 46, 2)}
              width={132}
              height={38}
              rx={8}
              className="su-tip"
            />
            <text x={Math.min(Math.max(sel.cx - 66, 4), width - 136) + 66} y={Math.max(sel.y - 46, 2) + 16} textAnchor="middle" className="su-tip-t1">
              {shortDay(sel.d.day)}/{sel.d.day.slice(0, 4)}
            </text>
            <text x={Math.min(Math.max(sel.cx - 66, 4), width - 136) + 66} y={Math.max(sel.y - 46, 2) + 31} textAnchor="middle" className="su-tip-t2">
              {formatMetric(metric, sel.d[metric])}
            </text>
          </g>
        )}
        {max === 1 && total === 0 && (
          <text x={width / 2} y={H / 2 - 8} textAnchor="middle" className="su-axis">
            Chưa có lượt dùng AI trong khoảng này
          </text>
        )}
      </svg>
    </div>
  );
}
