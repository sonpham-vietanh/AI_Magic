// Đường dẫn sang trợ lý soạn bài để tạo kế hoạch bài dạy tích hợp liên môn.
export function planHref(center: { id: string; title: string }, linkedId: string): string {
  return `/?format=ke_hoach&bai=${center.id}&baiTitle=${encodeURIComponent(center.title)}&lienKet=${linkedId}`;
}
