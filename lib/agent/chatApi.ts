// Gọi hai API của ô chat hợp nhất (hỏi đáp và chỉnh bằng lời) và đổi mọi lỗi thành lời tiếng Việt thân thiện.
import { formatApiError, isAiAuthError } from '../ui/soanBai';

export interface ApiFailure {
  status: number;
  /** Mã lỗi máy chủ trả (vd 'ai_auth'). */
  code?: string;
  error?: string;
  quota?: { used: number; limit: number };
}

export const AI_AUTH_CHAT_MESSAGE =
  'AI đang tạm không đăng nhập, cô/thầy báo quản trị viên giúp. Bản nháp của cô/thầy vẫn được giữ, khi AI hoạt động lại cô/thầy bấm Thử lại là được.';

export const NETWORK_CHAT_MESSAGE =
  'Không kết nối được máy chủ. Bản nháp của cô/thầy vẫn được giữ trên máy này. Cô/thầy kiểm tra mạng rồi bấm Thử lại.';

/** Còn bao lâu nữa đến 0 giờ ngày mai (giờ Việt Nam) khi hạn mức ngày được làm mới. */
export function untilQuotaReset(now: Date = new Date()): { hours: number; minutes: number; text: string } {
  const VN = 7 * 3600_000;
  const local = now.getTime() + VN;
  const nextMidnight = Math.floor(local / 86_400_000) * 86_400_000 + 86_400_000;
  const mins = Math.max(1, Math.ceil((nextMidnight - local) / 60_000));
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  const text = hours > 0 ? `${hours} giờ ${minutes} phút nữa (0 giờ ngày mai)` : `${minutes} phút nữa (0 giờ ngày mai)`;
  return { hours, minutes, text };
}

/** Lỗi đã vượt hạn mức ngày (khác với gửi quá nhanh trong một phút). */
export function isQuotaFailure(f: ApiFailure): boolean {
  if (f.status !== 429) return false;
  if (f.quota) return true;
  return /hạn mức|lượt soạn|lượt/i.test(f.error ?? '');
}

export function failureMessage(f: ApiFailure, now: Date = new Date()): string {
  if (f.code === 'ai_auth' || isAiAuthError(f.status, f.error)) return AI_AUTH_CHAT_MESSAGE;
  if (f.status === 429) {
    if (isQuotaFailure(f)) {
      const used = f.quota ? ` (đã dùng ${f.quota.used}/${f.quota.limit} lượt)` : '';
      return `Cô/thầy đã dùng hết lượt AI hôm nay${used}. Hạn mức làm mới sau ${untilQuotaReset(now).text}. Trong lúc chờ, cô/thầy vẫn mở lại được các bản đã soạn và các bản chuẩn trong Kho.`;
    }
    return 'Cô/thầy gửi hơi nhanh nên hệ thống tạm nghỉ một chút. Đợi khoảng một phút rồi bấm Thử lại nhé.';
  }
  if (f.status === 401) return formatApiError(401);
  return formatApiError(f.status, f.status >= 500 ? undefined : f.error);
}

async function readFailure(res: Response): Promise<ApiFailure> {
  const j = (await res.json().catch(() => ({}))) as {
    error?: unknown;
    code?: unknown;
    quota?: { used?: unknown; limit?: unknown };
  };
  const quota =
    j.quota && typeof j.quota.used === 'number' && typeof j.quota.limit === 'number'
      ? { used: j.quota.used, limit: j.quota.limit }
      : undefined;
  return {
    status: res.status,
    code: typeof j.code === 'string' ? j.code : undefined,
    error: typeof j.error === 'string' ? j.error : undefined,
    quota,
  };
}

export type ChatCallResult<T> = { ok: true; data: T } | { ok: false; message: string; aborted?: boolean; failure?: ApiFailure };

export interface AssistantContext {
  classId?: string;
  /** Tên bài, môn, khối đang mở để câu trả lời sát lớp. */
  lessonTitle?: string;
  subject?: string;
  grade?: string;
  /** Vài lượt hỏi đáp gần nhất. */
  history?: { role: 'teacher' | 'assistant'; text: string }[];
  /** Trích đoạn bản soạn đang mở (nếu có). */
  currentText?: string;
}

export interface AssistantReply {
  reply: string;
  suggestions: string[];
  mode?: string;
}

export async function callAssistant(
  question: string,
  ctx: AssistantContext,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ChatCallResult<AssistantReply>> {
  try {
    const res = await fetcher('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ question, ...ctx }),
    });
    if (!res.ok) {
      const failure = await readFailure(res);
      return { ok: false, message: failureMessage(failure), failure };
    }
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; reply?: string; suggestions?: unknown; mode?: string };
    if (j.ok === false) return { ok: false, message: failureMessage({ status: 500 }) };
    return {
      ok: true,
      data: {
        reply: (j.reply ?? '').trim() || 'Mình đã nhận câu hỏi của cô/thầy nhưng chưa có câu trả lời. Cô/thầy thử hỏi lại giúp mình nhé.',
        suggestions: Array.isArray(j.suggestions) ? j.suggestions.filter((s): s is string => typeof s === 'string').slice(0, 4) : [],
        mode: j.mode,
      },
    };
  } catch {
    if (signal?.aborted) return { ok: false, message: 'Đã dừng theo yêu cầu của cô/thầy.', aborted: true };
    return { ok: false, message: NETWORK_CHAT_MESSAGE };
  }
}

export interface RefineRequest {
  instruction: string;
  text: string;
  sectionHeading?: string;
  format?: string;
  context?: { monHoc?: string; khoi?: string; lop?: string; baiDayTen?: string; phongCach?: string };
}

export async function callRefine(
  req: RefineRequest,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ChatCallResult<{ text: string; modelUsed?: string }>> {
  try {
    const res = await fetcher('/api/workflows/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const failure = await readFailure(res);
      return { ok: false, message: failureMessage(failure), failure };
    }
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; text?: string; modelUsed?: string };
    if (j.ok !== true || typeof j.text !== 'string' || !j.text.trim()) {
      return { ok: false, message: 'Mình chưa chỉnh được lần này. Cô/thầy thử nói lại ngắn gọn hơn hoặc bấm Thử lại nhé.' };
    }
    return { ok: true, data: { text: j.text, modelUsed: j.modelUsed } };
  } catch {
    if (signal?.aborted) return { ok: false, message: 'Đã dừng theo yêu cầu của cô/thầy.', aborted: true };
    return { ok: false, message: NETWORK_CHAT_MESSAGE };
  }
}
