// Kiểm tra cấu trúc XÁC ĐỊNH (không dùng AI) và văn bản thuần của từng sản phẩm.
import type { Artifact, MindmapNode, StructureCheck } from './types';

const c = (id: string, label: string, ok: boolean, note?: string): StructureCheck => ({
  id, label, ok, ...(note ? { note } : {}),
});
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
const LVL = { nho: 1, hieu: 2, van_dung: 3 } as const;

const OPEN_RE = /mở đầu|khởi động|gợi mở|vào bài|giới thiệu|đặt vấn đề|tình huống|xuất phát|warm|intro|hook|opening|lead/i;
const CLOSE_RE = /tổng kết|kết luận|ghi nhớ|tóm tắt|củng cố|chốt|dặn dò|summary|conclusion|recap|takeaway|wrap/i;

function mindStats(root: MindmapNode) {
  const ids = new Set<string>();
  let dup = false;
  let maxDepth = 0;
  let maxKids = 0;
  const walk = (n: MindmapNode, d: number) => {
    if (ids.has(n.id)) dup = true;
    ids.add(n.id);
    maxDepth = Math.max(maxDepth, d);
    const k = n.children ?? [];
    maxKids = Math.max(maxKids, k.length);
    k.forEach((x) => walk(x, d + 1));
  };
  walk(root, 1);
  return { dup, maxDepth, maxKids, count: ids.size };
}

export function checkArtifact(a: Artifact): StructureCheck[] {
  switch (a.kind) {
    case 'slides': {
      const d = a.data as Artifact<'slides'>['data'];
      const n = d.slides.length;
      const first = d.slides[0];
      const last = d.slides[n - 1];
      const bad = d.slides.map((s, i) => (s.bullets.length < 3 || s.bullets.length > 5 ? i + 1 : 0)).filter(Boolean);
      return [
        c('slides.count', 'Có 10–14 slide', n >= 10 && n <= 14, `Hiện có ${n} slide`),
        c('slides.open', 'Có slide mở đầu gợi mở', !!first && (OPEN_RE.test(first.title) || /\?/.test(first.title + first.bullets.join(' '))), first ? `Slide 1: ${first.title}` : undefined),
        c('slides.close', 'Có slide tổng kết', !!last && CLOSE_RE.test(last.title), last ? `Slide cuối: ${last.title}` : undefined),
        c('slides.bullets', 'Mỗi slide có 3–5 ý', bad.length === 0 && n > 0, bad.length ? `Slide ${bad.join(', ')} chưa đúng 3–5 ý` : undefined),
      ];
    }
    case 'worksheet': {
      const d = a.data as Artifact<'worksheet'>['data'];
      const levels = d.sections.map((s) => Math.max(0, ...s.items.map((i) => (i.level ? LVL[i.level] : 0))));
      const known = levels.every((l) => l > 0);
      const rising = known && levels.every((l, i) => i === 0 || l >= levels[i - 1]) && levels[levels.length - 1] > levels[0];
      return [
        c('ws.sections', 'Có ít nhất 3 phần', d.sections.length >= 3, `Hiện có ${d.sections.length} phần`),
        c('ws.levels', 'Các phần tăng dần mức (nhớ, hiểu, vận dụng)', rising, known ? undefined : 'Thiếu nhãn mức ở một số phần'),
        c('ws.items', 'Mỗi phần có câu hỏi', d.sections.every((s) => s.items.length > 0)),
        c('ws.key', 'Có đáp án riêng cho giáo viên', d.answerKey.length > 0 && d.answerKey.every((k) => k.body.trim().length > 0)),
      ];
    }
    case 'mindmap': {
      const d = a.data as Artifact<'mindmap'>['data'];
      const st = mindStats(d.root);
      return [
        c('mm.depth', 'Tối đa 3 tầng', st.maxDepth <= 3, `Sâu ${st.maxDepth} tầng`),
        c('mm.kids', 'Mỗi nút tối đa 8 nhánh con', st.maxKids <= 8, `Nút nhiều nhất có ${st.maxKids} con`),
        c('mm.ids', 'Mã nút không trùng', !st.dup),
        c('mm.size', 'Có nhánh con (không chỉ một nút)', st.count >= 4, `${st.count} nút`),
      ];
    }
    case 'infographic': {
      const d = a.data as Artifact<'infographic'>['data'];
      const n = d.keyPoints.length;
      return [
        c('ig.points', 'Có 3–6 ý chính', n >= 3 && n <= 6, `Hiện có ${n} ý`),
        c('ig.takeaway', 'Có một câu chốt', d.takeaway.trim().length > 0 && !/\n/.test(d.takeaway.trim())),
      ];
    }
    case 'podcast': {
      const d = a.data as Artifact<'podcast'>['data'];
      const w = d.lines.reduce((s, l) => s + words(l.text), 0);
      const rate = d.durationMin > 0 ? w / d.durationMin : 0;
      const hostSet = new Set(d.hosts.map(norm));
      return [
        c('pc.hosts', 'Có 1–2 người dẫn', d.hosts.length >= 1 && d.hosts.length <= 2),
        c('pc.speakers', 'Lời nói thuộc người dẫn đã khai báo', d.lines.every((l) => hostSet.has(norm(l.speaker)))),
        c('pc.duration', 'Thời lượng khớp số chữ (~130–160 chữ/phút)', rate >= 115 && rate <= 180, `${w} chữ / ${d.durationMin} phút = ${Math.round(rate)} chữ/phút`),
      ];
    }
    case 'tranh_luan': {
      const d = a.data as Artifact<'tranh_luan'>['data'];
      const two = d.experts.length === 2;
      const diff = two && norm(d.experts[0].stance) !== norm(d.experts[1].stance) && norm(d.experts[0].name) !== norm(d.experts[1].name);
      const names = new Set(d.experts.map((e) => norm(e.name)));
      const known = d.lines.every((l) => names.has(norm(l.speaker)));
      const alt = d.lines.every((l, i) => i === 0 || norm(l.speaker) !== norm(d.lines[i - 1].speaker));
      return [
        c('tl.experts', 'Đúng 2 chuyên gia', two, `Hiện có ${d.experts.length}`),
        c('tl.stance', 'Hai quan điểm khác nhau', diff),
        c('tl.turns', 'Có ít nhất 6 lượt nói', d.lines.length >= 6, `Hiện có ${d.lines.length} lượt`),
        c('tl.alt', 'Hai bên nói xen kẽ, đúng tên chuyên gia', known && alt),
        c('tl.conclusion', 'Có kết luận', d.conclusion.trim().length > 0),
      ];
    }
    case 'video': {
      const d = a.data as Artifact<'video'>['data'];
      const sum = d.scenes.reduce((s, x) => s + x.durationSec, 0);
      const target = d.totalMin * 60;
      const seq = d.scenes.every((s, i) => s.n === i + 1);
      return [
        c('vd.range', 'Thời lượng 1–8 phút', d.totalMin >= 1 && d.totalMin <= 8, `${d.totalMin} phút`),
        c('vd.sum', 'Tổng thời lượng các cảnh khớp totalMin (±10%)', target > 0 && Math.abs(sum - target) <= target * 0.1, `${sum}s so với ${Math.round(target)}s`),
        c('vd.seq', 'Cảnh đánh số liên tục từ 1', seq && d.scenes.length > 0),
      ];
    }
    case 'text': {
      const d = a.data as Artifact<'text'>['data'];
      return [
        c('tx.sections', 'Có ít nhất 3 mục', d.sections.length >= 3, `Hiện có ${d.sections.length} mục`),
        c('tx.body', 'Mục nào cũng có nội dung', d.sections.every((s) => s.heading.trim() && s.body.trim())),
      ];
    }
  }
  return [];
}

export function artifactToText(a: Artifact): string {
  const L: string[] = [];
  switch (a.kind) {
    case 'text': {
      const d = a.data as Artifact<'text'>['data'];
      L.push(d.title, '');
      d.sections.forEach((s) => L.push(s.heading, s.body, ''));
      break;
    }
    case 'mindmap': {
      const d = a.data as Artifact<'mindmap'>['data'];
      L.push(d.title, '');
      const walk = (n: MindmapNode, depth: number) => {
        L.push(`${'  '.repeat(depth)}- ${n.label}`);
        (n.children ?? []).forEach((k) => walk(k, depth + 1));
      };
      walk(d.root, 0);
      break;
    }
    case 'infographic': {
      const d = a.data as Artifact<'infographic'>['data'];
      L.push(d.title);
      if (d.subtitle) L.push(d.subtitle);
      L.push('', 'Ý chính:');
      d.keyPoints.forEach((k, i) => L.push(`${i + 1}. ${k.label}: ${k.text}`));
      if (d.steps?.length) {
        L.push('', 'Các bước:');
        d.steps.forEach((s) => L.push(`Bước ${s.n}. ${s.title}: ${s.text}`));
      }
      if (d.facts?.length) {
        L.push('', 'Con số nổi bật:');
        d.facts.forEach((f) => L.push(`${f.value} - ${f.caption}`));
      }
      L.push('', `Cần nhớ: ${d.takeaway}`);
      break;
    }
    case 'podcast': {
      const d = a.data as Artifact<'podcast'>['data'];
      L.push(`${d.title} (khoảng ${d.durationMin} phút)`, `Người dẫn: ${d.hosts.join(', ')}`, '');
      d.lines.forEach((l) => L.push(`${l.speaker}: ${l.text}`));
      break;
    }
    case 'tranh_luan': {
      const d = a.data as Artifact<'tranh_luan'>['data'];
      L.push(d.title, `Chủ đề: ${d.topic}`);
      d.experts.forEach((e) => L.push(`${e.name} - quan điểm: ${e.stance}`));
      L.push('');
      d.lines.forEach((l) => L.push(`${l.speaker}: ${l.text}`));
      L.push('', `Kết luận: ${d.conclusion}`);
      break;
    }
    case 'video': {
      const d = a.data as Artifact<'video'>['data'];
      L.push(`${d.title} (${d.totalMin} phút)`, '');
      d.scenes.forEach((s) => {
        L.push(`Cảnh ${s.n} (${s.durationSec}s)`, `Hình: ${s.visual}`, `Lời: ${s.narration}`);
        if (s.onScreenText) L.push(`Chữ trên màn hình: ${s.onScreenText}`);
        L.push('');
      });
      break;
    }
    case 'slides': {
      const d = a.data as Artifact<'slides'>['data'];
      L.push(d.title, '');
      d.slides.forEach((s, i) => {
        L.push(`Slide ${i + 1}: ${s.title}`);
        s.bullets.forEach((b) => L.push(`- ${b}`));
        if (s.visual) L.push(`Hình gợi ý: ${s.visual}`);
        if (s.notes) L.push(`Ghi chú: ${s.notes}`);
        L.push('');
      });
      break;
    }
    case 'worksheet': {
      const d = a.data as Artifact<'worksheet'>['data'];
      L.push(d.title, '');
      d.sections.forEach((s) => {
        L.push(s.heading);
        s.items.forEach((it, i) => L.push(`${i + 1}. ${it.prompt}`));
        L.push('');
      });
      L.push('ĐÁP ÁN (dành cho giáo viên)');
      d.answerKey.forEach((k) => L.push(`${k.heading}: ${k.body}`));
      break;
    }
  }
  return L.join('\n').trim();
}
