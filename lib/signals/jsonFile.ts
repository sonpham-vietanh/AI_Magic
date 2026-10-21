import { readJsonStrict, writeJsonAtomic } from '@/lib/server/safeJson';

/**
 * JSON file store nhỏ: mutex trong tiến trình + ghi nguyên tử (tmp + rename)
 * + sao lưu file hỏng. Theo mẫu lib/server/store.ts.
 */
export function createJsonStore<T>(opts: { file: () => string; empty: () => T; tag: string; normalize?: (raw: unknown) => T }) {
  let tail: Promise<unknown> = Promise.resolve();

  function withLock<R>(fn: () => Promise<R>): Promise<R> {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  }

  // Lỗi ghi PHẢI ném lên; lỗi đọc khác ENOENT cũng ném (xem lib/server/safeJson.ts).
  async function write(data: T): Promise<void> {
    await writeJsonAtomic(opts.file(), data);
  }

  async function read(): Promise<T> {
    const parsed = await readJsonStrict<unknown>(opts.file(), () => null);
    if (!parsed || typeof parsed !== 'object') return opts.empty();
    return opts.normalize ? opts.normalize(parsed) : (parsed as T);
  }

  /** Đọc-sửa-ghi tuần tự. */
  function update<R>(fn: (data: T) => R | Promise<R>): Promise<R> {
    return withLock(async () => {
      const data = await read();
      const result = await fn(data);
      await write(data);
      return result;
    });
  }

  return { read, update, withLock };
}
