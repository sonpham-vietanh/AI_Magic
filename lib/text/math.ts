// Tách văn bản có công thức LaTeX ($..$, $$..$$, \(..\), \[..\]) thành các đoạn chữ và đoạn công thức.
// Hàm thuần, dùng chung cho màn hình (KaTeX), Word (OMML), PowerPoint và bản in.

export type MathSeg = { type: 'text' | 'math'; value: string; display?: boolean };

const BLOCK_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/y;

/**
 * Dấu $ đơn chỉ mở công thức khi liền với chữ ngay sau, và đóng khi liền chữ ngay trước
 * và không đứng trước chữ số (tránh nhầm với tiền: "50$ và 60$").
 */
function inlineAt(s: string, i: number): { end: number; value: string } | null {
  if (s[i] !== '$' || s[i + 1] === '$') return null;
  const first = s[i + 1];
  if (first === undefined || /\s/.test(first)) return null;
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (c === '\n') return null;
    if (c === '\\') {
      j++;
      continue;
    }
    if (c === '$') {
      const prev = s[j - 1];
      const next = s[j + 1];
      if (/\s/.test(prev) || (next !== undefined && /\d/.test(next))) return null;
      return { end: j + 1, value: s.slice(i + 1, j) };
    }
  }
  return null;
}

export function splitMath(input: string): MathSeg[] {
  const segs: MathSeg[] = [];
  const s = String(input ?? '');
  let buf = '';
  const flush = () => {
    if (buf) segs.push({ type: 'text', value: buf });
    buf = '';
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && (s[i + 1] === '[' || s[i + 1] === '(')) {
      BLOCK_RE.lastIndex = i;
      const m = BLOCK_RE.exec(s);
      if (m) {
        flush();
        segs.push({ type: 'math', value: (m[2] ?? m[3] ?? '').trim(), display: m[2] !== undefined });
        i += m[0].length;
        continue;
      }
    }
    if (c === '\\' && s[i + 1] === '$') {
      buf += '$';
      i += 2;
      continue;
    }
    if (c === '$') {
      if (s[i + 1] === '$') {
        BLOCK_RE.lastIndex = i;
        const m = BLOCK_RE.exec(s);
        if (m && m[1] !== undefined) {
          flush();
          segs.push({ type: 'math', value: m[1].trim(), display: true });
          i += m[0].length;
          continue;
        }
      } else {
        const m = inlineAt(s, i);
        if (m) {
          flush();
          segs.push({ type: 'math', value: m.value.trim(), display: false });
          i = m.end;
          continue;
        }
      }
    }
    buf += c;
    i++;
  }
  flush();
  return segs.filter((x) => x.type === 'text' || x.value !== '');
}

export function hasMath(text: string): boolean {
  return splitMath(text).some((x) => x.type === 'math');
}
