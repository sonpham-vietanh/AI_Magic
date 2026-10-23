// Bộ sinh tài nguyên: 6 dạng tài nguyên + slide + worksheet. Dùng LLM thật, kiểm cấu trúc xác định, thử lại 1 lần.
import { callLiveLlm } from '@/lib/engine/llmClient';
import type { LlmErrorCode } from '@/lib/engine/llmErrors';
import { checkArtifact } from './check';
import { parseArtifact } from './parse';
import { buildPrompt, MAX_TOKENS } from './prompts';
import { RESOURCE_KINDS } from './types';
import type { Artifact, ArtifactKind, ResourceKind } from './types';

export interface GenContext {
  /** Tên bài/nguyên tử tri thức. */
  title: string;
  grade?: string;
  subject?: string;
  language: 'vi' | 'en' | 'song_ngu';
  /** Phong cách sư phạm (nhãn tiếng Việt), tuỳ chọn. */
  style?: string;
  bloomLevels: string[];
  /** Khối dữ liệu chuẩn đã chuỗi hoá (gói kiến thức, câu hỏi…) dùng làm căn cứ; xem là DỮ LIỆU, không phải chỉ dẫn. */
  grounding: string;
  /** Ghi chú thêm (ví dụ bài liên kết, sự kiện thời sự đã duyệt). */
  extra?: string;
  classContext?: string;
}

export type GenResult<T> = { ok: true; value: T; modelUsed: string } | { ok: false; error: string; code?: LlmErrorCode };

const DEFAULT_TIMEOUT = 120_000;
/**
 * Kiểm tra "mềm": AI thường viết ngắn hơn độ dài yêu cầu (đã đo thật với podcast và video). Sản phẩm vẫn dùng được
 * nên không báo lỗi cả sản phẩm; độ lệch vẫn hiện ở tab "Kiểm tra cấu trúc" để giáo viên biết.
 */
const SOFT_CHECK_IDS = new Set(['pc.duration', 'vd.sum']);
/** 6 dạng chạy song song hết: thời gian chờ bằng dạng chậm nhất thay vì cộng dồn. */
const CONCURRENCY = 6;

export async function generateArtifact<K extends ArtifactKind>(
  kind: K,
  ctx: GenContext,
  opts?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<GenResult<Artifact<K>>> {
  let fixNote: string | undefined;
  let lastError = 'Không sinh được nội dung.';
  let modelUsed = '';
  let lastCode: LlmErrorCode | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (opts?.signal?.aborted) return { ok: false, error: 'Đã huỷ.' };
    const { system, user } = buildPrompt(kind, ctx, fixNote);
    const llmOpts = {
      maxTokens: MAX_TOKENS[kind],
      timeoutMs: opts?.timeoutMs ?? DEFAULT_TIMEOUT,
      signal: opts?.signal,
    };
    const res = await callLiveLlm(system, user, undefined, llmOpts);
    modelUsed = res.modelUsed;
    if (!res.ok || !res.content) {
      lastError = `Chưa gọi được AI${res.error ? ` (${res.error})` : ''}.`;
      lastCode = res.code;
      fixNote = undefined;
      // Chưa đăng nhập AI thì thử lại cũng vô ích.
      if (res.code === 'ai_auth' || res.code === 'ai_quota') break;
      continue;
    }
    const parsed = parseArtifact(kind, res.content);
    if (!parsed.ok) {
      lastError = parsed.error;
      fixNote = parsed.error;
      continue;
    }
    const artifact = { kind, title: (parsed.value as { title: string }).title, data: parsed.value } as Artifact<K>;
    const failed = checkArtifact(artifact as Artifact).filter((c) => !c.ok);
    const hard = failed.filter((f) => !SOFT_CHECK_IDS.has(f.id));
    if (failed.length) {
      lastError = `Chưa đạt kiểm tra cấu trúc: ${failed.map((f) => `${f.label}${f.note ? ` (${f.note})` : ''}`).join('; ')}`;
      fixNote = lastError;
      // Lần đầu: thử lại 1 lần kèm lỗi cụ thể. Lần cuối: chỉ lỗi MỀM (độ dài) thì vẫn nhận, dấu ✗ hiện ở tab Kiểm tra cấu trúc.
      if (hard.length > 0 || attempt === 0) continue;
    }
    return { ok: true, value: artifact, modelUsed };
  }
  return { ok: false, error: lastError, ...(lastCode ? { code: lastCode } : {}) };
}

export async function generateAllResources(
  ctx: GenContext,
  kinds?: ResourceKind[],
  opts?: {
    signal?: AbortSignal;
    /** Gọi ngay khi từng dạng xong (để phát từng thẻ lên màn hình, không chờ đủ 6). */
    onArtifact?: (a: Artifact) => void;
    onError?: (kind: ResourceKind, error: string, code?: LlmErrorCode) => void;
  },
): Promise<{ artifacts: Artifact[]; errors: { kind: ResourceKind; error: string; code?: LlmErrorCode }[] }> {
  const list: ResourceKind[] = kinds && kinds.length ? kinds : [...RESOURCE_KINDS];
  const results: ({ a: Artifact } | { e: string; c?: LlmErrorCode })[] = new Array(list.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= list.length) return;
      try {
        const r = await generateArtifact(list[i], ctx, { signal: opts?.signal });
        results[i] = r.ok ? { a: r.value as Artifact } : { e: r.error, c: r.code };
        if (r.ok) opts?.onArtifact?.(r.value as Artifact);
        else opts?.onError?.(list[i], r.error, r.code);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Lỗi không xác định.';
        results[i] = { e: msg };
        opts?.onError?.(list[i], msg);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
  const artifacts: Artifact[] = [];
  const errors: { kind: ResourceKind; error: string; code?: LlmErrorCode }[] = [];
  results.forEach((r, i) => {
    if ('a' in r) artifacts.push(r.a);
    else errors.push({ kind: list[i], error: r.e, ...(r.c ? { code: r.c } : {}) });
  });
  return { artifacts, errors };
}

export { parseArtifact } from './parse';
export { artifactToText, checkArtifact } from './check';
export * from './types';
