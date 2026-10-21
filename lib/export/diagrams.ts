// Dựng sơ đồ/infographic thành "cảnh" SVG thuần dữ liệu; dùng chung cho hiển thị (React) và xuất tệp (chuỗi SVG).
import type { InfographicData, MindmapData } from '@/lib/resources/types';
import { layoutMindmap, wrapText } from './mindmapLayout';

export type SvgNode =
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx?: number; fill: string; stroke?: string; sw?: number }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string; stroke?: string; sw?: number }
  | { t: 'path'; d: string; stroke: string; sw: number }
  | {
      t: 'text';
      x: number;
      y: number;
      lines: string[];
      size: number;
      lh: number;
      fill: string;
      weight?: number;
      anchor?: 'start' | 'middle';
    };

export interface SvgScene {
  width: number;
  height: number;
  title: string;
  nodes: SvgNode[];
}

export const SVG_FONT = "Arial, 'Helvetica Neue', sans-serif";

const C = {
  navy: '#14153A',
  navy900: '#0D0E2B',
  cta: '#F9DD0E',
  goldSoft: '#FBF6DC',
  cream: '#FAF9F4',
  line: '#D3CFC0',
  ink: '#1A1A2E',
  muted: '#54556E',
  white: '#FFFFFF',
};
const BRANCH = ['#26275D', '#1E7F4F', '#B45309', '#7A5F00', '#0E6B8C', '#9D2B6B'];
const branchColor = (b: number) => BRANCH[((b % BRANCH.length) + BRANCH.length) % BRANCH.length];

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Cảnh sơ đồ tư duy. Có dải tiêu đề phía trên để tệp xuất đứng một mình. */
export function buildMindmapScene(data: MindmapData): SvgScene {
  const lay = layoutMindmap(data.root);
  const head = 56;
  const nodes: SvgNode[] = [];
  const byId = new Map(lay.nodes.map((n) => [n.id, n]));
  const width = Math.max(lay.width, 360);
  nodes.push({ t: 'rect', x: 0, y: 0, w: width, h: lay.height + head, fill: C.white });
  nodes.push({
    t: 'text',
    x: width / 2,
    y: 36,
    lines: [String(data.title || data.root.label)],
    size: 22,
    lh: 26,
    fill: C.navy,
    weight: 700,
    anchor: 'middle',
  });
  for (const e of lay.edges) {
    const a = byId.get(e.from)!;
    const b = byId.get(e.to)!;
    const x1 = a.x + a.w;
    const y1 = a.y + a.h / 2 + head;
    const x2 = b.x;
    const y2 = b.y + b.h / 2 + head;
    const mx = (x1 + x2) / 2;
    nodes.push({
      t: 'path',
      d: `M${r1(x1)} ${r1(y1)} C${r1(mx)} ${r1(y1)} ${r1(mx)} ${r1(y2)} ${r1(x2)} ${r1(y2)}`,
      stroke: branchColor(b.branch),
      sw: 2,
    });
  }
  for (const n of lay.nodes) {
    const color = n.depth === 0 ? C.navy : branchColor(n.branch);
    const filled = n.depth <= 1;
    nodes.push({
      t: 'rect',
      x: r1(n.x),
      y: r1(n.y + head),
      w: n.w,
      h: n.h,
      rx: n.depth === 0 ? 20 : 10,
      fill: n.depth === 0 ? C.navy : filled ? color : C.white,
      stroke: color,
      sw: 2,
    });
    const lh = 19;
    nodes.push({
      t: 'text',
      x: r1(n.x + n.w / 2),
      y: r1(n.y + head + n.h / 2 - ((n.lines.length - 1) * lh) / 2 + 5),
      lines: n.lines,
      size: 15,
      lh,
      fill: filled ? (n.depth === 0 ? C.cta : C.white) : C.ink,
      weight: n.depth <= 1 ? 700 : 500,
      anchor: 'middle',
    });
  }
  return { width, height: lay.height + head, title: data.title, nodes };
}

/** Cảnh infographic: thẻ rộng 800, các khối xếp dọc, chiều cao tính theo nội dung. */
export function buildInfographicScene(data: InfographicData): SvgScene {
  const W = 800;
  const M = 32;
  const nodes: SvgNode[] = [];
  nodes.push({ t: 'rect', x: 0, y: 0, w: W, h: 0, fill: C.cream }); // chiều cao cập nhật cuối
  const bg = nodes[0] as Extract<SvgNode, { t: 'rect' }>;
  let y = 0;

  // Đầu thẻ
  const titleLines = wrapText(data.title, 40, 3);
  const subLines = data.subtitle ? wrapText(data.subtitle, 70, 2) : [];
  const headH = 36 + titleLines.length * 42 + (subLines.length ? subLines.length * 24 + 8 : 0) + 30;
  nodes.push({ t: 'rect', x: 0, y: 0, w: W, h: headH, fill: C.navy });
  nodes.push({ t: 'rect', x: 0, y: headH - 8, w: W, h: 8, fill: C.cta });
  nodes.push({ t: 'text', x: M, y: 36 + 32, lines: titleLines, size: 34, lh: 42, fill: C.white, weight: 700 });
  if (subLines.length) {
    nodes.push({
      t: 'text',
      x: M,
      y: 36 + titleLines.length * 42 + 22,
      lines: subLines,
      size: 18,
      lh: 24,
      fill: C.cta,
    });
  }
  y = headH + 28;

  const sectionTitle = (text: string) => {
    nodes.push({ t: 'text', x: M, y: y + 20, lines: [text], size: 20, lh: 26, fill: C.navy, weight: 700 });
    nodes.push({ t: 'rect', x: M, y: y + 30, w: 56, h: 4, fill: C.cta });
    y += 52;
  };

  // Ý chính: lưới 2 cột
  const kps = (data.keyPoints ?? []).slice(0, 8);
  if (kps.length) {
    sectionTitle('Ý chính');
    const cw = (W - 2 * M - 16) / 2;
    for (let i = 0; i < kps.length; i += 2) {
      const row = kps.slice(i, i + 2);
      const cards = row.map((k) => ({
        label: wrapText(k.label, 30, 2),
        text: wrapText(k.text, (cw - 36) / 8.2, 6),
      }));
      const h = Math.max(...cards.map((c) => 16 + c.label.length * 24 + 6 + c.text.length * 22 + 16));
      cards.forEach((c, j) => {
        const x = M + j * (cw + 16);
        nodes.push({ t: 'rect', x, y, w: cw, h, rx: 12, fill: C.white, stroke: C.line, sw: 1.5 });
        nodes.push({ t: 'rect', x, y: y + 14, w: 6, h: h - 28, fill: C.cta });
        nodes.push({ t: 'text', x: x + 20, y: y + 16 + 18, lines: c.label, size: 18, lh: 24, fill: C.navy, weight: 700 });
        nodes.push({
          t: 'text',
          x: x + 20,
          y: y + 16 + c.label.length * 24 + 6 + 16,
          lines: c.text,
          size: 16,
          lh: 22,
          fill: C.ink,
        });
      });
      y += h + 16;
    }
    y += 8;
  }

  // Các bước
  const steps = (data.steps ?? []).slice(0, 8);
  if (steps.length) {
    sectionTitle('Các bước');
    const tw = W - 2 * M - 64;
    steps.forEach((s, i) => {
      const t = wrapText(s.title, tw / 10.5, 2);
      const b = wrapText(s.text, tw / 8.2, 4);
      const h = Math.max(48, t.length * 24 + b.length * 22 + 8);
      if (i < steps.length - 1) {
        nodes.push({ t: 'path', d: `M${M + 22} ${y + 48} L${M + 22} ${y + h + 14}`, stroke: C.line, sw: 3 });
      }
      nodes.push({ t: 'circle', cx: M + 22, cy: y + 24, r: 22, fill: C.navy });
      nodes.push({
        t: 'text',
        x: M + 22,
        y: y + 31,
        lines: [String(s.n ?? i + 1)],
        size: 20,
        lh: 24,
        fill: C.cta,
        weight: 700,
        anchor: 'middle',
      });
      nodes.push({ t: 'text', x: M + 64, y: y + 20, lines: t, size: 18, lh: 24, fill: C.navy, weight: 700 });
      nodes.push({ t: 'text', x: M + 64, y: y + 20 + t.length * 24, lines: b, size: 16, lh: 22, fill: C.ink });
      y += h + 14;
    });
    y += 10;
  }

  // Con số nổi bật
  const facts = (data.facts ?? []).slice(0, 6);
  if (facts.length) {
    sectionTitle('Con số cần nhớ');
    const cols = Math.min(3, facts.length);
    const gap = 14;
    const fw = (W - 2 * M - gap * (cols - 1)) / cols;
    for (let i = 0; i < facts.length; i += cols) {
      const row = facts.slice(i, i + cols);
      const cap = row.map((f) => wrapText(f.caption, (fw - 24) / 8, 3));
      const val = row.map((f) => wrapText(f.value, (fw - 24) / 19, 2));
      const h = Math.max(...row.map((_, k) => 20 + val[k].length * 46 + cap[k].length * 21 + 18));
      row.forEach((_, k) => {
        const x = M + k * (fw + gap);
        nodes.push({ t: 'rect', x, y, w: fw, h, rx: 14, fill: C.cta });
        nodes.push({
          t: 'text',
          x: x + fw / 2,
          y: y + 20 + 34,
          lines: val[k],
          size: 40,
          lh: 46,
          fill: C.navy900,
          weight: 700,
          anchor: 'middle',
        });
        nodes.push({
          t: 'text',
          x: x + fw / 2,
          y: y + 20 + val[k].length * 46 + 14,
          lines: cap[k],
          size: 16,
          lh: 21,
          fill: C.navy900,
          anchor: 'middle',
        });
      });
      y += h + gap;
    }
    y += 10;
  }

  // Câu chốt
  const tk = wrapText(data.takeaway, (W - 2 * M - 40) / 11, 4);
  const tkH = 24 + 22 + tk.length * 30 + 24;
  nodes.push({ t: 'rect', x: M, y, w: W - 2 * M, h: tkH, rx: 16, fill: C.navy });
  nodes.push({ t: 'text', x: M + 24, y: y + 30, lines: ['CẦN NHỚ'], size: 15, lh: 20, fill: C.cta, weight: 700 });
  nodes.push({ t: 'text', x: M + 24, y: y + 24 + 22 + 20, lines: tk, size: 22, lh: 30, fill: C.white, weight: 700 });
  y += tkH + 16;

  nodes.push({
    t: 'text',
    x: W / 2,
    y: y + 14,
    lines: ['Trường Việt Anh'],
    size: 14,
    lh: 18,
    fill: C.muted,
    anchor: 'middle',
  });
  y += 36;
  bg.h = y;
  return { width: W, height: y, title: data.title, nodes };
}

export function escapeXml(s: string): string {
  return String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Chuỗi SVG hoàn chỉnh (hợp lệ XML) từ cảnh. */
export function sceneToSvg(scene: SvgScene): string {
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}" font-family="${SVG_FONT}" role="img" aria-label="${escapeXml(scene.title)}">`,
  );
  parts.push(`<title>${escapeXml(scene.title)}</title>`);
  for (const n of scene.nodes) {
    if (n.t === 'rect') {
      parts.push(
        `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}"${n.rx ? ` rx="${n.rx}"` : ''} fill="${n.fill}"${n.stroke ? ` stroke="${n.stroke}" stroke-width="${n.sw ?? 1}"` : ''}/>`,
      );
    } else if (n.t === 'circle') {
      parts.push(
        `<circle cx="${n.cx}" cy="${n.cy}" r="${n.r}" fill="${n.fill}"${n.stroke ? ` stroke="${n.stroke}" stroke-width="${n.sw ?? 1}"` : ''}/>`,
      );
    } else if (n.t === 'path') {
      parts.push(`<path d="${n.d}" fill="none" stroke="${n.stroke}" stroke-width="${n.sw}" stroke-linecap="round"/>`);
    } else {
      const anchor = n.anchor === 'middle' ? ' text-anchor="middle"' : '';
      const spans = n.lines
        .map((ln, i) => `<tspan x="${n.x}" y="${r1(n.y + i * n.lh)}">${escapeXml(ln)}</tspan>`)
        .join('');
      parts.push(`<text font-size="${n.size}"${n.weight ? ` font-weight="${n.weight}"` : ''} fill="${n.fill}"${anchor}>${spans}</text>`);
    }
  }
  parts.push('</svg>');
  return parts.join('\n');
}
