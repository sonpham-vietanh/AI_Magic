import type { SvgScene } from '@/lib/export/diagrams';
import { SVG_FONT } from '@/lib/export/diagrams';

/** Vẽ một cảnh SVG bằng phần tử React (không innerHTML). Co theo viewBox. */
export function SceneSvg({ scene, className, minWidth }: { scene: SvgScene; className?: string; minWidth?: number }) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      width="100%"
      style={{ minWidth, height: 'auto', display: 'block', fontFamily: SVG_FONT }}
      role="img"
      aria-label={scene.title}
    >
      <title>{scene.title}</title>
      {scene.nodes.map((n, i) => {
        if (n.t === 'rect') {
          return <rect key={i} x={n.x} y={n.y} width={n.w} height={n.h} rx={n.rx} fill={n.fill} stroke={n.stroke} strokeWidth={n.stroke ? (n.sw ?? 1) : undefined} />;
        }
        if (n.t === 'circle') {
          return <circle key={i} cx={n.cx} cy={n.cy} r={n.r} fill={n.fill} stroke={n.stroke} strokeWidth={n.stroke ? (n.sw ?? 1) : undefined} />;
        }
        if (n.t === 'path') {
          return <path key={i} d={n.d} fill="none" stroke={n.stroke} strokeWidth={n.sw} strokeLinecap="round" />;
        }
        return (
          <text key={i} fontSize={n.size} fontWeight={n.weight} fill={n.fill} textAnchor={n.anchor === 'middle' ? 'middle' : undefined}>
            {n.lines.map((ln, j) => (
              <tspan key={j} x={n.x} y={Math.round((n.y + j * n.lh) * 10) / 10}>
                {ln}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}
