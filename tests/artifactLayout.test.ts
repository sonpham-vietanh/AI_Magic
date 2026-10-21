import { describe, expect, it } from 'vitest';
// @ts-expect-error sax không có kiểu; chỉ dùng để kiểm tra XML trong test
import sax from 'sax';
import { layoutMindmap, wrapText } from '@/lib/export/mindmapLayout';
import { buildInfographicScene, buildMindmapScene, sceneToSvg } from '@/lib/export/diagrams';
import { SAMPLE_ARTIFACTS } from '@/lib/export/samples';
import type { MindmapNode } from '@/lib/resources/types';

type Box = { x: number; y: number; w: number; h: number };
function overlap(a: Box, b: Box) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
function check(root: MindmapNode) {
  const lay = layoutMindmap(root);
  for (let i = 0; i < lay.nodes.length; i++) {
    const n = lay.nodes[i];
    expect(n.x).toBeGreaterThanOrEqual(0);
    expect(n.y).toBeGreaterThanOrEqual(0);
    expect(n.x + n.w).toBeLessThanOrEqual(lay.width);
    expect(n.y + n.h).toBeLessThanOrEqual(lay.height);
    for (let j = i + 1; j < lay.nodes.length; j++) expect(overlap(n, lay.nodes[j])).toBe(false);
  }
  return lay;
}
const kids = (p: string, n: number, f?: (i: number) => MindmapNode[]): MindmapNode[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, label: `Nhãn khá dài số ${i} của nút ${p} để thử ngắt dòng`, children: f?.(i) }));

describe('layoutMindmap', () => {
  it('0 con', () => {
    const lay = check({ id: 'r', label: 'Gốc' });
    expect(lay.nodes).toHaveLength(1);
    expect(lay.edges).toHaveLength(0);
  });
  it('1 con', () => {
    const lay = check({ id: 'r', label: 'Gốc', children: kids('a', 1) });
    expect(lay.edges).toHaveLength(1);
  });
  it('nhiều con', () => {
    const lay = check({ id: 'r', label: 'Gốc', children: kids('a', 8) });
    expect(lay.nodes).toHaveLength(9);
  });
  it('cây sâu 3 tầng, không chồng và có thứ tự cột', () => {
    const root: MindmapNode = { id: 'r', label: 'Gốc', children: kids('a', 5, (i) => kids(`b${i}`, 4, (j) => kids(`c${i}${j}`, i % 3))) };
    const lay = check(root);
    const byId = new Map(lay.nodes.map((n) => [n.id, n]));
    for (const e of lay.edges) expect(byId.get(e.to)!.x).toBeGreaterThan(byId.get(e.from)!.x);
  });
  it('xác định: cùng đầu vào cùng kết quả; id trùng được xử lý', () => {
    const root: MindmapNode = { id: 'x', label: 'A', children: [{ id: 'x', label: 'B' }, { id: 'x', label: 'C' }] };
    const a = layoutMindmap(root);
    expect(layoutMindmap(root)).toEqual(a);
    expect(new Set(a.nodes.map((n) => n.id)).size).toBe(3);
  });
  it('nhãn rất dài được ngắt dòng, không vượt khung', () => {
    const lay = check({ id: 'r', label: 'x'.repeat(300), children: [{ id: 'a', label: 'Từ '.repeat(80) }] });
    expect(lay.nodes[0].lines.length).toBeLessThanOrEqual(4);
  });
});

describe('wrapText', () => {
  it('không dòng nào dài hơn giới hạn', () => {
    for (const l of wrapText('một hai ba bốn năm sáu bảy tám chín mười siêu_dài_siêu_dài_siêu_dài', 12)) expect(l.length).toBeLessThanOrEqual(12);
  });
});

function parseXml(xml: string) {
  const p = sax.parser(true);
  let err: Error | null = null;
  p.onerror = (e: Error) => {
    err = e;
  };
  let tags = 0;
  p.onopentag = () => {
    tags++;
  };
  p.write(xml).close();
  return { err, tags };
}

describe('SVG xuất ra', () => {
  it('mindmap và infographic là XML hợp lệ, ký tự đặc biệt được thoát', () => {
    const mm = SAMPLE_ARTIFACTS.find((a) => a.kind === 'mindmap')!;
    const mmData = structuredClone(mm.data) as { title: string; root: MindmapNode };
    mmData.root.label = 'A & B <c> "d"';
    const svg1 = sceneToSvg(buildMindmapScene(mmData));
    const r1 = parseXml(svg1);
    expect(r1.err).toBeNull();
    expect(r1.tags).toBeGreaterThan(10);
    expect(svg1).toContain('A &amp; B &lt;c&gt;');
    const inf = SAMPLE_ARTIFACTS.find((a) => a.kind === 'infographic')!;
    const scene = buildInfographicScene(inf.data as never);
    const r2 = parseXml(sceneToSvg(scene));
    expect(r2.err).toBeNull();
    expect(scene.height).toBeGreaterThan(600);
  });
  it('infographic tối giản (không bước, không số) vẫn dựng được', () => {
    const scene = buildInfographicScene({ title: 'T', keyPoints: [{ label: 'a', text: 'b' }], takeaway: 'c' });
    expect(parseXml(sceneToSvg(scene)).err).toBeNull();
  });
});
