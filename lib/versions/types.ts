import type { Artifact } from '@/lib/resources/types';

export interface VersionInput {
  runId: string;
  title: string;
  format: string;
  workflow: string;
  lessonKey: string;
  lessonTitle?: string;
  text: string;
  artifacts?: Artifact[];
  actor: string;
  basedOnVersion?: string;
}

export interface VersionRecord extends VersionInput {
  id: string;
  orgId: string;
  number: number;
  createdAt: string;
}

/** Bản tóm tắt dùng cho danh sách (không kèm text/artifacts). */
export interface VersionSummary {
  id: string;
  number: number;
  createdAt: string;
  runId: string;
  title: string;
  format: string;
  workflow: string;
  lessonKey: string;
  lessonTitle?: string;
  actor: string;
  basedOnVersion?: string;
  artifactCount: number;
  textLength: number;
}

export const MAX_VERSIONS_PER_ACTOR = 200;
/** Trần toàn tổ chức: chặn việc bịa nhiều tên người dùng để làm phình file. */
export const MAX_VERSIONS_PER_ORG = 3000;
export const MAX_TEXT_BYTES = 100 * 1024;
export const MAX_ARTIFACTS_BYTES = 1024 * 1024;
