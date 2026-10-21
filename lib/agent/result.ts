// Kết quả mở rộng của /api/workflows/run: ngoài WorkflowResult còn có sản phẩm có cấu trúc (artifacts),
// kiểm tra cấu trúc (structure) và danh sách dạng lấy thẳng từ bản chuẩn (fromKho).
// Các trường này có thể chưa có (bản chạy cũ, lịch sử cũ): mọi hàm đọc đều chịu được thiếu hoặc sai kiểu.
import { RESOURCE_KINDS, type Artifact, type ArtifactKind, type StructureCheck } from '../resources/types';
import type { WorkflowResult } from '../workflows/types';

export type AgentResult = Omit<WorkflowResult, 'artifacts' | 'structure' | 'fromKho'> & {
  artifacts?: Artifact[];
  structure?: StructureCheck[];
  fromKho?: ArtifactKind[];
};

const VALID_KINDS = new Set<string>([...RESOURCE_KINDS, 'slides', 'worksheet']);

/** Tên ngắn của từng loại sản phẩm, dùng cho bộ chuyển loại. */
export const ARTIFACT_SHORT: Record<ArtifactKind, string> = {
  text: 'Bài đọc',
  infographic: 'Infographic',
  mindmap: 'Mindmap',
  video: 'Video',
  tranh_luan: 'Tranh luận',
  podcast: 'Podcast',
  slides: 'Slide',
  worksheet: 'Phiếu học tập',
};

export function getArtifacts(r?: Partial<AgentResult> | null): Artifact[] {
  const list = r?.artifacts;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (a): a is Artifact =>
      !!a && typeof a === 'object' && VALID_KINDS.has(String(a.kind)) && !!a.data && typeof a.data === 'object',
  );
}

export function getStructure(r?: Partial<AgentResult> | null): StructureCheck[] {
  const list = r?.structure;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (c): c is StructureCheck => !!c && typeof c.id === 'string' && typeof c.label === 'string' && typeof c.ok === 'boolean',
  );
}

export function getFromKho(r?: Partial<AgentResult> | null): ArtifactKind[] {
  const list = r?.fromKho;
  if (!Array.isArray(list)) return [];
  return list.filter((k): k is ArtifactKind => VALID_KINDS.has(String(k)));
}

export function structureSummary(list: StructureCheck[]): { ok: number; total: number; missing: StructureCheck[] } {
  const missing = list.filter((c) => !c.ok);
  return { ok: list.length - missing.length, total: list.length, missing };
}

/** Văn bản tối thiểu mô tả các sản phẩm, dùng khi máy chủ không trả kèm văn bản (để ghi tín hiệu và phiên bản). */
export function artifactsToText(artifacts: Artifact[]): string {
  return artifacts.map((a) => `${ARTIFACT_SHORT[a.kind] ?? a.kind}: ${a.title}`).join('\n');
}

/** Văn bản của kết quả: các mục nếu có, không thì markdown, không thì mô tả sản phẩm. */
export function resultText(r: AgentResult): string {
  const sections = r.content?.sections ?? [];
  const body = sections.length
    ? sections.map((x) => (x.heading ? `${x.heading}\n${x.body}` : x.body)).join('\n\n').trim()
    : (r.content?.markdown ?? '');
  return body || artifactsToText(getArtifacts(r));
}
