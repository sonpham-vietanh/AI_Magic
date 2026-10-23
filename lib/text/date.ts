// Ngày kiểu Việt Nam: dd/mm/yyyy.

/** "2026-10-23" -> "23/10/2026". Chuỗi không đúng dạng ISO trả nguyên. */
export function isoToVi(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso ?? '');
}

/** Đổi mọi ngày dạng yyyy-mm-dd trong một đoạn văn thành dd/mm/yyyy (giữ nguyên phần còn lại). */
export function viDatesInText(text: string): string {
  return String(text ?? '').replace(/(?<![\d-])(\d{4})-(\d{2})-(\d{2})(?![\d-])/g, (all, y, m, d) => {
    const mm = Number(m);
    const dd = Number(d);
    return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 ? `${d}/${m}/${y}` : all;
  });
}
