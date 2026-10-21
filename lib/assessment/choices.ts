/** Tách phương án A-D nằm ngay trong nội dung câu (dữ liệu thực tế lưu "… A. … B. … C. … D. …" trong một chuỗi). */
export function parseInlineChoices(text: string): { stem: string; options: string[] } | null {
  const src = String(text ?? '').replace(/\r\n?/g, '\n');
  const letters = ['A', 'B', 'C', 'D'];
  const marker = (l: string, from: number): { at: number; end: number } | null => {
    const re = new RegExp(String.raw`(?:^|\s)${l}\.\s`, 'g');
    re.lastIndex = from;
    const m = re.exec(src);
    return m ? { at: m.index, end: m.index + m[0].length } : null;
  };
  // Thử mọi vị trí "A." làm điểm bắt đầu; chọn chuỗi A, B (, C, D) dài nhất,
  // hoà thì lấy chuỗi bắt đầu SAU CÙNG (phương án nằm cuối câu, "A." trong thân câu không lấn).
  let best: { at: number; end: number }[] | null = null;
  let from = 0;
  for (;;) {
    const a = marker('A', from);
    if (!a) break;
    const found = [a];
    for (const l of letters.slice(1)) {
      const m = marker(l, found[found.length - 1].end);
      if (!m) break;
      found.push(m);
    }
    if (found.length >= 2) {
      const options = found.map((f, k) => src.slice(f.end, k + 1 < found.length ? found[k + 1].at : src.length).trim());
      if (options.every(Boolean) && (!best || found.length >= best.length)) best = found;
    }
    from = a.end;
  }
  if (!best) return null;
  const options = best.map((f, k) => src.slice(f.end, k + 1 < best!.length ? best![k + 1].at : src.length).trim());
  return { stem: src.slice(0, best[0].at).trim(), options };
}

/** Phương án chỉ là chữ cái A-D (nhãn nhiễu trong CSDL) thì không phải nội dung phương án thật. */
export const isLetterOnly = (opts: string[]): boolean => opts.every((o) => /^[A-D]$/i.test(o.trim()));
