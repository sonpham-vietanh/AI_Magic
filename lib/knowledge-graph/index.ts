import type { GradeLevel, KnowledgeEdge, KnowledgeEdgeRelation, KnowledgeNode, SubjectCode } from '../types';
import { KNOWLEDGE_EDGES } from './edges';
import { KNOWLEDGE_NODES } from './nodes';

export { KNOWLEDGE_EDGES, KNOWLEDGE_NODES };

export const RELATION_LABELS: Record<
  KnowledgeEdgeRelation,
  { label: string; badgeClass: 'accent' | 'yes' | 'warn' | 'cta'; description: string }
> = {
  cung_chu_de_tuan: {
    label: 'Cùng chủ đề tuần học',
    badgeClass: 'accent',
    description: 'Hai môn học đang giảng dạy các khái niệm giao thoa trong cùng khoảng tuần của học kỳ.',
  },
  ung_dung_thuc_te: {
    label: 'Công cụ & Ứng dụng thực tế',
    badgeClass: 'yes',
    description: 'Kiến thức của môn này đóng vai trò là công cụ tính toán, biểu diễn hoặc giải thích cho môn kia.',
  },
  tien_quyet: {
    label: 'Kiến thức nền tảng tiên quyết',
    badgeClass: 'warn',
    description: 'Kiến thức cần nắm vững trước để tiếp thu trọn vẹn bài học hiện tại.',
  },
  du_an_steam_lien_mon: {
    label: 'Dự án STEAM / Học tập tích hợp',
    badgeClass: 'cta',
    description: 'Có thể gộp thành một sản phẩm trải nghiệm thực hành hoặc dự án liên môn cho học sinh.',
  },
};

export const getNodeById = (id?: string): KnowledgeNode | undefined =>
  id ? KNOWLEDGE_NODES.find((n) => n.id === id) : undefined;

export const getNodesByFilter = (options?: {
  grade?: GradeLevel | 'all';
  subject?: SubjectCode | 'all';
  week?: number;
  query?: string;
}): KnowledgeNode[] => {
  const q = (options?.query ?? '').trim().toLowerCase();
  return KNOWLEDGE_NODES.filter((node) => {
    if (options?.grade && options.grade !== 'all' && node.grade !== options.grade) {
      return false;
    }
    if (options?.subject && options.subject !== 'all' && node.subject !== options.subject) {
      return false;
    }
    if (
      typeof options?.week === 'number' &&
      (options.week < node.weekRange[0] || options.week > node.weekRange[1])
    ) {
      return false;
    }
    if (!q) return true;
    const haystack = [
      node.title,
      node.subjectName,
      node.vietAnhPracticalHook,
      ...node.moetRequiredOutcomes,
      ...node.keywords,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
};

export const getConnectedNodes = (
  nodeId: string,
): { edge: KnowledgeEdge; node: KnowledgeNode; direction: 'outgoing' | 'incoming' }[] => {
  const results: { edge: KnowledgeEdge; node: KnowledgeNode; direction: 'outgoing' | 'incoming' }[] = [];
  for (const edge of KNOWLEDGE_EDGES) {
    if (edge.sourceNodeId === nodeId) {
      const target = getNodeById(edge.targetNodeId);
      if (target) results.push({ edge, node: target, direction: 'outgoing' });
    } else if (edge.targetNodeId === nodeId) {
      const source = getNodeById(edge.sourceNodeId);
      if (source) results.push({ edge, node: source, direction: 'incoming' });
    }
  }
  return results;
};

export const getCrossSubjectSuggestions = (
  grade: GradeLevel,
  subject?: SubjectCode | 'all',
): { primaryNode: KnowledgeNode; related: { edge: KnowledgeEdge; node: KnowledgeNode }[] }[] => {
  const primaryNodes = getNodesByFilter({ grade, subject });
  return primaryNodes.map((primaryNode) => ({
    primaryNode,
    related: getConnectedNodes(primaryNode.id).map(({ edge, node }) => ({ edge, node })),
  }));
};
