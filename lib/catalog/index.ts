import type { GradeLevel, PedagogicalTool, SubjectCode, ToolCategoryCode } from '../types';
import {
  GRADES,
  SUBJECTS,
  TOOL_CATEGORIES,
  getCategoryMeta,
  getGradeMeta,
  getSubjectMeta,
} from './categories';
import { TOOLS_PART_1 } from './tools-part1';
import { TOOLS_PART_2 } from './tools-part2';

export {
  GRADES,
  SUBJECTS,
  TOOL_CATEGORIES,
  getCategoryMeta,
  getGradeMeta,
  getSubjectMeta,
  TOOLS_PART_1,
  TOOLS_PART_2,
};

export const ALL_TOOLS: PedagogicalTool[] = [...TOOLS_PART_1, ...TOOLS_PART_2];

export const getToolById = (idOrSlug: string): PedagogicalTool | undefined =>
  ALL_TOOLS.find((t) => t.id === idOrSlug || t.slug === idOrSlug);

export const getToolsByCategory = (category?: ToolCategoryCode): PedagogicalTool[] =>
  category ? ALL_TOOLS.filter((t) => t.category === category) : ALL_TOOLS;

export const getFeaturedTools = (): PedagogicalTool[] =>
  ALL_TOOLS.filter((t) => t.featured);

export const searchTools = (params: {
  query?: string;
  category?: ToolCategoryCode | 'all';
  subject?: SubjectCode | 'all';
  grade?: GradeLevel | 'all';
  featuredOnly?: boolean;
}): PedagogicalTool[] => {
  const q = (params.query ?? '').trim().toLowerCase();
  return ALL_TOOLS.filter((tool) => {
    if (params.featuredOnly && !tool.featured) return false;
    if (params.category && params.category !== 'all' && tool.category !== params.category) {
      return false;
    }
    if (
      params.subject &&
      params.subject !== 'all' &&
      tool.supportedSubjects !== 'all' &&
      !tool.supportedSubjects.includes(params.subject)
    ) {
      return false;
    }
    if (
      params.grade &&
      params.grade !== 'all' &&
      tool.supportedGrades !== 'all' &&
      !tool.supportedGrades.includes(params.grade)
    ) {
      return false;
    }
    if (!q) return true;
    const haystack = [
      tool.name,
      tool.shortDescription,
      tool.magicSchoolEquivalent,
      tool.vietAnhValueAdd,
      tool.moetStandardRef,
      tool.slug,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
};
