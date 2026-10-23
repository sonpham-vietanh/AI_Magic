// Công cụ QA: quét độ tương phản màu chữ so với màu nền THỰC TẾ của mọi phần tử đang hiển thị trong trang.
// Dùng trong script của skill browser-automation:
//
//   import { contrastScan, summarize } from 'file:///E:/Workspace/VietAnh_Major_education/cong-cu-day-hoc/scripts/qa/contrast.mjs';
//   export default async function run(page) {
//     await page.goto('http://localhost:3092/thu-vien');
//     const a = await contrastScan(page, 'thu-vien mặc định');
//     await page.click('button[aria-haspopup]');          // mở menu/popover/hộp thoại, rồi quét tiếp
//     const b = await contrastScan(page, 'thu-vien menu mở');
//     return summarize([a, b]);
//   }
//
// Quy tắc đo (WCAG 2.1 AA): chữ thường >= 4.5:1, chữ lớn (>=24px, hoặc >=18.66px đậm) >= 3:1.
// Cách tính nền: đi lên cây DOM, trộn các lớp nền bán trong suốt; gặp gradient/ảnh nền thì lấy MÀU ĐIỂM DỪNG kém thuận lợi nhất
// (đo cả hai đầu gradient) và đánh dấu bg:'gradient'. Phần tử có opacity < 1 được tính vào màu chữ.
// Ngoài tỉ lệ thấp, còn báo "chữ gần như vô hình" (ratio < 1.5) với cờ invisible:true.

export async function contrastScan(page, label = '') {
  const fails = await page.evaluate(() => {
    const parseColor = (s) => {
      const m = /rgba?\(([^)]+)\)/.exec(s || '');
      if (!m) return null;
      const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const over = (top, bottom) => {
      const a = top.a + bottom.a * (1 - top.a);
      if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
        g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
        b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
        a,
      };
    };
    const lum = (c) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a, b) => {
      const l1 = lum(a), l2 = lum(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const gradientStops = (img) => {
      const out = [];
      const re = /rgba?\([^)]+\)/g;
      let m;
      while ((m = re.exec(img))) {
        const c = parseColor(m[0]);
        if (c) out.push(c);
      }
      return out;
    };
    const selectorOf = (el) => {
      const parts = [];
      let n = el;
      for (let i = 0; n && n.nodeType === 1 && i < 4; i++, n = n.parentElement) {
        let s = n.tagName.toLowerCase();
        if (n.id) s += '#' + n.id;
        else if (n.className && typeof n.className === 'string') s += '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.');
        parts.unshift(s);
      }
      return parts.join(' > ');
    };
    // Trả về danh sách các nền khả dĩ (một nền đặc khi không có gradient, nhiều nền khi có gradient)
    const backgrounds = (el) => {
      let layers = [];
      let n = el;
      let usedGradient = false;
      while (n && n.nodeType === 1) {
        const cs = getComputedStyle(n);
        const bg = parseColor(cs.backgroundColor);
        const img = cs.backgroundImage;
        if (img && img !== 'none' && /gradient/.test(img)) {
          usedGradient = true;
          const stops = gradientStops(img);
          if (stops.length) layers.push({ stops });
        }
        if (bg && bg.a > 0) layers.push({ solid: bg });
        if (bg && bg.a >= 1) break;
        n = n.parentElement;
      }
      // dựng nền cuối cùng cho từng khả năng gradient
      let candidates = [{ r: 255, g: 255, b: 255, a: 1 }];
      for (let i = layers.length - 1; i >= 0; i--) {
        const L = layers[i];
        if (L.solid) candidates = candidates.map((c) => over(L.solid, c));
        else candidates = L.stops.flatMap((s) => candidates.map((c) => over(s, c)));
      }
      return { candidates, usedGradient };
    };
    const visible = (el) => {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      // bị che khuất hoàn toàn bởi overflow của tổ tiên thì bỏ qua
      return true;
    };
    const effectiveOpacity = (el) => {
      let o = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity || '1');
      return o;
    };
    const results = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const el = node.parentElement;
      if (!el || seen.has(el)) continue;
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
      if (!visible(el)) continue;
      // phần tử nằm ngoài khung nhìn cuộn vẫn được đo, nhưng bỏ qua phần tử bị ẩn bằng clip
      const cs = getComputedStyle(el);
      const fgRaw = parseColor(cs.color);
      if (!fgRaw) continue;
      seen.add(el);
      const op = effectiveOpacity(el);
      const { candidates, usedGradient } = backgrounds(el);
      let worst = Infinity;
      let worstBg = null;
      for (const bg of candidates) {
        const fg = over({ ...fgRaw, a: fgRaw.a * op }, bg);
        const r = ratio(fg, bg);
        if (r < worst) {
          worst = r;
          worstBg = bg;
        }
      }
      const size = parseFloat(cs.fontSize);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const need = large ? 3 : 4.5;
      if (worst < need) {
        const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
        results.push({
          text: text.slice(0, 50),
          selector: selectorOf(el),
          fg: hex(fgRaw) + (op < 1 ? ` x opacity ${op.toFixed(2)}` : ''),
          bg: hex(worstBg) + (usedGradient ? ' (gradient)' : ''),
          ratio: Math.round(worst * 100) / 100,
          need,
          size,
          invisible: worst < 1.5,
        });
      }
    }
    return results;
  });
  return { label, total: fails.length, invisible: fails.filter((f) => f.invisible).length, fails };
}

/** Gom kết quả nhiều lần quét thành bản tóm tắt gọn (tối đa 12 lỗi tệ nhất mỗi lần quét). */
export function summarize(scans) {
  return scans.map((s) => ({
    label: s.label,
    soLoi: s.total,
    chuVoHinh: s.invisible,
    tetNhat: [...s.fails].sort((a, b) => a.ratio - b.ratio).slice(0, 12),
  }));
}
