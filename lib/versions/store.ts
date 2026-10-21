import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  MAX_ARTIFACTS_BYTES,
  MAX_TEXT_BYTES,
  MAX_VERSIONS_PER_ACTOR,
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
  const file = storeFile();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(tmp, JSON.stringify(data), 'utf8');
    await rename(tmp, file);
  } catch (err) {
    console.error('[versions] Không ghi được file dữ liệu:', err);
    try {
      await unlink(tmp);
    } catch {
      // bỏ qua
    }
    throw new Error('Không ghi được dữ liệu phiên bản.');
  }
}

async function readStore(): Promise<VersionStoreData> {
  const file = storeFile();
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return { versions: [] };
    console.error('[versions] Không đọc được file dữ liệu:', err);
    return { versions: [] };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<VersionStoreData>;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.versions)) throw new Error('Sai cấu trúc');
    return { versions: parsed.versions };
  } catch (err) {
    const backup = `${file}.corrupt-${Date.now()}`;
    console.error(`[versions] File bị hỏng JSON, sao lưu sang ${backup}:`, err);
    try {
      await rename(file, backup);
    } catch (renameErr) {
      console.error('[versions] Không sao lưu được file hỏng:', renameErr);
    }
    return { versions: [] };
  }
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

export async function saveVersion(
  orgId: string,
  input: VersionInput,
): Promise<{ id: string; number: number; createdAt: string }> {
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
