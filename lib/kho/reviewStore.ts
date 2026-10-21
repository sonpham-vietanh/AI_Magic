import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface KhoReview {
  reviewer: string;
  reviewedAt: string;
  scores: Record<string, number>;
  average: number;
  note?: string;
  decision: 'approve' | 'reject';
}

/** key = `${orgId}::${atomId}`; mảng lịch sử, phần tử cuối là bản mới nhất. */
export type ReviewData = Record<string, KhoReview[]>;

function storeFile(): string {
  return process.env.KHO_REVIEWS_FILE || join(process.cwd(), '.data', 'kho-reviews.json');
}

export const reviewKey = (orgId: string, atomId: string) => `${orgId}::${atomId}`;

let mutexTail: Promise<unknown> = Promise.resolve();

export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutexTail.then(fn, fn);
  mutexTail = run.catch(() => undefined);
  return run;
}

export async function readReviews(): Promise<ReviewData> {
  const file = storeFile();
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.error('[kho] Không đọc được file duyệt:', err);
    }
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid shape');
    return parsed as ReviewData;
  } catch (err) {
    const backup = `${file}.corrupt-${Date.now()}`;
    console.error(`[kho] File duyệt hỏng JSON, sao lưu sang ${backup}:`, err);
    try {
      await rename(file, backup);
    } catch (renameErr) {
      console.error('[kho] Không sao lưu được file hỏng:', renameErr);
    }
    return {};
  }
}

export async function writeReviews(data: ReviewData): Promise<void> {
  const file = storeFile();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await rename(tmp, file);
  } catch (err) {
    try {
      await unlink(tmp);
    } catch {
      // ignore
    }
    // Ghi kết quả duyệt thất bại phải báo lỗi, không được im lặng.
    throw err;
  }
}
