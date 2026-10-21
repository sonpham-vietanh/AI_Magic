import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

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

  async function write(data: T): Promise<void> {
    const file = opts.file();
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(tmp, JSON.stringify(data), 'utf8');
      await rename(tmp, file);
    } catch (err) {
      console.error(`[${opts.tag}] Không ghi được file dữ liệu:`, err);
      try {
        await unlink(tmp);
      } catch {
        // ignore
      }
    }
  }

  async function read(): Promise<T> {
    const file = opts.file();
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        console.error(`[${opts.tag}] Không đọc được file dữ liệu:`, err);
      }
      return opts.empty();
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid shape');
      return opts.normalize ? opts.normalize(parsed) : (parsed as T);
    } catch (err) {
      const backup = `${file}.corrupt-${Date.now()}`;
      console.error(`[${opts.tag}] File dữ liệu hỏng JSON, sao lưu sang ${backup}:`, err);
      try {
        await rename(file, backup);
      } catch (renameErr) {
        console.error(`[${opts.tag}] Không sao lưu được file hỏng:`, renameErr);
      }
      return opts.empty();
    }
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
