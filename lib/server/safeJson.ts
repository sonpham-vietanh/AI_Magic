// Đọc/ghi tệp JSON AN TOÀN cho mọi kho dữ liệu cục bộ (`.data/*.json`).
// Quy tắc cứng rút ra từ đợt rà soát:
//  1. CHỈ "tệp chưa tồn tại" (ENOENT) mới được coi là rỗng. Mọi lỗi đọc khác (EBUSY, EMFILE, EACCES, EIO...) là lỗi
//     thoáng qua: PHẢI ném lỗi, tuyệt đối không trả rỗng, vì lần ghi kế tiếp sẽ xoá sạch dữ liệu thật.
//  2. JSON hỏng thật: đổi tên tệp sang `.corrupt-<ts>` để người vận hành khôi phục rồi mới bắt đầu lại; nếu không sao
//     lưu được thì ném lỗi chứ không ghi đè.
//  3. Lỗi ghi PHẢI ném lên (API trả 500), không được nuốt rồi báo thành công.
//  4. Tên tệp tạm duy nhất (pid + uuid), thử lại khi Windows báo EPERM/EBUSY/EACCES do chương trình khác đang giữ tệp.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { readCloudStore, resolveCloudStoreKey, writeCloudStore } from './supabaseStore';

export class StoreReadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StoreReadError';
  }
}

export class StoreWriteError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StoreWriteError';
  }
}

const codeOf = (err: unknown): string => String((err as NodeJS.ErrnoException | undefined)?.code ?? 'UNKNOWN');
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Đọc tệp JSON. `fallback` chỉ được dùng khi tệp chưa có hoặc JSON hỏng đã được sao lưu. */
export async function readJsonStrict<T>(file: string, fallback: () => T): Promise<T> {
  const cloudKey = resolveCloudStoreKey(file);
  if (cloudKey) {
    const cloud = await readCloudStore<T>(cloudKey);
    if (cloud.found && cloud.data !== undefined) {
      return cloud.data;
    }
  }

  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if (codeOf(err) === 'ENOENT') return fallback();
    throw new StoreReadError(`Không đọc được kho dữ liệu (${codeOf(err)}); đã dừng để không ghi đè dữ liệu thật.`, {
      cause: err,
    });
  }
  try {
    const parsed = JSON.parse(raw) as T;
    // Tự động đồng bộ lần đầu từ đĩa cục bộ lên bảng mới trên Supabase nếu đám mây chưa có bản ghi này.
    if (cloudKey) {
      void writeCloudStore(cloudKey, parsed).catch(() => undefined);
    }
    return parsed;
  } catch {
    const backup = `${file}.corrupt-${Date.now()}`;
    try {
      await rename(file, backup);
    } catch (err) {
      throw new StoreReadError(`Kho dữ liệu hỏng và không sao lưu được (${codeOf(err)}); đã dừng để không ghi đè.`, {
        cause: err,
      });
    }
    console.error(`[store] JSON hỏng, đã sao lưu sang ${backup}`);
    return fallback();
  }
}

/** Ghi nguyên tử (tệp tạm rồi đổi tên) kết hợp đồng bộ bảng mới trên Supabase. Ném StoreWriteError khi thất bại. */
export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const cloudKey = resolveCloudStoreKey(file);
  const cloudPromise = cloudKey ? writeCloudStore(cloudKey, data) : Promise.resolve(null);

  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let localErr: unknown = null;
  try {
    const text = JSON.stringify(data);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(tmp, text, 'utf8');
    for (let i = 0; ; i++) {
      try {
        await rename(tmp, file);
        break;
      } catch (err) {
        const c = codeOf(err);
        if (i < 4 && (c === 'EPERM' || c === 'EBUSY' || c === 'EACCES')) {
          await sleep(40 * (i + 1));
          continue;
        }
        throw err;
      }
    }
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => undefined);
    localErr = err;
  }

  const cloudRes = await cloudPromise;
  if (localErr) {
    // Trên môi trường serverless chỉ đọc (EROFS), nếu đã ghi thành công lên Supabase thì vẫn hoàn tất.
    if (cloudRes?.ok && codeOf(localErr) === 'EROFS') {
      return;
    }
    throw new StoreWriteError(`Không ghi được kho dữ liệu (${codeOf(localErr)}).`, { cause: localErr });
  }
}

/** Khoá tuần tự trong một tiến trình. Lỗi của một tác vụ không làm hỏng hàng đợi. */
export function createMutex(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn);
    tail = run.catch(() => undefined);
    return run;
  };
}
