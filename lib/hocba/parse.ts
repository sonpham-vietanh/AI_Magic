import { MAX_NAME_CHARS, MAX_NOTE_CHARS, MAX_STUDENTS_PER_RUN } from './types';

export interface ParsedStudent {
  ten: string;
  ghiChu: string;
}

export interface ParseResult {
  students: ParsedStudent[];
  /** Thông báo thân thiện cho giáo viên (dòng bị bỏ qua, bị cắt bớt...). */
  warnings: string[];
}

/** Tách một dòng CSV có hỗ trợ dấu ngoặc kép. */
export function splitCsvLine(line: string, sep: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      cells.push(cur);
      cur = '';
    } else cur += c;
  }
  cells.push(cur);
  return cells.map((s) => s.trim());
}

const HEADER_RE = /^(stt|tên|ten|họ và tên|ho va ten|họ tên|ho ten|học sinh|hoc sinh|mã|ma)$/i;

/**
 * Đọc danh sách học sinh từ văn bản dán hoặc tệp CSV/TXT. Mỗi dòng một em, tên và ghi chú ngăn cách bằng
 * dấu | , tab, dấu chấm phẩy, dấu hai chấm hoặc dấu phẩy. Dòng đầu là tiêu đề ("Tên, Ghi chú") sẽ tự bỏ qua.
 */
export function parseStudentList(raw: string): ParseResult {
  const warnings: string[] = [];
  const lines = (raw ?? '')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const students: ParsedStudent[] = [];
  let skippedEmpty = 0;
  let cutNotes = 0;

  lines.forEach((line, idx) => {
    const sep = line.startsWith('"') ? ',' : line.includes('|') ? '|' : line.includes('\t') ? '\t' : line.includes(';') ? ';' : null;
    let cells: string[];
    if (sep) cells = splitCsvLine(line, sep);
    else {
      const colon = line.indexOf(':');
      const comma = line.indexOf(',');
      const cut = colon > 0 && (comma < 0 || colon < comma) ? colon : comma;
      cells = cut > 0 ? [line.slice(0, cut).trim(), line.slice(cut + 1).trim()] : [line];
    }
    // Bỏ số thứ tự đứng đầu ("1. Nguyễn Văn A", "2) ...").
    let ten = (cells[0] ?? '').replace(/^\d{1,3}\s*[.)-]\s+/, '').trim();
    let ghiChu = cells.slice(1).filter(Boolean).join('; ');
    if (/^\d{1,3}$/.test(ten) && cells.length >= 3) {
      // Cột đầu là STT: lấy cột kế tiếp làm tên.
      ten = cells[1] ?? '';
      ghiChu = cells.slice(2).filter(Boolean).join('; ');
    }
    if (idx === 0 && HEADER_RE.test(ten)) return;
    if (!ten) {
      skippedEmpty++;
      return;
    }
    if (ten.length > MAX_NAME_CHARS) ten = ten.slice(0, MAX_NAME_CHARS).trim();
    if (ghiChu.length > MAX_NOTE_CHARS) {
      ghiChu = ghiChu.slice(0, MAX_NOTE_CHARS).trim();
      cutNotes++;
    }
    students.push({ ten, ghiChu });
  });

  if (skippedEmpty > 0) warnings.push(`Đã bỏ qua ${skippedEmpty} dòng không có tên.`);
  if (cutNotes > 0) warnings.push(`${cutNotes} ghi chú quá dài nên được cắt còn ${MAX_NOTE_CHARS} ký tự.`);
  if (students.length > MAX_STUDENTS_PER_RUN) {
    warnings.push(
      `Mỗi lần chỉ soạn tối đa ${MAX_STUDENTS_PER_RUN} học sinh, ${students.length - MAX_STUDENTS_PER_RUN} em cuối chưa được đưa vào. Cô/thầy soạn tiếp ở lượt sau.`,
    );
    students.length = MAX_STUDENTS_PER_RUN;
  }
  return { students, warnings };
}

/** Xuất CSV (có BOM để Excel đọc đúng tiếng Việt); chặn chèn công thức bằng dấu nháy trước ký tự = + - @. */
export function toCsv(rows: { ten: string; nhanXet: string }[]): string {
  const esc = (v: string) => {
    let s = v.replace(/\r?\n/g, ' ');
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const body = rows.map((r, i) => [String(i + 1), esc(r.ten), esc(r.nhanXet)].join(',')).join('\r\n');
  return '﻿STT,Họ và tên,Nhận xét\r\n' + body + '\r\n';
}
