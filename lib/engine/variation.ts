// "Hạt giống sinh lại": khi giáo viên bấm Sinh lại, mọi lời gọi AI trong lượt đó mang một nonce riêng
// để (1) khoá bộ nhớ đệm khác đi, (2) lời nhắc yêu cầu cách làm khác lần trước.
// Tách khỏi llmClient để các test giả lập llmClient không làm mất tính năng này.
type Store = {
  run<T>(store: string, fn: () => T): T;
  getStore(): string | undefined;
};

const hooks = (
  typeof process !== 'undefined'
    ? (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule?.('node:async_hooks')
    : undefined
) as { AsyncLocalStorage: new () => Store } | undefined;

const store: Store = hooks ? new hooks.AsyncLocalStorage() : { run: (_s, fn) => fn(), getStore: () => undefined };

export const newVariationNonce = (): string => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

export const withVariation = <T>(nonce: string | undefined, fn: () => Promise<T>): Promise<T> =>
  nonce ? store.run(nonce, fn) : fn();

export const getVariation = (): string | undefined => store.getStore();

/** Dòng thêm vào cuối lời nhắc để mô hình đưa ra bản khác lần trước. */
export const variationInstruction = (nonce: string): string =>
  `\n\n[Yêu cầu sinh lại, mã ${nonce}] Đây là lần sinh LẠI theo ý giáo viên: hãy đưa ra phương án KHÁC bản trước (ví dụ khác, cách mở bài khác, hoạt động khác), vẫn đúng kiến thức và đúng cấu trúc yêu cầu.`;
