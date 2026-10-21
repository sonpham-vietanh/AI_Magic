// Kiểm tra cấu trúc XÁC ĐỊNH (hàm thuần, không gọi AI) cho kế hoạch bài dạy, đề kiểm tra, quiz.
import type { StructureCheck } from '@/lib/resources/types';

const plain = (s: string) => s.normalize('NFC').replace(/[#*_`>|]/g, ' ').replace(/[ \t]+/g, ' ');

const ACTIVITIES = [
  { id: 'hd_mo_dau', label: 'Hoạt động 1: Mở đầu', kw: 'mở đầu' },
  { id: 'hd_hinh_thanh', label: 'Hoạt động 2: Hình thành kiến thức mới', kw: 'hình thành kiến thức' },
  { id: 'hd_luyen_tap', label: 'Hoạt động 3: Luyện tập', kw: 'luyện tập' },
  { id: 'hd_van_dung', label: 'Hoạt động 4: Vận dụng', kw: 'vận dụng' },
] as const;

const PARTS = [
  { re: /(^|[\s(-])a\s*[).]\s*mục tiêu/i, name: 'a) Mục tiêu' },
  { re: /(^|[\s(-])b\s*[).]\s*nội dung/i, name: 'b) Nội dung' },
  { re: /(^|[\s(-])c\s*[).]\s*sản phẩm/i, name: 'c) Sản phẩm' },
  { re: /(^|[\s(-])d\s*[).]\s*tổ chức thực hiện/i, name: 'd) Tổ chức thực hiện' },
] as const;

/** Một dòng tiêu đề hoạt động: "Hoạt động 1: Mở đầu" hoặc "1. Mở đầu". */
function activityRe(kw: string): RegExp {
  return new RegExp(`^\\s*(?:hoạt động\\s*\\d*|\\d+)\\s*[.:)\\-–]*\\s*(?:hoạt động\\s*)?${kw}`, 'i');
}

/** Kiểm tra cấu trúc KHBD theo Phụ lục IV / CV 5512 (kèm bậc Bloom đã chọn). */
export function checkKhbdStructure(text: string, bloomLevels: string[] = []): StructureCheck[] {
  const checks: StructureCheck[] = [];
  const lines = plain(text).split('\n');
  const head = lines.filter((l) => l.trim()).slice(0, 6).join('\n');
  const titleOk = head.includes('KẾ HOẠCH BÀI DẠY');
  checks.push({
    id: 'tieu_de',
    label: 'Tiêu đề "KẾ HOẠCH BÀI DẠY"',
    ok: titleOk,
    note: titleOk ? undefined : 'Thiếu tiêu đề đúng chính tả "KẾ HOẠCH BÀI DẠY"',
  });

  const find = (re: RegExp) => lines.findIndex((l) => re.test(l));
  const iMuc = find(/^\s*I\s*[.)]\s*mục tiêu/i);
  const iThietBi = find(/^\s*II\s*[.)]\s*thiết bị/i);
  const iTienTrinh = find(/^\s*III\s*[.)]\s*tiến trình/i);

  const mucText =
    iMuc >= 0 ? lines.slice(iMuc, iThietBi > iMuc ? iThietBi : iMuc + 40).join('\n').toLowerCase() : '';
  const missMuc = ['kiến thức', 'năng lực', 'phẩm chất'].filter((k) => !mucText.includes(k));
  checks.push({
    id: 'muc_tieu',
    label: 'I. Mục tiêu (kiến thức, năng lực, phẩm chất)',
    ok: iMuc >= 0 && missMuc.length === 0,
    note: iMuc < 0 ? 'Thiếu mục "I. Mục tiêu"' : missMuc.length ? `Mục tiêu thiếu: ${missMuc.join(', ')}` : undefined,
  });
  checks.push({
    id: 'thiet_bi',
    label: 'II. Thiết bị dạy học và học liệu',
    ok: iThietBi >= 0,
    note: iThietBi >= 0 ? undefined : 'Thiếu mục "II. Thiết bị dạy học và học liệu"',
  });
  checks.push({
    id: 'tien_trinh',
    label: 'III. Tiến trình dạy học',
    ok: iTienTrinh >= 0,
    note: iTienTrinh >= 0 ? undefined : 'Thiếu mục "III. Tiến trình dạy học"',
  });

  const from = iTienTrinh >= 0 ? iTienTrinh + 1 : 0;
  const pos: { idx: number; li: number }[] = [];
  let extra = 0;
  ACTIVITIES.forEach((a, idx) => {
    const re = activityRe(a.kw);
    const hits = lines.map((l, li) => (li >= from && re.test(l) ? li : -1)).filter((x) => x >= 0);
    if (hits.length) pos.push({ idx, li: hits[0] });
    if (hits.length > 1) extra += hits.length - 1;
  });
  const ordered = [...pos].sort((x, y) => x.li - y.li);
  const inOrder = ordered.every((p, i) => p.idx === i);
  const four = pos.length === 4 && extra === 0 && inOrder;
  checks.push({
    id: 'dung_4_hoat_dong',
    label: 'Đúng 4 hoạt động (Mở đầu, Hình thành kiến thức mới, Luyện tập, Vận dụng)',
    ok: four,
    note: four
      ? undefined
      : `Tìm thấy ${pos.length}/4 hoạt động${extra ? `, có ${extra} tiêu đề hoạt động bị lặp` : ''}${
          pos.length === 4 && !inOrder ? ', sai thứ tự' : ''
        }; thiếu: ${ACTIVITIES.filter((_, i) => !pos.some((p) => p.idx === i)).map((a) => a.kw).join(', ') || 'không'}`,
  });

  ACTIVITIES.forEach((a, i) => {
    const me = pos.find((p) => p.idx === i);
    const label = `${a.label}: đủ a) Mục tiêu b) Nội dung c) Sản phẩm d) Tổ chức thực hiện`;
    if (!me) {
      checks.push({ id: `${a.id}_abcd`, label, ok: false, note: 'Không có hoạt động này' });
      return;
    }
    const next = ordered.find((p) => p.li > me.li);
    const block = lines.slice(me.li, next ? next.li : lines.length).join('\n');
    const miss = PARTS.filter((p) => !p.re.test(block)).map((p) => p.name);
    checks.push({ id: `${a.id}_abcd`, label, ok: miss.length === 0, note: miss.length ? `Thiếu ${miss.join(', ')}` : undefined });
  });

  const low = plain(text).toLowerCase();
  const hasPt = low.includes('phân tích');
  checks.push({
    id: 'bloom_phan_tich',
    label: 'Có nhắc bậc Bloom "Phân tích"',
    ok: hasPt,
    note: hasPt ? undefined : 'Chưa nhắc tới bậc "Phân tích"',
  });
  if (bloomLevels.length) {
    const miss = bloomLevels.filter((b) => !low.includes(b.toLowerCase()));
    checks.push({
      id: 'bloom_phu',
      label: `Phủ các bậc Bloom đã chọn (${bloomLevels.join(', ')})`,
      ok: miss.length === 0,
      note: miss.length ? `Chưa nhắc: ${miss.join(', ')}` : undefined,
    });
  }
  return checks;
}

/** Danh sách mục còn thiếu, dùng để yêu cầu AI bổ sung. */
export function missingItems(checks: StructureCheck[]): string[] {
  return checks.filter((c) => !c.ok).map((c) => `${c.label}${c.note ? ` — ${c.note}` : ''}`);
}

interface MatrixLike {
  totalPoints?: number;
  pointsPerQuestion?: number;
  rows?: unknown[];
  totalSelected?: number;
  totalTarget?: number;
  shortfall?: string[];
}

/** Kiểm tra đề kiểm tra: có ma trận, tổng 10 điểm, đủ số câu. Đọc kết quả draftExam. */
export function checkExamStructure(matrix: unknown, markdown: string): StructureCheck[] {
  const m = (matrix ?? {}) as MatrixLike;
  const hasRows = Array.isArray(m.rows) && m.rows.length > 0;
  const printed = /ma trận/i.test(markdown);
  const selected = Number(m.totalSelected ?? 0);
  const target = Number(m.totalTarget ?? 0);
  // Tổng điểm lấy từ các hàng của ma trận (đã chia bằng allocatePoints, chính xác tới 0,01), không dùng dung sai rộng.
  const rowPts = Array.isArray(m.rows) ? (m.rows as { points?: unknown }[]).map((r) => Number(r?.points)) : [];
  const total = rowPts.length && rowPts.every(Number.isFinite)
    ? rowPts.reduce((a, b) => a + b, 0)
    : selected * Number(m.pointsPerQuestion ?? 0);
  const sum10 = selected > 0 && Math.abs(total - 10) < 0.005 && Number(m.totalPoints) === 10;
  const short = m.shortfall ?? [];
  const enough = selected > 0 && selected >= target && short.length === 0;
  return [
    {
      id: 'ma_tran',
      label: 'Có ma trận đề (nguyên tử × mức TT 22/2021)',
      ok: hasRows && printed,
      note: hasRows ? (printed ? undefined : 'Văn bản đề chưa in ma trận') : 'Chưa có ma trận',
    },
    {
      id: 'tong_10_diem',
      label: 'Tổng điểm 10',
      ok: sum10,
      note: sum10 ? undefined : `Tổng điểm hiện tại: ${Math.round(total * 100) / 100}`,
    },
    {
      id: 'du_cau',
      label: 'Đủ số câu theo ma trận',
      ok: enough,
      note: enough ? undefined : `Chọn ${selected}/${target} câu. ${short.slice(0, 3).join(' ')}`.trim(),
    },
  ];
}

export function checkQuizStructure(questionIds: string[], bloomLevels: string[]): StructureCheck[] {
  return [
    {
      id: 'co_cau_hoi',
      label: 'Có câu hỏi lấy từ Ngân hàng câu hỏi',
      ok: questionIds.length > 0,
      note: questionIds.length ? `${questionIds.length} câu (bậc ${bloomLevels.join(', ')})` : 'Chưa có câu hỏi phù hợp',
    },
  ];
}
