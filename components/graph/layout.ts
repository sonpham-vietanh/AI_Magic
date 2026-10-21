// Thuật toán bố trí đồ thị liên kết: nút trung tâm ở giữa, các nút láng giềng
// xếp đều trên một hình elip quanh nó. Hàm thuần, không phụ thuộc React.

export interface LayoutNeighbor {
  id: string;
  /** Càng lớn càng được ưu tiên giữ lại khi phải cắt bớt. */
  priority?: number;
}

export interface LayoutOptions {
  /** Số láng giềng tối đa được vẽ. Mặc định 12. */
  max?: number;
  nodeW?: number;
  nodeH?: number;
  centerW?: number;
  centerH?: number;
  pad?: number;
}

export interface PlacedNode {
  id: string;
  /** Tâm của nút. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RadialLayout {
  width: number;
  height: number;
  center: PlacedNode;
  nodes: PlacedNode[];
  /** Số láng giềng bị cắt bớt. */
  hidden: number;
}

export const DEFAULT_MAX_NEIGHBORS = 12;
const INNER_SCALE = 0.66;

/**
 * Bố trí hình elip. Nút đầu tiên (ưu tiên cao nhất) nằm gần đỉnh, đi theo chiều kim đồng hồ.
 * Bảo đảm: mọi nút nằm trọn trong khung, không hai nút nào chồng nhau (với kích thước mặc định
 * và khung từ 640x480 trở lên).
 */
export function layoutRadial(
  centerId: string,
  neighbors: LayoutNeighbor[],
  size: { width: number; height: number },
  opts: LayoutOptions = {},
): RadialLayout {
  const max = Math.max(0, opts.max ?? DEFAULT_MAX_NEIGHBORS);
  const dense = Math.min(neighbors.length, max) > 8;
  const nodeW = opts.nodeW ?? (dense ? 138 : 156);
  const nodeH = opts.nodeH ?? (dense ? 56 : 60);
  const centerW = opts.centerW ?? 180;
  const centerH = opts.centerH ?? 64;
  const pad = opts.pad ?? 8;
  const { width, height } = size;
  const cx = width / 2;
  const cy = height / 2;

  // Bỏ trùng và bỏ chính nút trung tâm, giữ thứ tự ưu tiên ổn định.
  const seen = new Set<string>([centerId]);
  const unique: { n: LayoutNeighbor; i: number }[] = [];
  neighbors.forEach((n, i) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    unique.push({ n, i });
  });
  unique.sort((a, b) => (b.n.priority ?? 0) - (a.n.priority ?? 0) || a.i - b.i);
  const kept = unique.slice(0, max);
  const hidden = unique.length - kept.length;

  const center: PlacedNode = { id: centerId, x: cx, y: cy, w: centerW, h: centerH };
  const count = kept.length;
  const rx = Math.max(0, (width - nodeW) / 2 - pad);
  const ry = Math.max(0, (height - nodeH) / 2 - pad);
  const step = count > 0 ? (Math.PI * 2) / count : 0;
  // Lệch nửa bước để không có nút nằm đúng đỉnh/đáy (tránh đè nút trung tâm khi count nhỏ).
  const start = -Math.PI / 2 + (count > 1 ? step / 2 : 0);

  const nodes: PlacedNode[] = kept.map(({ n }, k) => {
    const a = start + step * k;
    // Trên 8 nút: xen kẽ vòng ngoài và vòng trong để các nút không đè nhau.
    const k2 = count > 8 && k % 2 === 1 ? INNER_SCALE : 1;
    return {
      id: n.id,
      x: Math.round((cx + rx * k2 * Math.cos(a)) * 10) / 10,
      y: Math.round((cy + ry * k2 * Math.sin(a)) * 10) / 10,
      w: nodeW,
      h: nodeH,
    };
  });

  return { width, height, center, nodes, hidden };
}

export function boxesOverlap(a: PlacedNode, b: PlacedNode, gap = 0): boolean {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap
  );
}

// ---- Dữ liệu cạnh từ API ----

export interface EdgeLike {
  id: string;
  relation: string;
  weight?: number;
  cross_subject?: string | null;
  linkedAtom?: { id: string } | null;
}

/** Điểm ưu tiên: liên môn > tiên quyết bắt buộc > tiên quyết bổ trợ > còn lại. */
export function edgePriority(e: EdgeLike): number {
  let p = e.weight ?? 0;
  if (e.cross_subject) p += 100;
  if (e.relation === 'prerequisite_hard') p += 20;
  else if (e.relation === 'prerequisite_soft') p += 10;
  return p;
}

/** Các cạnh có bài liên kết, bỏ trùng theo bài, giữ cạnh có ưu tiên cao nhất. */
export function dedupeEdgesByAtom<T extends EdgeLike>(edges: T[]): T[] {
  const best = new Map<string, T>();
  for (const e of edges) {
    const id = e.linkedAtom?.id;
    if (!id) continue;
    const cur = best.get(id);
    if (!cur || edgePriority(e) > edgePriority(cur)) best.set(id, e);
  }
  return [...best.values()];
}
