'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseAtom, SupabaseEdge } from '@/lib/supabase';
import { edgePriority, layoutRadial } from './layout';
import { LINK_LABEL, linkKind, subjectCode, subjectTone, wrapLabel } from './meta';

export interface GraphLink {
  edge: SupabaseEdge;
  atom: SupabaseAtom;
}

interface Props {
  center: SupabaseAtom;
  links: GraphLink[];
  selectedId: string;
  onSelect: (atomId: string) => void;
  onRecenter: (atomId: string) => void;
}

const MIN_W = 720;

export function RelationGraph({ center, links, selectedId, onSelect, onRecenter }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(MIN_W);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setMeasured(Math.max(280, Math.floor(el.clientWidth)));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layoutW = Math.max(measured, MIN_W);
  const layoutH = Math.round(Math.min(620, Math.max(500, layoutW * 0.7)));

  const layout = useMemo(
    () =>
      layoutRadial(
        center.id,
        links.map((l) => ({ id: l.atom.id, priority: edgePriority(l.edge) })),
        { width: layoutW, height: layoutH },
      ),
    [center.id, links, layoutW, layoutH],
  );

  const byId = useMemo(() => new Map(links.map((l) => [l.atom.id, l])), [links]);
  const cx = layout.center.x;
  const cy = layout.center.y;
  const summary = `Bài trung tâm: ${center.title}. ${layout.nodes.length} bài liên kết${
    layout.hidden ? `, còn ${layout.hidden} bài khác xem ở dạng danh sách` : ''
  }.`;

  return (
    <div ref={wrapRef} className="sd-graph">
      <svg
        viewBox={`0 0 ${layoutW} ${layoutH}`}
        width="100%"
        style={{ height: 'auto', aspectRatio: `${layoutW} / ${layoutH}` }}
        role="group"
        aria-label="Đồ thị liên kết bài học"
      >
        <desc>{summary}</desc>

        {layout.nodes.map((n) => {
          const link = byId.get(n.id);
          if (!link) return null;
          const kind = linkKind(link.edge);
          const on = n.id === selectedId;
          return (
            <g key={`e-${n.id}`}>
              <line
                x1={cx}
                y1={cy}
                x2={n.x}
                y2={n.y}
                className={`sd-line k-${kind}${on ? ' on' : ''}`}
              />
              <line
                x1={cx}
                y1={cy}
                x2={n.x}
                y2={n.y}
                className="sd-hit"
                onClick={() => onSelect(n.id)}
              />
            </g>
          );
        })}

        <g>
          <rect
            className="sd-center-box"
            x={cx - layout.center.w / 2}
            y={cy - layout.center.h / 2}
            width={layout.center.w}
            height={layout.center.h}
            rx={14}
          />
          {wrapLabel(center.title, Math.floor((layout.center.w - 28) / 8.4), 2).map((t, i, arr) => (
            <text
              key={i}
              x={cx}
              y={cy + (i - (arr.length - 1) / 2) * 18 + 5}
              textAnchor="middle"
              className="sd-center-text"
            >
              {t}
            </text>
          ))}
          <title>{`Bài trung tâm: ${center.title}`}</title>
        </g>

        {layout.nodes.map((n) => {
          const link = byId.get(n.id);
          if (!link) return null;
          const { atom, edge } = link;
          const kind = linkKind(edge);
          const on = n.id === selectedId;
          const maxChars = Math.floor((n.w - 28) / 6.3);
          const lines = wrapLabel(atom.title, maxChars, 2);
          const left = n.x - n.w / 2;
          const top = n.y - n.h / 2;
          const label = `${atom.title}. ${atom.subject}, khối ${atom.grade}. ${LINK_LABEL[kind]}${
            edge.cross_subject ? ` với ${edge.cross_subject}` : ''
          }.`;
          return (
            <g
              key={n.id}
              className={`sd-node sd-t${subjectTone(atom.subject)}${on ? ' on' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={label}
              onClick={() => onSelect(n.id)}
              onDoubleClick={() => onRecenter(n.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(n.id);
                }
              }}
            >
              <rect className="sd-ring" x={left - 4} y={top - 4} width={n.w + 8} height={n.h + 8} rx={14} />
              <rect className="sd-box" x={left} y={top} width={n.w} height={n.h} rx={10} />
              {lines.map((t, i) => (
                <text
                  key={i}
                  x={n.x}
                  y={n.y + (i - (lines.length - 1) / 2) * 17 + 5}
                  textAnchor="middle"
                  className="sd-text"
                >
                  {t}
                </text>
              ))}
              <circle className="sd-badge" cx={left} cy={top} r={14} />
              <text className="sd-badge-text" x={left} y={top + 4.5} textAnchor="middle">
                {subjectCode(atom.subject)}
              </text>
              <title>{label}</title>
            </g>
          );
        })}
      </svg>

      <ul className="sd-legend" aria-label="Chú thích">
        <li>
          <svg width="40" height="10" aria-hidden="true">
            <line x1="0" y1="5" x2="40" y2="5" className="sd-line k-hard" />
          </svg>
          Tiên quyết bắt buộc
        </li>
        <li>
          <svg width="40" height="10" aria-hidden="true">
            <line x1="0" y1="5" x2="40" y2="5" className="sd-line k-soft" />
          </svg>
          Tiên quyết bổ trợ
        </li>
        <li>
          <svg width="40" height="10" aria-hidden="true">
            <line x1="0" y1="5" x2="40" y2="5" className="sd-line k-cross" />
          </svg>
          Liên môn
        </li>
        <li>
          <svg width="40" height="10" aria-hidden="true">
            <line x1="0" y1="5" x2="40" y2="5" className="sd-line k-other" />
          </svg>
          Liên kết mở rộng
        </li>
      </ul>
      <p className="ag-note">
        Bấm một bài để xem chi tiết, bấm đúp để đặt làm bài trung tâm. Chữ trong vòng tròn là mã môn.{layout.hidden > 0 ? ` Còn ${layout.hidden} bài khác, xem ở chế độ Danh sách.` : ''}
      </p>
    </div>
  );
}
