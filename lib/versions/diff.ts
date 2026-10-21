// So sánh hai văn bản theo dòng (LCS). Hàm thuần, không phụ thuộc DOM.
export type DiffKind = 'same' | 'add' | 'del';
export interface DiffLine {
  kind: DiffKind;
  text: string;
}
export interface DiffResult {
  lines: DiffLine[];
  added: number;
  removed: number;
  unchanged: number;
}

const MAX_LINES = 2000;

function splitLines(s: string): string[] {
  if (!s) return [];
  return s.replace(/\r\n?/g, '\n').split('\n');
}

export function diffLines(before: string, after: string): DiffResult {
  let a = splitLines(before);
  let b = splitLines(after);
  // Chặn chi phí O(n*m) với văn bản quá dài: cắt bớt phần vượt.
  if (a.length > MAX_LINES) a = a.slice(0, MAX_LINES);
  if (b.length > MAX_LINES) b = b.slice(0, MAX_LINES);
  const n = a.length;
  const m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ kind: 'del', text: a[i++] });
    } else {
      lines.push({ kind: 'add', text: b[j++] });
    }
  }
  while (i < n) lines.push({ kind: 'del', text: a[i++] });
  while (j < m) lines.push({ kind: 'add', text: b[j++] });
  return {
    lines,
    added: lines.filter((l) => l.kind === 'add').length,
    removed: lines.filter((l) => l.kind === 'del').length,
    unchanged: lines.filter((l) => l.kind === 'same').length,
  };
}
