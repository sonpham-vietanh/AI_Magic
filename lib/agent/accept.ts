// "Duyệt & dùng": ghi tín hiệu bản cuối (như trước) rồi LƯU THÊM một phiên bản vào Lịch sử của giáo viên.
// Cả hai bước đều best effort: lỗi không bao giờ chặn giáo viên.
import type { Artifact } from '../resources/types';
import { ANONYMOUS_ACTOR } from './actor';
import { artifactsToText } from './result';

export interface AcceptInput {
  runId: string;
  title: string;
  /** Giá trị formatDauRa (ke_hoach, slide, ...). */
  format: string;
  workflow: string;
  lessonKey: string;
  lessonTitle?: string;
  text: string;
  artifacts?: Artifact[];
  actor: string;
}

export interface AcceptOutcome {
  diffRatio?: number;
  version?: { id: string; number: number };
  versionFailed?: boolean;
}

export async function acceptResult(i: AcceptInput): Promise<AcceptOutcome> {
  const out: AcceptOutcome = {};
  const text = i.text.trim() ? i.text : artifactsToText(i.artifacts ?? []);
  try {
    const res = await fetch('/api/signals/final', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: i.runId, finalText: text, accepted: true }),
    });
    const j = (await res.json().catch(() => ({}))) as { diffRatio?: number };
    if (res.ok && typeof j.diffRatio === 'number') out.diffRatio = j.diffRatio;
  } catch {
    /* ghi tín hiệu là phụ */
  }
  try {
    const body: Record<string, unknown> = {
      runId: i.runId,
      title: i.title.slice(0, 300),
      format: i.format,
      workflow: i.workflow,
      lessonKey: i.lessonKey,
      text,
      actor: i.actor.trim() || ANONYMOUS_ACTOR,
    };
    if (i.lessonTitle) body.lessonTitle = i.lessonTitle.slice(0, 300);
    if (i.artifacts && i.artifacts.length > 0) body.artifacts = i.artifacts;
    const res = await fetch('/api/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; version?: { id?: string; number?: number } };
    if (res.ok && j.ok && j.version && typeof j.version.number === 'number' && j.version.id) {
      out.version = { id: String(j.version.id), number: j.version.number };
    } else {
      out.versionFailed = true;
    }
  } catch {
    out.versionFailed = true;
  }
  return out;
}

export interface LoadedVersion {
  id: string;
  number: number;
  runId: string;
  title: string;
  format: string;
  workflow: string;
  lessonKey: string;
  lessonTitle?: string;
  text: string;
  artifacts: Artifact[];
  createdAt: string;
}

/** Nạp một phiên bản đã lưu (để mở lại trong trợ lý). Trả về undefined nếu không nạp được. */
export async function loadVersion(id: string): Promise<LoadedVersion | undefined> {
  try {
    const res = await fetch(`/api/versions?id=${encodeURIComponent(id)}`);
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; version?: Partial<LoadedVersion> };
    const v = j.version;
    if (!res.ok || !j.ok || !v || typeof v.runId !== 'string') return undefined;
    return {
      id: String(v.id ?? id),
      number: typeof v.number === 'number' ? v.number : 1,
      runId: v.runId,
      title: String(v.title ?? 'Bản soạn đã lưu'),
      format: String(v.format ?? ''),
      workflow: String(v.workflow ?? ''),
      lessonKey: String(v.lessonKey ?? ''),
      lessonTitle: v.lessonTitle ? String(v.lessonTitle) : undefined,
      text: String(v.text ?? ''),
      artifacts: Array.isArray(v.artifacts) ? (v.artifacts as Artifact[]) : [],
      createdAt: String(v.createdAt ?? new Date().toISOString()),
    };
  } catch {
    return undefined;
  }
}
