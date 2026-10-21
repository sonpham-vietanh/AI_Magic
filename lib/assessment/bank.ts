import { fetchSupabaseAtomDetail, type SupabaseQuestion } from '@/lib/supabase';
import { isLetterOnly, parseInlineChoices } from './choices';
import { bloomToTt22, type Bloom } from './tt22';
import { mutateOrg, readOrg } from './store';
import type { BankItem, OrgData } from './types';

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** do_kho/dok -> Bloom. dok>=3 => Phân tích; dok=4 => Đánh giá. */
export function deriveBloom(doKho: string, dok: number): Bloom {
  if (dok >= 4) return 'Đánh giá';
  if (dok >= 3) return 'Phân tích';
  const f = fold(doKho || '');
  if (f.includes('nhan biet')) return 'Nhớ';
  if (f.includes('thong hieu')) return 'Hiểu';
  if (f.includes('van dung')) return 'Vận dụng';
  return dok === 2 ? 'Hiểu' : dok === 1 ? 'Nhớ' : 'Vận dụng';
}

export function lastUsedOf(org: OrgData, questionId: string): string | null {
  let best: string | null = null;
  for (const u of org.usage) {
    if (u.questionId === questionId && (!best || u.usedAt > best)) best = u.usedAt;
  }
  return best;
}

export function measuredDifficulty(org: OrgData, questionId: string): number | null {
  const r = org.results[questionId];
  if (!r || r.n <= 0) return null;
  return Math.round((1 - r.correct / r.n) * 100) / 100;
}

export function normalizeQuestion(
  q: SupabaseQuestion,
  atomId: string,
  atomCode: string,
  org: OrgData,
): BankItem {
  const bloom = deriveBloom(q.do_kho, q.dok);
  const options = Array.isArray(q.nhieu)
    ? q.nhieu.map((d) => (d?.noiDung || '').trim()).filter(Boolean)
    : [];
  let noiDung = q.noi_dung || '';
  let finalOptions = options;
  // Dữ liệu thật: phương án nằm trong noi_dung, cột "nhieu" chỉ có nhãn chữ cái -> tách từ nội dung.
  if (finalOptions.length < 2 || isLetterOnly(finalOptions)) {
    const parsed = parseInlineChoices(noiDung);
    if (parsed) {
      noiDung = parsed.stem || noiDung;
      finalOptions = parsed.options;
    } else {
      finalOptions = [];
    }
  }
  return {
    id: String(q.id),
    atomId,
    atomCode,
    bloom,
    tt22Level: bloomToTt22(bloom) ?? 'van_dung',
    difficultyMeasured: measuredDifficulty(org, String(q.id)),
    lastUsedAt: lastUsedOf(org, String(q.id)),
    doKho: q.do_kho,
    dok: q.dok,
    noiDung,
    dapAn: q.dap_an || '',
    loiGiai: q.loi_giai || '',
    options: finalOptions,
  };
}

/** Lấy ngân hàng câu hỏi của một atom, gắn thống kê dùng/đo từ store của org. */
export async function loadBank(
  orgId: string,
  atomId: string,
): Promise<{ atomCode: string; atomTitle: string; found: boolean; items: BankItem[] }> {
  const [detail, org] = await Promise.all([fetchSupabaseAtomDetail(atomId), readOrg(orgId)]);
  if (!detail.atom) return { atomCode: atomId, atomTitle: atomId, found: false, items: [] };
  const code = detail.atom.code || atomId;
  return {
    atomCode: code,
    atomTitle: detail.atom.title || code,
    found: true,
    items: (detail.questions || []).map((q) => normalizeQuestion(q, detail.atom!.id, code, org)),
  };
}

/** Ghi kết quả làm bài của HS để tính độ khó thực đo. */
export function recordResult(orgId: string, questionId: string, correct: boolean): Promise<void> {
  return mutateOrg(orgId, (org) => {
    const r = org.results[questionId] ?? { n: 0, correct: 0 };
    r.n += 1;
    if (correct) r.correct += 1;
    org.results[questionId] = r;
  });
}

/** Bản rút gọn để trả danh sách: KHÔNG kèm đáp án/lời giải, chỉ xem trước đề. */
export function toPublicBankItem(i: BankItem, extra: { blocked?: boolean; atomTitle?: string } = {}) {
  return {
    id: i.id,
    atomId: i.atomId,
    atomCode: i.atomCode,
    ...(extra.atomTitle ? { atomTitle: extra.atomTitle } : {}),
    bloom: i.bloom,
    tt22Level: i.tt22Level,
    difficultyMeasured: i.difficultyMeasured,
    lastUsedAt: i.lastUsedAt,
    dok: i.dok,
    kind: i.options.length >= 2 ? ('trac_nghiem' as const) : ('tu_luan' as const),
    blocked: !!extra.blocked,
    preview: i.noiDung.length > 140 ? `${i.noiDung.slice(0, 140)}…` : i.noiDung,
  };
}
