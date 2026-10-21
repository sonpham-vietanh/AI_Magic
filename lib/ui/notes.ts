export interface ClassNoteItem {
  id: string;
  note: string;
  createdAt?: string;
}

/** Gộp ghi chú máy chủ với ghi chú tạm cục bộ, bỏ trùng (theo id, hoặc theo nội dung). */
export function mergeNotes(
  server: ClassNoteItem[],
  local: ClassNoteItem[],
): ClassNoteItem[] {
  const out = [...server];
  const texts = new Set(server.map((n) => n.note.trim()));
  const ids = new Set(server.map((n) => n.id));
  for (const n of local) {
    if (ids.has(n.id) || texts.has(n.note.trim())) continue;
    out.push(n);
  }
  return out;
}

/** Giữ lại phần tử đang chọn chỉ khi còn nằm trong danh sách đã lọc. */
export function keepSelection<T extends { id: string }>(
  list: T[],
  selectedId: string | null | undefined,
): T | null {
  if (!selectedId) return null;
  return list.find((x) => x.id === selectedId) ?? null;
}
