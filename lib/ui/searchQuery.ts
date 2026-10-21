export type SearchQuery =
  | { kind: 'empty' }
  | { kind: 'atomId'; atomId: string }
  | { kind: 'text'; q: string };

/** Phân loại truy vấn: mã KC-<số> tra theo atomId, còn lại tìm theo q. */
export function classifySearchQuery(raw: string): SearchQuery {
  const q = (raw ?? '').trim();
  if (!q) return { kind: 'empty' };
  if (/^KC-\d+$/i.test(q)) return { kind: 'atomId', atomId: q.toUpperCase() };
  return { kind: 'text', q };
}
