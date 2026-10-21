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
  // Thử từng vị trí "A." làm điểm bắt đầu cho đến khi tìm được chuỗi A, B (, C, D) liên tiếp.
  let from = 0;
  for (;;) {
    const a = marker('A', from);
    if (!a) return null;
    const found = [a];
    for (const l of letters.slice(1)) {
      const m = marker(l, found[found.length - 1].end);
      if (!m) break;
      found.push(m);
    }
    if (found.length >= 2) {
      const options = found.map((f, i) => src.slice(f.end, i + 1 < found.length ? found[i + 1].at : src.length).trim());
      if (options.every(Boolean)) return { stem: src.slice(0, a.at).trim(), options };
    }
    from = a.end;
  }
}

/** Phương án chỉ là chữ cái A-D (nhãn nhiễu trong CSDL) thì không phải nội dung phương án thật. */
export const isLetterOnly = (opts: string[]): boolean => opts.every((o) => /^[A-D]$/i.test(o.trim()));
