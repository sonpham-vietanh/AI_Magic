import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { OrgData } from './types';

interface StoreFile {
  orgs: Record<string, OrgData>;
}

/** Đường dẫn đọc tại thời điểm gọi để test có thể đổi bằng ASSESSMENT_STORE_FILE. */
function storeFile(): string {
  return process.env.ASSESSMENT_STORE_FILE || join(process.cwd(), '.data', 'assessment.json');
}

let clockFn: () => Date = () => new Date();
/** Dùng cho test: tiêm đồng hồ. Truyền null để trở về đồng hồ thật. */
export function setClock(fn: (() => Date) | null): void {
  clockFn = fn ?? (() => new Date());
}
export function now(): Date {
  return clockFn();
}

let mutexTail: Promise<unknown> = Promise.resolve();
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutexTail.then(fn, fn);
  mutexTail = run.catch(() => undefined);
  return run;
}

export const emptyOrg = (): OrgData => ({ usage: [], results: {}, exams: [] });

async function readAll(): Promise<StoreFile> {
  const file = storeFile();
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.error('[assessment] Không đọc được file dữ liệu:', err);
    }
    return { orgs: {} };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoreFile>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.orgs !== 'object' || !parsed.orgs) {
      throw new Error('Invalid store shape');
    }
    return { orgs: parsed.orgs as Record<string, OrgData> };
  } catch (err) {
    const backup = `${file}.corrupt-${Date.now()}`;
    console.error(`[assessment] File dữ liệu hỏng, sao lưu sang ${backup}:`, err);
    try {
      await rename(file, backup);
    } catch (e) {
      console.error('[assessment] Không sao lưu được file hỏng:', e);
    }
    return { orgs: {} };
  }
}

async function writeAll(data: StoreFile): Promise<void> {
  const file = storeFile();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await rename(tmp, file);
  } catch (err) {
    console.error('[assessment] Không ghi được file dữ liệu:', err);
    try {
      await unlink(tmp);
    } catch {
      // ignore
    }
  }
}

function normalizeOrg(o: Partial<OrgData> | undefined): OrgData {
  return {
    usage: Array.isArray(o?.usage) ? o!.usage : [],
    results: o?.results && typeof o.results === 'object' ? o.results : {},
    exams: Array.isArray(o?.exams) ? o!.exams : [],
  };
}

export async function readOrg(orgId: string): Promise<OrgData> {
  const all = await readAll();
  return normalizeOrg(all.orgs[orgId]);
}

/** Đọc-sửa-ghi tuần tự trong một org. */
export function mutateOrg<T>(orgId: string, fn: (org: OrgData) => T | Promise<T>): Promise<T> {
  return withLock(async () => {
    const all = await readAll();
    const org = normalizeOrg(all.orgs[orgId]);
    const result = await fn(org);
    all.orgs[orgId] = org;
    await writeAll(all);
    return result;
  });
}
