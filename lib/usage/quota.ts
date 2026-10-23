// Hạn mức lượt soạn và bọc ngữ cảnh đo lường cho các route.
// "Lượt soạn" = một lần người dùng bấm soạn mà có ÍT NHẤT MỘT lời gọi AI thật thành công. Lượt lấy thẳng từ Kho
// (không gọi AI) và lời gọi AI trúng bộ nhớ đệm không tính. Hạn mức chỉ chặn ở lần gọi AI thật đầu tiên của lượt.
import { randomUUID } from 'node:crypto';
import { readSessionFromRequest } from '@/lib/server/sessionToken';
import { runWithUsageContext, type UsageContext, type UsageRecordInput } from './context';
import { ANON_USER, appendUsage, monthKeyOf, normalizeUser, readLedger, todayKey, type LedgerStore } from './ledger';

// Mặc định KHÔNG giới hạn lượt soạn của giáo viên (0). Việc đo token và chi phí vẫn chạy để quản trị theo dõi.
// Muốn đặt trần theo người thì đặt biến USAGE_DAILY_LIMIT (ví dụ 40).
export const DEFAULT_DAILY_LIMIT = 0;

/** 0 = không giới hạn. */
export function dailyLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.USAGE_DAILY_LIMIT?.trim();
  if (raw === undefined || raw === '') return DEFAULT_DAILY_LIMIT;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_LIMIT;
}

/** Ngân sách tháng (USD). 0 = không đặt. Chỉ cảnh báo, không chặn. */
export function monthlyBudgetUsd(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.USAGE_MONTHLY_BUDGET_USD?.trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function quotaMessage(limit: number): string {
  return `Cô/thầy đã dùng hết ${limit} lượt soạn bằng AI hôm nay. Hạn mức được làm mới vào 0 giờ ngày mai. Trong lúc chờ, cô/thầy vẫn lấy được các bản chuẩn đã duyệt trong Kho học liệu (không tính lượt); cần thêm lượt xin liên hệ quản trị viên.`;
}

/** Danh tính để tính hạn mức: email trong phiên đăng nhập, nếu không có thì thông tin tự khai, cuối cùng là 'khách'. */
export function resolveUsageUser(request: Request, declared?: string | null): string {
  try {
    const s = readSessionFromRequest(request);
    if (s?.email) return normalizeUser(s.email);
  } catch {
    // bỏ qua
  }
  return normalizeUser(declared || ANON_USER);
}

/** Số lượt soạn đã dùng trong ngày (đếm runId khác nhau có ít nhất một lời gọi thành công). */
export function countRuns(store: LedgerStore, user: string, day: string): number {
  const ids = new Set<string>();
  let loose = 0;
  for (const r of store.rows) {
    if (r.day !== day || r.user !== user || !r.ok) continue;
    if (r.runId) ids.add(r.runId);
    else loose += 1;
  }
  return ids.size + loose;
}

export interface MyUsage {
  today: { used: number; limit: number };
  month: { runs: number; tokens: number };
}

export function summarizeMine(store: LedgerStore, user: string, now = Date.now()): MyUsage {
  const day = todayKey(now);
  const month = monthKeyOf(day);
  const ids = new Set<string>();
  let tokens = 0;
  for (const r of store.rows) {
    if (r.user !== user || monthKeyOf(r.day) !== month) continue;
    tokens += r.promptTokens + r.completionTokens;
    if (r.ok) ids.add(`${r.day}|${r.runId}`);
  }
  let runs = ids.size;
  for (const r of store.rollups) {
    if (r.user !== user || monthKeyOf(r.day) !== month) continue;
    runs += r.runs;
    tokens += r.promptTokens + r.completionTokens;
  }
  return { today: { used: countRuns(store, user, day), limit: dailyLimit() }, month: { runs, tokens } };
}

const inflight = new Map<string, number>();

export interface UsageHandle {
  /** Trả thông tin nếu lượt này bị từ chối vì hết hạn mức; ngược lại null. */
  exceeded(): { used: number; limit: number; message: string } | null;
  runId: string;
  user: string;
}

/**
 * Chạy `fn` trong ngữ cảnh đo lường: mọi lời gọi AI bên trong được ghi sổ theo người dùng + công cụ, và lời gọi AI thật
 * đầu tiên bị chặn nếu người dùng đã hết hạn mức ngày. Sau khi `fn` xong, route nên kiểm tra `handle.exceeded()`.
 */
export async function withUsage<T>(
  request: Request,
  opts: { workflow: string; declaredUser?: string | null },
  fn: (handle: UsageHandle) => Promise<T>,
): Promise<T> {
  const user = resolveUsageUser(request, opts.declaredUser);
  const runId = `u_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
  let admitted = false;
  let refused: { used: number; limit: number } | null = null;

  const ctx: UsageContext = {
    user,
    workflow: opts.workflow,
    runId,
    async gate() {
      if (admitted) return true;
      if (refused) return false;
      const limit = dailyLimit();
      if (limit > 0) {
        let used = 0;
        try {
          used = countRuns(await readLedger(), user, todayKey());
        } catch (e) {
          // Không đọc được sổ thì không chặn oan giáo viên.
          console.error('[usage] không đọc được sổ để kiểm hạn mức:', e instanceof Error ? e.message : e);
        }
        const others = inflight.get(user) ?? 0;
        if (used + others >= limit) {
          refused = { used: Math.min(used + others, limit), limit };
          return false;
        }
      }
      admitted = true;
      inflight.set(user, (inflight.get(user) ?? 0) + 1);
      return true;
    },
    async record(entry: UsageRecordInput) {
      await appendUsage({ ...entry, user, workflow: opts.workflow, runId });
    },
  };

  const handle: UsageHandle = {
    runId,
    user,
    exceeded: () => (refused ? { ...refused, message: quotaMessage(refused.limit) } : null),
  };

  try {
    return await runWithUsageContext(ctx, () => fn(handle));
  } finally {
    if (admitted) {
      const n = (inflight.get(user) ?? 1) - 1;
      if (n <= 0) inflight.delete(user);
      else inflight.set(user, n);
    }
  }
}
