// Phản hồi "Báo lỗi bản soạn" của giáo viên, lưu ở .data/feedback.json (khoá đám mây 'feedback').
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createMutex, readJsonStrict, writeJsonAtomic } from '@/lib/server/safeJson';

export const FEEDBACK_KINDS = [
  { id: 'sai_kien_thuc', label: 'Sai kiến thức hoặc số liệu' },
  { id: 'sai_cong_thuc', label: 'Công thức hiển thị sai' },
  { id: 'khong_phu_hop', label: 'Không phù hợp lớp hoặc chương trình' },
  { id: 'thieu_noi_dung', label: 'Thiếu nội dung cần có' },
  { id: 'khac', label: 'Lỗi khác' },
] as const;

export const FEEDBACK_MAX_TOTAL = 1000;
export const FEEDBACK_MAX_PER_ACTOR = 100;
export const FEEDBACK_MAX_MESSAGE = 1000;
export const FEEDBACK_MAX_EXCERPT = 1500;

export interface FeedbackContext {
  workflow?: string;
  format?: string;
  lessonTitle?: string;
  runId?: string;
  page?: string;
}

export interface FeedbackEntry {
  id: string;
  at: string;
  actor: string;
  kind: string;
  message: string;
  excerpt?: string;
  context: FeedbackContext;
}

export function feedbackPath(): string {
  return process.env.FEEDBACK_STORE_PATH || join(process.cwd(), '.data', 'feedback.json');
}

const mutex = createMutex();

function entriesOf(raw: unknown): FeedbackEntry[] {
  const list = (raw as { entries?: unknown } | null)?.entries;
  return Array.isArray(list) ? (list as FeedbackEntry[]) : [];
}

export async function addFeedback(input: Omit<FeedbackEntry, 'id' | 'at'>): Promise<FeedbackEntry> {
  return mutex(async () => {
    const file = feedbackPath();
    const raw = await readJsonStrict<{ entries?: FeedbackEntry[] }>(file, () => ({ entries: [] }));
    const all = entriesOf(raw);
    // Quá hạn mức của một người thì bỏ phản hồi cũ nhất của chính người đó để nhận phản hồi mới.
    let list = all;
    const mine = list.filter((e) => e.actor === input.actor);
    if (mine.length >= FEEDBACK_MAX_PER_ACTOR) {
      const oldest = mine[mine.length - 1];
      list = list.filter((e) => e.id !== oldest.id);
    }
    const entry: FeedbackEntry = { id: randomUUID(), at: new Date().toISOString(), ...input };
    await writeJsonAtomic(file, { entries: [entry, ...list].slice(0, FEEDBACK_MAX_TOTAL) });
    return entry;
  });
}
