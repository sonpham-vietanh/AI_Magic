/** Dạng hiển thị và bộ lọc của ngân hàng câu hỏi (thuần, dùng được ở trình duyệt). */
import { TT22_LEVELS, type Tt22Level } from './tt22';

export interface PublicBankItem {
  id: string;
  atomId: string;
  atomCode: string;
  atomTitle?: string;
  bloom: string;
  tt22Level: Tt22Level;
  difficultyMeasured: number | null;
  lastUsedAt: string | null;
  dok: number;
  preview: string;
  kind?: 'trac_nghiem' | 'tu_luan';
  /** Đã dùng trong đề được duyệt trong 3 năm, hoặc đang nằm trong đề chờ duyệt. */
  blocked?: boolean;
}

export type DifficultyBand = '' | 'chua_do' | 'de' | 'vua' | 'kho';
export type UsageFilter = '' | 'chua_dung' | 'da_dung' | 'dang_khoa';

export interface BankFilter {
  query: string;
  bloom: string;
  tt22: '' | Tt22Level;
  difficulty: DifficultyBand;
  usage: UsageFilter;
}

export const EMPTY_FILTER: BankFilter = { query: '', bloom: '', tt22: '', difficulty: '', usage: '' };

/** Độ khó thực đo = 1 - tỉ lệ đúng: <0,35 dễ; <0,65 vừa; còn lại khó; null = chưa đo. */
export function difficultyBand(d: number | null): Exclude<DifficultyBand, ''> {
  if (d === null || d === undefined) return 'chua_do';
  if (d < 0.35) return 'de';
  if (d < 0.65) return 'vua';
  return 'kho';
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

export function filterBank(items: PublicBankItem[], f: BankFilter): PublicBankItem[] {
  const q = fold(f.query.trim());
  return items.filter((i) => {
    if (f.bloom && i.bloom !== f.bloom) return false;
    if (f.tt22 && i.tt22Level !== f.tt22) return false;
    if (f.difficulty && difficultyBand(i.difficultyMeasured) !== f.difficulty) return false;
    if (f.usage === 'chua_dung' && i.lastUsedAt) return false;
    if (f.usage === 'da_dung' && !i.lastUsedAt) return false;
    if (f.usage === 'dang_khoa' && !i.blocked) return false;
    if (q && !fold(`${i.preview} ${i.atomCode} ${i.atomTitle ?? ''} ${i.id}`).includes(q)) return false;
    return true;
  });
}

export interface BankSummary {
  total: number;
  available: number;
  byLevel: Record<Tt22Level, { total: number; available: number }>;
  mcq: number;
}

/** Số câu theo mức TT22; "available" = còn rút được (chưa bị khoá chống trùng). */
export function summarizeBank(items: PublicBankItem[]): BankSummary {
  const byLevel = Object.fromEntries(TT22_LEVELS.map((l) => [l, { total: 0, available: 0 }])) as BankSummary['byLevel'];
  let available = 0;
  let mcq = 0;
  for (const i of items) {
    byLevel[i.tt22Level].total += 1;
    if (!i.blocked) {
      byLevel[i.tt22Level].available += 1;
      available += 1;
    }
    if (i.kind === 'trac_nghiem') mcq += 1;
  }
  return { total: items.length, available, byLevel, mcq };
}

/** Với `perCell` câu mỗi mức: các mức nào còn thiếu (chỉ xét các mức đang chọn). */
export function sufficiency(summary: BankSummary, levels: Tt22Level[], perCell: number, atoms = 1) {
  const need = perCell * atoms;
  return levels.map((l) => ({ level: l, need, have: summary.byLevel[l].available, ok: summary.byLevel[l].available >= need }));
}
