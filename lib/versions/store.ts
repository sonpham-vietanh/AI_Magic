import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readJsonStrict, writeJsonAtomic } from '@/lib/server/safeJson';
import {
  MAX_ARTIFACTS_BYTES,
  MAX_TEXT_BYTES,
  MAX_VERSIONS_PER_ACTOR,
  MAX_VERSIONS_PER_ORG,
  type VersionInput,
  type VersionRecord,
  type VersionSummary,
} from './types';

// Lưu phía máy chủ trong .data/versions.json theo mẫu lib/server/store.ts.
// Tên người dùng (actor) chỉ là khai báo, CHƯA phải đăng nhập thật.

interface VersionStoreData {
  versions: VersionRecord[];
}

export class VersionLimitError extends Error {}

function storeFile(): string {
  return join(process.cwd(), '.data', 'versions.json');
}

let mutexTail: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutexTail.then(fn, fn);
  mutexTail = run.catch(() => undefined);
  return run;
}

export function normalizeActor(actor: string): string {
  return actor.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

async function writeStore(data: VersionStoreData): Promise<void> {
  await writeJsonAtomic(storeFile(), data);
}

async function readStore(): Promise<VersionStoreData> {
  const parsed = await readJsonStrict<Partial<VersionStoreData> | null>(storeFile(), () => null);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.versions)) return { versions: [] };
  return { versions: parsed.versions };
}

export function summarize(v: VersionRecord): VersionSummary {
  return {
    id: v.id,
    number: v.number,
    createdAt: v.createdAt,
    runId: v.runId,
    title: v.title,
    format: v.format,
    workflow: v.workflow,
    lessonKey: v.lessonKey,
    lessonTitle: v.lessonTitle,
    actor: v.actor,
    basedOnVersion: v.basedOnVersion,
    artifactCount: v.artifacts?.length ?? 0,
    textLength: v.text.length,
  };
}

/** Đề kiểm tra được bảo mật đến ngày thi: không lưu toàn văn vào lịch sử phiên bản. */
export const EXAM_PLACEHOLDER = '[Đề kiểm tra: nội dung được bảo mật, xem tại /kiem-tra]';

export async function saveVersion(
  orgId: string,
  rawInput: VersionInput,
): Promise<{ id: string; number: number; createdAt: string }> {
  const input: VersionInput =
    rawInput.workflow === 'de_kiem_tra' ? { ...rawInput, text: EXAM_PLACEHOLDER, artifacts: undefined } : rawInput;
  if (Buffer.byteLength(input.text, 'utf8') > MAX_TEXT_BYTES) {
    throw new VersionLimitError('Văn bản quá dài (tối đa 100KB).');
  }
  if (input.artifacts && Buffer.byteLength(JSON.stringify(input.artifacts), 'utf8') > MAX_ARTIFACTS_BYTES) {
    throw new VersionLimitError('Các sản phẩm đính kèm quá lớn (tối đa 1MB).');
  }
  return withLock(async () => {
    const store = await readStore();
    const key = normalizeActor(input.actor);
    const mine = store.versions.filter((v) => v.orgId === orgId && normalizeActor(v.actor) === key);
    const number =
      mine
        .filter((v) => v.lessonKey === input.lessonKey && v.format === input.format)
        .reduce((max, v) => Math.max(max, v.number), 0) + 1;
    const record: VersionRecord = {
      ...input,
      actor: input.actor.trim(),
      id: `ver_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      orgId,
      number,
      createdAt: new Date().toISOString(),
    };
    store.versions.push(record);
    // Giới hạn mỗi người ~200 phiên bản: bỏ các bản cũ nhất của người đó.
    if (mine.length + 1 > MAX_VERSIONS_PER_ACTOR) {
      const over = mine.length + 1 - MAX_VERSIONS_PER_ACTOR;
      const drop = new Set(
        mine
          .slice()
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .slice(0, over)
          .map((v) => v.id),
      );
      store.versions = store.versions.filter((v) => !drop.has(v.id));
    }
    // Trần toàn tổ chức: bỏ các bản cũ nhất của org khi vượt.
    const orgAll = store.versions.filter((v) => v.orgId === orgId);
    if (orgAll.length > MAX_VERSIONS_PER_ORG) {
      const drop = new Set(
        orgAll
          .slice()
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .slice(0, orgAll.length - MAX_VERSIONS_PER_ORG)
          .map((v) => v.id),
      );
      store.versions = store.versions.filter((v) => !drop.has(v.id));
    }
    await writeStore(store);
    return { id: record.id, number: record.number, createdAt: record.createdAt };
  });
}

export async function getVersion(orgId: string, id: string): Promise<VersionRecord | null> {
  const store = await readStore();
  return store.versions.find((v) => v.orgId === orgId && v.id === id) ?? null;
}

export async function listVersions(orgId: string, actor: string, limit = 100): Promise<VersionSummary[]> {
  const store = await readStore();
  const key = normalizeActor(actor);
  return store.versions
    .filter((v) => v.orgId === orgId && normalizeActor(v.actor) === key)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, Math.min(limit, 200)))
    .map(summarize);
}
