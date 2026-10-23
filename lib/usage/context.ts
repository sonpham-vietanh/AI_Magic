// Ngữ cảnh đo lường cho mỗi lần soạn (một "lượt"): ai dùng, công cụ nào, có được phép gọi AI không.
// File này CHỈ chứa mã thuần (không đọc ghi tệp) vì llmClient được bundle cả phía client.
// Việc ghi sổ và hạn mức nằm ở ledger.ts / quota.ts và được truyền vào đây dưới dạng hàm.

export interface UsageRecordInput {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  estimated: boolean;
  latencyMs: number;
  ok: boolean;
}

export interface UsageContext {
  user: string;
  workflow: string;
  runId: string;
  /** Gọi trước lần gọi AI THẬT đầu tiên của lượt; trả false nếu đã hết hạn mức. */
  gate?: () => Promise<boolean>;
  /** Ghi một dòng vào sổ. Lỗi do bên gọi nuốt. */
  record?: (entry: UsageRecordInput) => Promise<void> | void;
}

type Store = {
  run<T>(store: UsageContext, fn: () => T): T;
  getStore(): UsageContext | undefined;
};

const nodeAsyncHooks = (
  typeof process !== 'undefined'
    ? (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule?.('node:async_hooks')
    : undefined
) as { AsyncLocalStorage: new () => Store } | undefined;

const store: Store = nodeAsyncHooks
  ? new nodeAsyncHooks.AsyncLocalStorage()
  : { run: (_s, fn) => fn(), getStore: () => undefined };

export function runWithUsageContext<T>(ctx: UsageContext, fn: () => T): T {
  return store.run(ctx, fn);
}

export function getUsageContext(): UsageContext | undefined {
  return store.getStore();
}
