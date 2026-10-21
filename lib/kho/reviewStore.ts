import { join } from 'node:path';
import { readJsonStrict, writeJsonAtomic } from '@/lib/server/safeJson';

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
  const parsed = await readJsonStrict<unknown>(storeFile(), () => ({}));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as ReviewData;
}

export async function writeReviews(data: ReviewData): Promise<void> {
  await writeJsonAtomic(storeFile(), data);
}
