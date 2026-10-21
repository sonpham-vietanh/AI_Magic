import { join } from 'node:path';
import { readJsonStrict, writeJsonAtomic } from '@/lib/server/safeJson';
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
  const parsed = await readJsonStrict<Partial<AssetData> | null>(storeFile(), () => null);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return empty();
  return { assets: parsed.assets ?? {}, versions: parsed.versions ?? {} };
}

export async function writeAssets(data: AssetData): Promise<void> {
  await writeJsonAtomic(storeFile(), data);
}
