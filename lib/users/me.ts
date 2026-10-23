// Dựng dữ liệu "tôi" từ phiên đăng nhập: hồ sơ, tuỳ chọn, thống kê và gói xuất dữ liệu. Chỉ trả dữ liệu của CHÍNH người trong phiên.
import { join } from 'node:path';
import { getOrgId } from '@/lib/server/org';
import { readJsonStrict } from '@/lib/server/safeJson';
import { normalizeActorName } from '@/lib/server/roles';
import { readSessionFromRequest, type TeacherSession } from '@/lib/server/sessionToken';
import { listVersions } from '@/lib/versions/store';
import type { VersionSummary } from '@/lib/versions/types';
import { getPrefs, userKey, type UserPrefs } from './prefs';

export interface MeUser {
  name: string;
  email: string;
  role: 'teacher' | 'reviewer' | 'admin';
  via: 'google' | 'name';
  initial: string;
}

export function initialOf(name: string): string {
  const parts = name.normalize('NFC').trim().split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return (Array.from(last)[0] ?? '?').toLocaleUpperCase('vi');
}

export function toMeUser(s: TeacherSession): MeUser {
  return {
    name: s.name,
    email: s.email ?? '',
    role: s.role,
    via: s.via ?? 'name',
    initial: initialOf(s.name),
  };
}

/** Tên gắn vào bản đã soạn: email khi đăng nhập Google (khớp effectiveActor), ngược lại tên khai. */
export function actorOf(s: TeacherSession): string {
  return s.via === 'google' ? s.email || s.name : s.name;
}

export interface MeSnapshot {
  user: MeUser;
  prefs: UserPrefs;
}

export function sessionOf(request: Request): TeacherSession | null {
  return readSessionFromRequest(request);
}

export async function loadMe(session: TeacherSession): Promise<MeSnapshot> {
  return { user: toMeUser(session), prefs: await getPrefs(userKey(session)) };
}

export interface ActivityStats {
  versionCount: number;
  lastAt: string | null;
  byFormat: Record<string, number>;
}

export function statsOf(versions: VersionSummary[]): ActivityStats {
  const byFormat: Record<string, number> = {};
  let lastAt: string | null = null;
  for (const v of versions) {
    byFormat[v.format] = (byFormat[v.format] ?? 0) + 1;
    if (!lastAt || v.createdAt > lastAt) lastAt = v.createdAt;
  }
  return { versionCount: versions.length, lastAt, byFormat };
}

export async function myVersions(request: Request, session: TeacherSession, limit = 200): Promise<VersionSummary[]> {
  return listVersions(getOrgId(request), actorOf(session), limit);
}

interface SignalRun {
  orgId?: string;
  runId?: string;
  lessonKey?: string;
  teacher?: string;
  workflow?: string;
  at?: string;
  regenerationOf?: string;
  accepted?: boolean;
  diffRatio?: number;
  finalAt?: string;
}

function signalsFile(): string {
  return process.env.SIGNALS_FILE || join(process.cwd(), '.data', 'signals.json');
}

/** Tín hiệu của riêng người này (không kèm văn bản). Khớp theo tên người soạn đã chuẩn hoá. */
export async function mySignals(request: Request, session: TeacherSession) {
  const raw = await readJsonStrict<{ runs?: SignalRun[] } | null>(signalsFile(), () => null);
  const runs = Array.isArray(raw?.runs) ? raw.runs : [];
  const who = normalizeActorName(actorOf(session));
  const org = getOrgId(request);
  return runs
    .filter((r) => r && r.orgId === org && typeof r.teacher === 'string' && normalizeActorName(r.teacher) === who)
    .slice(-500)
    .map((r) => ({
      runId: r.runId,
      lessonKey: r.lessonKey,
      workflow: r.workflow,
      at: r.at,
      regenerationOf: r.regenerationOf,
      accepted: r.accepted,
      diffRatio: r.diffRatio,
      finalAt: r.finalAt,
    }));
}

export async function buildExport(request: Request, session: TeacherSession) {
  const [me, versions, signals] = await Promise.all([
    loadMe(session),
    myVersions(request, session, 200),
    mySignals(request, session),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    note: 'Dữ liệu của riêng bạn trên Việt Anh MagicStudio. Không gồm dữ liệu của người khác.',
    profile: { name: me.user.name, email: me.user.email, role: me.user.role, via: me.user.via },
    prefs: me.prefs,
    versions,
    signals,
  };
}
