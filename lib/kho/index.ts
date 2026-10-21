import { RUBRIC_6 } from '@/lib/eval/rubric';
import { fetchSupabaseAtomDetail, querySupabaseAtoms } from '@/lib/supabase';
import { readReviews, reviewKey, withLock, writeReviews, type KhoReview } from './reviewStore';

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

export async function getStandardLesson(orgId: string, atomId: string): Promise<StandardLesson> {
  const detail = await fetchSupabaseAtomDetail(atomId);
  const atom = detail.atom;
  const canonicalId = atom?.id || atomId;
  const review =
    (await getLatestReview(orgId, canonicalId)) ??
    (canonicalId !== atomId ? await getLatestReview(orgId, atomId) : undefined);
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
  };
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
): Promise<KhoReview> {
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
  return withLock(async () => {
    const data = await readReviews();
    const key = reviewKey(orgId, input.atomId);
    data[key] = [...(data[key] || []), review];
    await writeReviews(data);
    return review;
  });
}

export async function listReviewQueue(
  orgId: string,
  opts: { subject?: string; grade?: string; limit?: number },
): Promise<
  {
    atomId: string;
    code: string;
    title: string;
    status: KhoStatus;
    hasPackage: boolean;
    assetCount: number;
    review?: KhoReview;
  }[]
> {
  const { atoms } = await querySupabaseAtoms({
    subject: opts.subject,
    grade: opts.grade,
    limit: opts.limit ?? 60,
  });
  const reviews = await readReviews();
  const items = await Promise.all(
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
        status,
        hasPackage,
        assetCount: a.factoryAssetCount ?? 0,
        ...(review ? { review } : {}),
      };
    }),
  );
  // Bài chưa duyệt (có gói) lên đầu, rồi đã duyệt, cuối là chưa có gói.
  const rank: Record<KhoStatus, number> = { chua_duyet: 0, approved: 1, khong_co: 2 };
  return items.sort((x, y) => rank[x.status] - rank[y.status]);
}
