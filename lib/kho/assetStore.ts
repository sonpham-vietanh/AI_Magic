import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Artifact, ResourceKind } from '@/lib/resources/types';

/** Bản tài nguyên đang làm việc (nháp hoặc đã duyệt) của một dạng cho một bài. */
export interface KhoAsset {
  kind: ResourceKind;
  artifact: Artifact;
  modelUsed: string;
  createdAt: string;
  status: 'draft' | 'approved';
  /** Có khi đã được đóng băng vào một phiên bản. */
  version?: number;
}

/** Phiên bản bản chuẩn: bất biến sau khi tạo. */
export interface KhoVersion {
  version: number;
  approvedAt: string;
  reviewer: string;
  average: number;
  artifacts: Artifact[];
  /** Ảnh chụp gói kiến thức tại thời điểm duyệt. */
  packages: unknown[];
  packageCount: number;
}

export interface AssetData {
  /** key = `${orgId}::${atomId}::${kind}` */
  assets: Record<string, KhoAsset>;
  /** key = `${orgId}::${atomId}` */
  versions: Record<string, KhoVersion[]>;
}

function storeFile(): string {
  return process.env.KHO_ASSETS_FILE || join(process.cwd(), '.data', 'kho-assets.json');
}

export const assetKey = (orgId: string, atomId: string, kind: string) => `${orgId}::${atomId}::${kind}`;
export const versionKey = (orgId: string, atomId: string) => `${orgId}::${atomId}`;

let mutexTail: Promise<unknown> = Promise.resolve();

export function withAssetLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutexTail.then(fn, fn);
  mutexTail = run.catch(() => undefined);
  return run;
}

const empty = (): AssetData => ({ assets: {}, versions: {} });

export async function readAssets(): Promise<AssetData> {
  const file = storeFile();
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.error('[kho] Không đọc được file tài nguyên:', err);
    }
    return empty();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AssetData> | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid shape');
    return { assets: parsed.assets ?? {}, versions: parsed.versions ?? {} };
  } catch (err) {
    const backup = `${file}.corrupt-${Date.now()}`;
    console.error(`[kho] File tài nguyên hỏng JSON, sao lưu sang ${backup}:`, err);
    try {
      await rename(file, backup);
    } catch (renameErr) {
      console.error('[kho] Không sao lưu được file hỏng:', renameErr);
    }
    return empty();
  }
}

export async function writeAssets(data: AssetData): Promise<void> {
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
    throw err;
  }
}
