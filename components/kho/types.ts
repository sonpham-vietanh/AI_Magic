import type { Artifact, ResourceKind } from '@/lib/resources/types';

export type KhoStatus = 'approved' | 'chua_duyet' | 'khong_co';

export interface KhoReviewView {
  reviewer: string;
  reviewedAt: string;
  scores: Record<string, number>;
  average: number;
  note?: string;
  decision: 'approve' | 'reject';
}

export interface AssetView {
  kind: ResourceKind;
  artifact: Artifact;
  modelUsed: string;
  createdAt: string;
  status: 'draft' | 'approved';
  version?: number;
}

export interface QuestionView {
  id?: string;
  tier?: string;
  dok?: number;
  do_kho?: string;
}

export interface PackageView {
  id?: string;
  level?: number;
  bloom?: string;
  status?: string;
  fields?: Record<string, string | undefined>;
}

export interface LessonView {
  status: KhoStatus;
  atomId: string;
  atomCode?: string;
  title?: string;
  grade?: string;
  subject?: string;
  packages: PackageView[];
  assets: unknown[];
  questions: QuestionView[];
  edges: unknown[];
  review?: KhoReviewView;
  atom?: { chapter?: string; lesson?: string; bloom?: string; yeu_cau?: string | null; code?: string };
  artifacts?: Artifact[];
  version?: number;
}

export const FIELD_ORDER = ['objective', 'explanation', 'example', 'counterExample', 'commonMistake', 'strategy', 'questions'];
export const FIELD_LABELS: Record<string, string> = {
  objective: 'Mục tiêu',
  explanation: 'Giải thích',
  example: 'Ví dụ',
  counterExample: 'Phản ví dụ',
  commonMistake: 'Lỗi thường gặp',
  strategy: 'Chiến lược dạy',
  questions: 'Câu hỏi',
};

export function whenText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN');
}
