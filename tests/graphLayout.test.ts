import { describe, expect, it } from 'vitest';
import {
  boxesOverlap,
  dedupeEdgesByAtom,
  layoutRadial,
  type EdgeLike,
} from '@/components/graph/layout';

const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, priority: 0 }));
const SIZES = [
  { width: 720, height: 520 },
  { width: 800, height: 560 },
  { width: 1000, height: 640 },
];

describe('layoutRadial', () => {
  it('0 láng giềng: chỉ có nút trung tâm ở giữa', () => {
    const l = layoutRadial('c', [], { width: 800, height: 560 });
    expect(l.nodes).toHaveLength(0);
    expect(l.hidden).toBe(0);
    expect(l.center.x).toBe(400);
    expect(l.center.y).toBe(280);
  });

  it('1 láng giềng: không chồng nút trung tâm', () => {
    const l = layoutRadial('c', ids(1), { width: 800, height: 560 });
    expect(l.nodes).toHaveLength(1);
    expect(boxesOverlap(l.center, l.nodes[0])).toBe(false);
  });

  it('mọi số lượng: không chồng nhau và nằm trong khung', () => {
    for (const size of SIZES) {
      for (let n = 0; n <= 12; n++) {
        const l = layoutRadial('c', ids(n), size);
        const all = [l.center, ...l.nodes];
        for (const p of all) {
          expect(p.x - p.w / 2).toBeGreaterThanOrEqual(0);
          expect(p.x + p.w / 2).toBeLessThanOrEqual(size.width);
          expect(p.y - p.h / 2).toBeGreaterThanOrEqual(0);
          expect(p.y + p.h / 2).toBeLessThanOrEqual(size.height);
        }
        for (let i = 0; i < all.length; i++) {
          for (let j = i + 1; j < all.length; j++) {
            expect(boxesOverlap(all[i], all[j])).toBe(false);
          }
        }
      }
    }
  });

  it('số lượng lớn bị cắt gọn và giữ nút ưu tiên cao', () => {
    const list = ids(40).map((n, i) => ({ ...n, priority: i }));
    const l = layoutRadial('c', list, { width: 800, height: 560 });
    expect(l.nodes).toHaveLength(12);
    expect(l.hidden).toBe(28);
    expect(l.nodes.map((n) => n.id)).toContain('n39');
    expect(l.nodes.map((n) => n.id)).not.toContain('n0');
  });

  it('bỏ trùng và bỏ chính nút trung tâm', () => {
    const l = layoutRadial('c', [{ id: 'c' }, { id: 'a' }, { id: 'a' }, { id: 'b' }], {
      width: 800,
      height: 560,
    });
    expect(l.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(l.hidden).toBe(0);
  });
});

describe('dedupeEdgesByAtom', () => {
  it('giữ cạnh ưu tiên cao nhất cho mỗi bài và bỏ cạnh thiếu bài', () => {
    const edges: EdgeLike[] = [
      { id: '1', relation: 'prerequisite_soft', linkedAtom: { id: 'A' } },
      { id: '2', relation: 'x', cross_subject: 'Vật lí', linkedAtom: { id: 'A' } },
      { id: '3', relation: 'x' },
    ];
    const r = dedupeEdgesByAtom(edges);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('2');
  });
});
