// Bố cục sơ đồ tư duy: hàm thuần, xác định (cùng đầu vào -> cùng toạ độ), không chồng nút.
import type { MindmapNode } from '@/lib/resources/types';

export interface LaidNode {
  id: string;
  label: string;
  lines: string[];
  depth: number;
  /** Chỉ số nhánh cấp 1 (gốc = -1) để tô màu. */
  branch: number;
  parentId: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface LaidEdge {
  from: string;
  to: string;
}
export interface MindmapLayout {
  nodes: LaidNode[];
  edges: LaidEdge[];
  width: number;
  height: number;
}

export interface LayoutOptions {
  colWidths?: number[];
  gapX?: number;
  gapY?: number;
  fontSize?: number;
  lineHeight?: number;
  padX?: number;
  padY?: number;
  margin?: number;
  maxLines?: number;
  maxDepth?: number;
}

/** Ngắt dòng tham lam theo số ký tự; từ quá dài bị chẻ cứng. */
export function wrapText(text: string, maxChars: number, maxLines = Infinity): string[] {
  const max = Math.max(4, Math.floor(maxChars));
  const words = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  const push = () => {
    if (cur) lines.push(cur);
    cur = '';
  };
  for (let word of words) {
    while (word.length > max) {
      push();
      lines.push(word.slice(0, max));
      word = word.slice(max);
    }
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= max) cur += ' ' + word;
    else {
      push();
      cur = word;
    }
  }
  push();
  if (lines.length === 0) lines.push('');
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    const last = cut[maxLines - 1];
    cut[maxLines - 1] = (last.length >= max ? last.slice(0, max - 1) : last) + '…';
    return cut;
  }
  return lines;
}

const DEFAULTS = {
  colWidths: [210, 190, 180, 170],
  gapX: 56,
  gapY: 14,
  fontSize: 15,
  lineHeight: 19,
  padX: 12,
  padY: 10,
  margin: 24,
  maxLines: 4,
  maxDepth: 6,
};

interface Measured {
  node: MindmapNode;
  depth: number;
  branch: number;
  parentId: string | null;
  w: number;
  h: number;
  lines: string[];
  kids: Measured[];
  block: number;
}

export function layoutMindmap(root: MindmapNode, options: LayoutOptions = {}): MindmapLayout {
  const o = { ...DEFAULTS, ...options };
  const colW = (d: number) => o.colWidths[Math.min(d, o.colWidths.length - 1)];

  let counter = 0;
  const seen = new Set<string>();
  const measure = (n: MindmapNode, depth: number, branch: number, parentId: string | null): Measured => {
    let id = String(n.id ?? '') || `n${counter}`;
    counter++;
    while (seen.has(id)) id = `${id}_${counter++}`;
    seen.add(id);
    const w = colW(depth);
    const chars = (w - 2 * o.padX) / (o.fontSize * 0.56);
    const lines = wrapText(n.label, chars, o.maxLines);
    const h = Math.max(40, lines.length * o.lineHeight + 2 * o.padY);
    const children = depth + 1 > o.maxDepth ? [] : (n.children ?? []);
    const m: Measured = { node: { ...n, id }, depth, branch, parentId, w, h, lines, kids: [], block: 0 };
    m.kids = children.map((c, i) => measure(c, depth + 1, depth === 0 ? i : branch, id));
    const stack = m.kids.reduce((s, k) => s + k.block, 0) + Math.max(0, m.kids.length - 1) * o.gapY;
    m.block = Math.max(h, stack);
    return m;
  };
  const tree = measure(root, 0, -1, null);

  // x của từng cột
  const maxDepthSeen = (m: Measured): number => Math.max(m.depth, ...m.kids.map(maxDepthSeen));
  const depthMax = maxDepthSeen(tree);
  const colX: number[] = [];
  let x = o.margin;
  for (let d = 0; d <= depthMax; d++) {
    colX[d] = x;
    x += colW(d) + o.gapX;
  }
  const width = x - o.gapX + o.margin;

  const nodes: LaidNode[] = [];
  const edges: LaidEdge[] = [];
  const place = (m: Measured, top: number) => {
    const cy = top + m.block / 2;
    nodes.push({
      id: m.node.id,
      label: m.node.label,
      lines: m.lines,
      depth: m.depth,
      branch: m.branch,
      parentId: m.parentId,
      x: colX[m.depth],
      y: cy - m.h / 2,
      w: m.w,
      h: m.h,
    });
    const stack = m.kids.reduce((s, k) => s + k.block, 0) + Math.max(0, m.kids.length - 1) * o.gapY;
    let t = top + (m.block - stack) / 2;
    for (const k of m.kids) {
      edges.push({ from: m.node.id, to: k.node.id });
      place(k, t);
      t += k.block + o.gapY;
    }
  };
  place(tree, o.margin);
  const height = tree.block + 2 * o.margin;
  return { nodes, edges, width, height };
}
