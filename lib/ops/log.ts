// Nhật ký vận hành tối thiểu (xem trạng thái, xuất, kiểm tra sao lưu). Ghi vào kho `ops-log`, giữ tối đa 500 dòng gần nhất.
// Tách riêng để không phụ thuộc agent Quản trị; có thể chuyển sang hàm ghi nhật ký chung (lib/users/audit.ts) sau.
import { randomUUID } from 'node:crypto';
import { createMutex, readJsonStrict, writeJsonAtomic } from '../server/safeJson';
import { storeFilePath } from './stores';

export interface OpsLogEntry {
  id: string;
  at: string;
  actor: string;
  action: 'export' | 'verify';
  detail?: string;
}

const MAX = 500;
const mutex = createMutex();

export async function appendOpsLog(entry: Omit<OpsLogEntry, 'id' | 'at'>): Promise<void> {
  await mutex(async () => {
    const file = storeFilePath('ops-log');
    const cur = await readJsonStrict<{ entries?: OpsLogEntry[] }>(file, () => ({ entries: [] }));
    const list = Array.isArray(cur.entries) ? cur.entries : [];
    list.push({ id: randomUUID(), at: new Date().toISOString(), ...entry, detail: entry.detail?.slice(0, 300) });
    await writeJsonAtomic(file, { entries: list.slice(-MAX) });
  });
}

export async function readOpsLog(limit = 20): Promise<OpsLogEntry[]> {
  const cur = await readJsonStrict<{ entries?: OpsLogEntry[] }>(storeFilePath('ops-log'), () => ({ entries: [] }));
  return (Array.isArray(cur.entries) ? cur.entries : []).slice(-limit).reverse();
}
