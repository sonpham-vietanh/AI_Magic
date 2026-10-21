import { generateAllResources, type GenContext } from '@/lib/resources';
import type { ResourceKind } from '@/lib/resources/types';
import { groundingBlock } from '@/lib/workflows/prompts';
import { getStandardLesson, saveDraftAssets, type KhoAsset, type StandardLesson } from './index';

export class KhoGenerateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KhoGenerateError';
  }
}

/** Dựng ngữ cảnh sinh từ gói Factory của bài (khối grounding là DỮ LIỆU, không phải chỉ dẫn). */
export function buildGenContext(lesson: StandardLesson): GenContext {
  return {
    title: lesson.title || lesson.atomCode || lesson.atomId,
    grade: lesson.grade,
    subject: lesson.subject,
    language: 'vi',
    bloomLevels: ['Nhớ', 'Hiểu', 'Vận dụng', 'Phân tích'],
    grounding: groundingBlock({
      title: lesson.title,
      grade: lesson.grade,
      subject: lesson.subject,
      packages: lesson.packages,
      assets: lesson.assets,
      questions: lesson.questions,
      socratic: lesson.socratic,
      edges: lesson.edges,
    }),
  };
}

/** Sinh các dạng tài nguyên cho một bài và lưu thành bản NHÁP. Lỗi từng dạng trả riêng. */
export async function generateDraftsForAtom(
  orgId: string,
  atomId: string,
  kinds: ResourceKind[] | undefined,
  signal?: AbortSignal,
): Promise<{ saved: KhoAsset[]; errors: { kind: ResourceKind; error: string }[] }> {
  const lesson = await getStandardLesson(orgId, atomId);
  if (lesson.packages.length === 0) {
    throw new KhoGenerateError('Bài này chưa có gói kiến thức nên chưa có căn cứ để sinh tài nguyên.');
  }
  const res = await generateAllResources(buildGenContext(lesson), kinds, { signal });
  const model = (res as { modelUsed?: string }).modelUsed || 'không rõ';
  const saved = await saveDraftAssets(
    orgId,
    lesson.atomId, // mã chuẩn của bài, khớp với getStandardLesson
    res.artifacts.map((artifact) => ({ artifact, modelUsed: model })),
  );
  return { saved, errors: res.errors };
}
