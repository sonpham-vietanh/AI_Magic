import { RUBRIC_6 } from '@/lib/eval/rubric';
import { fetchSupabaseAtomDetail, querySupabaseAtoms } from '@/lib/supabase';
import type { Artifact, ResourceKind } from '@/lib/resources/types';
import { RESOURCE_KINDS } from '@/lib/resources/types';
import { readReviews, reviewKey, withLock, writeReviews, type KhoReview } from './reviewStore';
import {
  assetKey,
  readAssets,
  versionKey,
  withAssetLock,
  writeAssets,
  type KhoAsset,
  type KhoVersion,
} from './assetStore';

export type { KhoAsset, KhoVersion } from './assetStore';

export type KhoStatus = 'approved' | 'chua_duyet' | 'khong_co';

export interface StandardLesson {
  status: KhoStatus;
  atomId: string;
  atomCode?: string;
  title?: string;
  grade?: string;
  subject?: string;
  packages: unknown[];
  assets: unknown[];
  questions: unknown[];
  socratic: unknown[];
  edges: unknown[];
  review?: KhoReview;
  atom?: unknown;
  /** CHỈ các tài nguyên đã duyệt của phiên bản mới nhất. */
  artifacts?: Artifact[];
  /** Số phiên bản mới nhất đã duyệt (v1, v2…). */
  version?: number;
}

export class KhoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KhoValidationError';
  }
}

export const APPROVE_MIN_AVERAGE = 4.0;
export const APPROVE_MIN_CRITERION = 3;

const hasFactoryApproved = (packages: unknown[]) =>
  packages.some((p) => (p as { status?: string } | null)?.status === 'approved');

async function getLatestReview(orgId: string, atomId: string): Promise<KhoReview | undefined> {
  const data = await readReviews();
  const list = data[reviewKey(orgId, atomId)];
  return list && list.length ? list[list.length - 1] : undefined;
}

async function getLatestVersion(orgId: string, ...atomIds: string[]): Promise<KhoVersion | undefined> {
  const data = await readAssets();
  for (const id of atomIds) {
    const list = data.versions[versionKey(orgId, id)];
    if (list && list.length) return list[list.length - 1];
  }
  return undefined;
}

export async function getStandardLesson(orgId: string, atomId: string): Promise<StandardLesson> {
  const detail = await fetchSupabaseAtomDetail(atomId);
  const atom = detail.atom;
  const canonicalId = atom?.id || atomId;
  const review =
    (await getLatestReview(orgId, canonicalId)) ??
    (canonicalId !== atomId ? await getLatestReview(orgId, atomId) : undefined);
  const latest = await getLatestVersion(orgId, canonicalId, atomId);
  const packages = detail.packages || [];
  let status: KhoStatus;
  if (hasFactoryApproved(packages) || review?.decision === 'approve') status = 'approved';
  else if (packages.length > 0) status = 'chua_duyet';
  else status = 'khong_co';
  return {
    status,
    atomId: canonicalId,
    atomCode: atom?.code,
    title: atom?.title,
    grade: atom ? String(atom.grade) : undefined,
    subject: atom?.subject,
    packages,
    assets: detail.factoryAssets || [],
    questions: detail.questions || [],
    socratic: detail.socratic || [],
    edges: detail.edges || [],
    review,
    atom: atom ?? undefined,
    // Chỉ bản đã duyệt (đã đóng băng) mới lọt vào bản chuẩn; nháp không bao giờ.
    ...(latest ? { artifacts: latest.artifacts, version: latest.version } : {}),
  };
}

export async function listVersions(orgId: string, atomId: string): Promise<KhoVersion[]> {
  const data = await readAssets();
  return data.versions[versionKey(orgId, atomId)] ?? [];
}

/** Các bản tài nguyên đang làm việc (nháp hoặc đã duyệt) của một bài, theo thứ tự 6 dạng. */
export async function listAssets(orgId: string, atomId: string): Promise<KhoAsset[]> {
  const data = await readAssets();
  return RESOURCE_KINDS.map((k) => data.assets[assetKey(orgId, atomId, k)]).filter((a): a is KhoAsset => !!a);
}

/** Lưu các bản NHÁP mới sinh. Sinh lại một dạng luôn tạo bản nháp mới, không đụng phiên bản đã đóng băng. */
export async function saveDraftAssets(
  orgId: string,
  atomId: string,
  items: { artifact: Artifact; modelUsed: string }[],
): Promise<KhoAsset[]> {
  const valid = items.filter((i) => (RESOURCE_KINDS as readonly string[]).includes(i.artifact.kind));
  const saved = await withAssetLock(async () => {
    const data = await readAssets();
    const now = new Date().toISOString();
    const out: KhoAsset[] = [];
    for (const it of valid) {
      const rec: KhoAsset = {
        kind: it.artifact.kind as ResourceKind,
        artifact: it.artifact,
        modelUsed: it.modelUsed,
        createdAt: now,
        status: 'draft',
      };
      data.assets[assetKey(orgId, atomId, rec.kind)] = rec;
      out.push(rec);
    }
    if (out.length) await writeAssets(data);
    return out;
  });
  invalidateLibraryCache();
  return saved;
}

/** Đóng băng toàn bộ bộ tài nguyên hiện có thành phiên bản kế tiếp (gọi khi 'approve'). */
async function freezeVersion(orgId: string, atomId: string, review: KhoReview, packages: unknown[]): Promise<KhoVersion> {
  return withAssetLock(async () => {
    const data = await readAssets();
    const vk = versionKey(orgId, atomId);
    const list = data.versions[vk] ?? [];
    const version = (list.length ? list[list.length - 1].version : 0) + 1;
    const working = RESOURCE_KINDS.map((k) => data.assets[assetKey(orgId, atomId, k)]).filter(
      (a): a is KhoAsset => !!a,
    );
    const frozen: KhoVersion = {
      version,
      approvedAt: review.reviewedAt,
      reviewer: review.reviewer,
      average: review.average,
      artifacts: working.map((a) => a.artifact),
      packages,
      packageCount: packages.length,
    };
    data.versions[vk] = [...list, frozen];
    for (const a of working) {
      data.assets[assetKey(orgId, atomId, a.kind)] = { ...a, status: 'approved', version };
    }
    await writeAssets(data);
    return frozen;
  });
}

export async function submitReview(
  orgId: string,
  input: {
    atomId: string;
    reviewer: string;
    scores: Record<string, number>;
    decision: 'approve' | 'reject';
    note?: string;
  },
): Promise<KhoReview & { version?: number }> {
  const reviewer = (input.reviewer || '').trim();
  if (!reviewer) throw new KhoValidationError('Vui lòng nhập tên người duyệt.');
  if (!input.atomId || !input.atomId.trim()) throw new KhoValidationError('Thiếu mã bài (atomId).');
  if (input.decision !== 'approve' && input.decision !== 'reject') {
    throw new KhoValidationError('Quyết định phải là duyệt hoặc từ chối.');
  }
  const scores: Record<string, number> = {};
  for (const c of RUBRIC_6) {
    const v = input.scores?.[c.id];
    if (v === undefined || v === null) {
      throw new KhoValidationError(`Thiếu điểm cho tiêu chí "${c.name}".`);
    }
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) {
      throw new KhoValidationError(`Điểm tiêu chí "${c.name}" phải là số nguyên từ 1 đến 5.`);
    }
    scores[c.id] = v;
  }
  const values = Object.values(scores);
  const average = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
  if (input.decision === 'approve') {
    const low = RUBRIC_6.find((c) => scores[c.id] < APPROVE_MIN_CRITERION);
    if (low) {
      throw new KhoValidationError(
        `Không thể duyệt: tiêu chí "${low.name}" dưới ${APPROVE_MIN_CRITERION} điểm. Không qua cổng thì không vào Kho.`,
      );
    }
    if (average < APPROVE_MIN_AVERAGE) {
      throw new KhoValidationError(
        `Không thể duyệt: điểm trung bình ${average.toFixed(2)} thấp hơn ${APPROVE_MIN_AVERAGE.toFixed(1)}. Không qua cổng thì không vào Kho.`,
      );
    }
  }
  const note = input.note?.trim();
  const review: KhoReview = {
    reviewer,
    reviewedAt: new Date().toISOString(),
    scores,
    average,
    decision: input.decision,
    ...(note ? { note } : {}),
  };
  await withLock(async () => {
    const data = await readReviews();
    const key = reviewKey(orgId, input.atomId);
    data[key] = [...(data[key] || []), review];
    await writeReviews(data);
  });
  let version: number | undefined;
  if (review.decision === 'approve') {
    // Duyệt = duyệt cả BỘ (gói kiến thức + tài nguyên hiện có) và đóng băng thành một phiên bản.
    let packages: unknown[] = [];
    try {
      const d = await fetchSupabaseAtomDetail(input.atomId);
      packages = d?.packages ?? [];
    } catch (err) {
      console.error('[kho] Không đọc được gói để đóng băng phiên bản:', err);
    }
    version = (await freezeVersion(orgId, input.atomId, review, packages)).version;
  }
  invalidateLibraryCache();
  return version ? { ...review, version } : review;
}

export interface KhoRow {
  atomId: string;
  code: string;
  title: string;
  chapter: string;
  lesson: string;
  status: KhoStatus;
  hasPackage: boolean;
  assetCount: number;
  review?: KhoReview;
}

async function loadRows(orgId: string, opts: { subject?: string; grade?: string; limit?: number }): Promise<KhoRow[]> {
  const { atoms } = await querySupabaseAtoms({
    subject: opts.subject,
    grade: opts.grade,
    limit: opts.limit ?? 60,
  });
  const reviews = await readReviews();
  return Promise.all(
    atoms.map(async (a) => {
      const hasPackage = !!a.hasFactoryPackage || (a.factoryPackageCount ?? 0) > 0;
      const list = reviews[reviewKey(orgId, a.id)];
      const review = list && list.length ? list[list.length - 1] : undefined;
      let factoryApproved = false;
      if (hasPackage) {
        try {
          const d = await fetchSupabaseAtomDetail(a.id);
          factoryApproved = hasFactoryApproved(d.packages || []);
        } catch (err) {
          console.error('[kho] Không đọc được gói của', a.id, err);
        }
      }
      let status: KhoStatus = 'khong_co';
      if (factoryApproved || review?.decision === 'approve') status = 'approved';
      else if (hasPackage) status = 'chua_duyet';
      return {
        atomId: a.id,
        code: a.code,
        title: a.title,
        chapter: a.chapter || '',
        lesson: a.lesson || '',
        status,
        hasPackage,
        assetCount: a.factoryAssetCount ?? 0,
        ...(review ? { review } : {}),
      };
    }),
  );
}

export async function listReviewQueue(
  orgId: string,
  opts: { subject?: string; grade?: string; limit?: number },
): Promise<KhoRow[]> {
  const items = await loadRows(orgId, opts);
  // Bài chưa duyệt (có gói) lên đầu, rồi đã duyệt, cuối là chưa có gói.
  const rank: Record<KhoStatus, number> = { chua_duyet: 0, approved: 1, khong_co: 2 };
  return items.sort((x, y) => rank[x.status] - rank[y.status]);
}

export interface LibraryRow extends KhoRow {
  /** Phiên bản mới nhất đã duyệt (nếu có). */
  version?: number;
  /** Các dạng tài nguyên ĐÃ DUYỆT trong phiên bản đó. */
  kinds: ResourceKind[];
  /** Số dạng đang ở trạng thái nháp (chưa duyệt). */
  draftCount: number;
}

const LIB_TTL_MS = 45_000;
const libCache = new Map<string, { at: number; rows: Promise<KhoRow[]> }>();

export function invalidateLibraryCache(): void {
  libCache.clear();
}

/** Danh sách theo chương/bài kèm trạng thái và phiên bản; trạng thái từ Supabase được nhớ ngắn để không gọi từng bài. */
export async function listLibrary(orgId: string, opts: { subject?: string; grade?: string }): Promise<LibraryRow[]> {
  const ck = `${orgId}|${opts.subject ?? ''}|${opts.grade ?? ''}`;
  let hit = libCache.get(ck);
  if (!hit || Date.now() - hit.at > LIB_TTL_MS) {
    const rows = loadRows(orgId, { ...opts, limit: 400 });
    hit = { at: Date.now(), rows };
    libCache.set(ck, hit);
    rows.catch(() => libCache.delete(ck));
  }
  const base = await hit.rows;
  // Phiên bản, nháp và duyệt đọc mới mỗi lần (file cục bộ, rẻ) để luôn đúng sau khi duyệt/sinh.
  const data = await readAssets();
  const reviews = await readReviews();
  return base.map((r) => {
    const vs = data.versions[versionKey(orgId, r.atomId)];
    const latest = vs && vs.length ? vs[vs.length - 1] : undefined;
    const rl = reviews[reviewKey(orgId, r.atomId)];
    const review = rl && rl.length ? rl[rl.length - 1] : undefined;
    const status: KhoStatus = review?.decision === 'approve' ? 'approved' : r.status;
    const draftCount = RESOURCE_KINDS.filter((k) => data.assets[assetKey(orgId, r.atomId, k)]?.status === 'draft').length;
    return {
      ...r,
      status,
      ...(review ? { review } : {}),
      ...(latest ? { version: latest.version } : {}),
      kinds: latest
        ? (latest.artifacts.map((a) => a.kind).filter((k) => (RESOURCE_KINDS as readonly string[]).includes(k)) as ResourceKind[])
        : [],
      draftCount,
    };
  });
}
