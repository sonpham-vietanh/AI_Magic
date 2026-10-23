// Nhật ký thao tác quản trị (.data/audit-log.json, khóa 'audit-log'). Giới hạn 2000 mục mới nhất.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createMutex, readJsonStrict, writeJsonAtomic } from '@/lib/server/safeJson';

export const AUDIT_LIMIT = 2000;

export type AuditAction = 'role_change' | 'block' | 'unblock';

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: AuditAction;
  target: string;
  detail: { from?: string; to?: string };
}

export function auditPath(): string {
  return process.env.AUDIT_LOG_STORE_PATH || join(process.cwd(), '.data', 'audit-log.json');
}

const mutex = createMutex();

function entriesOf(raw: unknown): AuditEntry[] {
  const list = (raw as { entries?: unknown } | null)?.entries;
  return Array.isArray(list) ? (list as AuditEntry[]) : [];
}

/** Ghi một mục nhật ký; ném lỗi nếu không ghi được (thao tác quản trị không được diễn ra mà không có dấu vết). */
export async function appendAudit(input: Omit<AuditEntry, 'id' | 'at'>): Promise<AuditEntry> {
  return mutex(async () => {
    const file = auditPath();
    const raw = await readJsonStrict<{ entries?: AuditEntry[] }>(file, () => ({ entries: [] }));
    const entry: AuditEntry = { id: randomUUID(), at: new Date().toISOString(), ...input };
    await writeJsonAtomic(file, { entries: [entry, ...entriesOf(raw)].slice(0, AUDIT_LIMIT) });
    return entry;
  });
}

export async function listAudit(opts: { q?: string; page?: number; pageSize?: number } = {}) {
  const raw = await readJsonStrict<{ entries?: AuditEntry[] }>(auditPath(), () => ({ entries: [] }));
  let all = entriesOf(raw);
  const q = (opts.q ?? '').trim().toLowerCase();
  if (q) {
    all = all.filter((e) =>
      `${e.actor} ${e.target} ${e.action} ${e.detail?.from ?? ''} ${e.detail?.to ?? ''}`.toLowerCase().includes(q),
    );
  }
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, opts.page ?? 1));
  return { entries: all.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, pages };
}
