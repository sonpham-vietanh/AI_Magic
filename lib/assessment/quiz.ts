import { loadBank } from './bank';
import { BLOOM_ORDER, normalizeBloom, type Bloom } from './tt22';
import { now } from './store';
import type { BankItem } from './types';

export type Language = 'vi' | 'en' | 'song_ngu';

export function seededShuffle<T>(arr: T[], seedStr: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  let s = h >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function languageNote(language: Language): string | null {
  if (language === 'vi') return null;
  return language === 'en'
    ? 'Bản tiếng Anh: chưa có bản dịch (hiển thị bản tiếng Việt gốc).'
    : 'Song ngữ: chưa có bản dịch tiếng Anh (hiển thị bản tiếng Việt gốc).';
}

export function renderQuestion(i: number, noiDung: string, options: string[]): string {
  const opts = options.length
    ? '\n' + options.map((o, k) => `   ${String.fromCharCode(65 + k)}. ${o}`).join('\n')
    : '';
  return `Câu ${i}. ${noiDung}${opts}`;
}

/** Chọn count câu theo các bậc Bloom; thiếu thì lấy bậc gần nhất và trả cảnh báo. */
export function pickByLevels(
  pool: BankItem[],
  levels: Bloom[],
  count: number,
  seed: string,
): { picked: BankItem[]; warnings: string[] } {
  const warnings: string[] = [];
  const shuffled = seededShuffle(pool, seed);
  const want = new Set(levels);
  const picked: BankItem[] = shuffled.filter((q) => want.has(q.bloom)).slice(0, count);
  if (picked.length < count) {
    const idx = levels.map((l) => BLOOM_ORDER.indexOf(l));
    const dist = (q: BankItem) =>
      Math.min(...idx.map((k) => Math.abs(k - BLOOM_ORDER.indexOf(q.bloom))));
    const rest = shuffled
      .filter((q) => !picked.includes(q))
      .sort((a, b) => dist(a) - dist(b));
    const fill = rest.slice(0, count - picked.length);
    if (fill.length) {
      warnings.push(
        `Ngân hàng chỉ có ${picked.length} câu đúng bậc ${levels.join(', ')}; đã bổ sung ${fill.length} câu ở bậc gần nhất (${[...new Set(fill.map((q) => q.bloom))].join(', ')}).`,
      );
    }
    picked.push(...fill);
  }
  if (picked.length < count) {
    warnings.push(`Ngân hàng chỉ có ${picked.length}/${count} câu cho nguyên tử này.`);
  }
  return { picked, warnings };
}

export async function generateQuiz(p: {
  orgId: string;
  atomId: string;
  bloomLevels: string[];
  language: Language;
  style: string;
  count?: number;
}): Promise<{ sections: { heading: string; body: string }[]; markdown: string; questionIds: string[] }> {
  const count = Math.max(1, Math.min(10, Math.floor(p.count ?? 5)));
  const levels = p.bloomLevels.map(normalizeBloom).filter((b): b is Bloom => !!b);
  const effective: Bloom[] = levels.length ? [...new Set(levels)] : ['Nhớ', 'Hiểu', 'Vận dụng'];

  const bank = await loadBank(p.orgId, p.atomId);
  const notes: string[] = [];
  if (!bank.found) notes.push(`Không tìm thấy nguyên tử "${p.atomId}" trong kho tri thức.`);
  if (bank.found && bank.items.length === 0) notes.push('Nguyên tử này chưa có câu hỏi trong ngân hàng.');
  if (p.bloomLevels.length > levels.length) {
    notes.push('Một số bậc Bloom không nhận diện được và đã bị bỏ qua.');
  }
  const ln = languageNote(p.language);
  if (ln) notes.push(ln);

  // Quiz không lưu: hạt giống theo phút để mỗi lần sinh lại có thể khác nhau.
  const seed = `${p.orgId}|${p.atomId}|${Math.floor(now().getTime() / 60000)}|${p.style}`;
  const { picked, warnings } = pickByLevels(bank.items, effective, count, seed);
  notes.push(...warnings);

  const questions = picked.map((q, i) => renderQuestion(i + 1, q.noiDung, q.options)).join('\n\n');
  const answers = picked
    .map(
      (q, i) =>
        `Câu ${i + 1} [${q.bloom}]: ${q.dapAn || '(chưa có đáp án)'}${q.loiGiai ? `\n   Giải thích: ${q.loiGiai}` : ''}`,
    )
    .join('\n\n');

  const sections = [
    {
      heading: 'Câu hỏi',
      body: (notes.length ? notes.map((n) => `Lưu ý: ${n}`).join('\n') + '\n\n' : '') +
        (questions || '(Chưa có câu hỏi phù hợp.)'),
    },
    { heading: 'Đáp án & giải thích (cho GV)', body: answers || '(Không có.)' },
  ];
  const markdown =
    `# Quiz củng cố trong tiết — ${bank.atomCode}\n` +
    `> Bậc Bloom: ${effective.join(', ')} · Không cần duyệt · Dùng ngay trong giờ, không lưu.\n\n` +
    sections.map((s) => `## ${s.heading}\n${s.body}`).join('\n\n');
  return { sections, markdown, questionIds: picked.map((q) => q.id) };
}
