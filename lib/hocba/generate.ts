import { applyName, buildBatchPrompt, givenName, parseBatchOutput, validateComment } from './prompt';
import type { CommentResult, HocBaOptions, StudentInput } from './types';

export type LlmCaller = (
  system: string,
  user: string,
) => Promise<{ ok: boolean; content?: string; modelUsed: string; error?: string }>;

export interface BatchOutcome {
  results: CommentResult[];
  modelUsed?: string;
  /** Lỗi chung của cả lô (AI không trả lời được). */
  error?: string;
}

function resolveBatch(
  students: StudentInput[],
  raw: string,
  opts: HocBaOptions,
): { byIndex: Map<number, CommentResult> } {
  const parsed = parseBatchOutput(raw, students.length);
  const names = students.map((s) => givenName(s.ten));
  const byIndex = new Map<number, CommentResult>();
  students.forEach((s, i) => {
    const text = parsed.get(i + 1);
    if (!text) return;
    const others = names.filter((_, j) => j !== i);
    // Ghép tên TRƯỚC khi kiểm tra: nếu AI tự chèn tên người khác vào thì bắt được.
    const filled = opts.xungHo === 'ten' ? applyName(text, s.ten) : text.replace(/\{TEN\}/g, 'Em');
    byIndex.set(i + 1, { id: s.id, text: filled, issues: validateComment(filled, s.ghiChu, opts, others) });
  });
  return { byIndex };
}

/**
 * Soạn nhận xét cho một lô học sinh. Tên học sinh không đi vào prompt. Mục nào lỗi nặng hoặc thiếu sẽ được
 * soạn lại đúng một lần trong cùng lượt (không tính thêm hạn mức).
 */
export async function generateBatch(
  students: StudentInput[],
  opts: HocBaOptions,
  callLlm: LlmCaller,
): Promise<BatchOutcome> {
  const first = buildBatchPrompt(students, opts);
  const r1 = await callLlm(first.system, first.user);
  if (!r1.ok || !r1.content) {
    return { results: [], modelUsed: r1.modelUsed, error: r1.error || 'AI chưa trả lời được.' };
  }
  const { byIndex } = resolveBatch(students, r1.content, opts);

  const retryIdx: number[] = [];
  students.forEach((_, i) => {
    const r = byIndex.get(i + 1);
    if (!r || r.issues?.some((x) => x.blocking)) retryIdx.push(i);
  });

  if (retryIdx.length > 0) {
    const sub = retryIdx.map((i) => students[i]);
    const p = buildBatchPrompt(sub, opts, true);
    try {
      const r2 = await callLlm(p.system, p.user);
      if (r2.ok && r2.content) {
        const second = resolveBatch(sub, r2.content, opts).byIndex;
        retryIdx.forEach((origIdx, k) => {
          const cand = second.get(k + 1);
          if (!cand) return;
          const old = byIndex.get(origIdx + 1);
          const oldBlocking = old?.issues?.filter((x) => x.blocking).length ?? 99;
          const newBlocking = cand.issues?.filter((x) => x.blocking).length ?? 0;
          if (!old || newBlocking <= oldBlocking) byIndex.set(origIdx + 1, cand);
        });
      }
    } catch {
      /* giữ kết quả lần đầu */
    }
  }

  const results: CommentResult[] = students.map((s, i) => {
    const r = byIndex.get(i + 1);
    return r ?? { id: s.id, error: 'AI chưa viết được nhận xét cho em này, cô/thầy bấm "Tạo lại".' };
  });
  return { results, modelUsed: r1.modelUsed };
}
