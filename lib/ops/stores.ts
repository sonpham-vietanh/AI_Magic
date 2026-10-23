// Đọc trạng thái và nội dung các kho dữ liệu vận hành. Chỉ đọc qua readJsonStrict (không ghi gì).
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { readJsonStrict } from '../server/safeJson';
import { STORE_KEYS, inspectCloudStoreStatus, isCloudStoreEnabled } from '../server/supabaseStore';
import { countRecords } from './exportBundle';

const ENV_FILE: Record<string, string> = {
  assessment: 'ASSESSMENT_STORE_FILE',
  'kho-assets': 'KHO_ASSETS_FILE',
  'kho-reviews': 'KHO_REVIEWS_FILE',
  eval: 'EVAL_FILE',
  signals: 'SIGNALS_FILE',
  'teacher-sessions': 'TEACHER_SESSION_STORE_PATH',
  'user-prefs': 'USER_PREFS_FILE',
  'user-roles': 'USER_ROLES_STORE_PATH',
  'usage-ledger': 'USAGE_LEDGER_FILE',
  'audit-log': 'AUDIT_LOG_STORE_PATH',
  'ops-log': 'OPS_LOG_FILE',
};

export const STORE_LABELS: Record<string, string> = {
  'teaching-studio-store': 'Học liệu đã sinh và sự kiện sử dụng',
  versions: 'Lịch sử và phiên bản cá nhân',
  'kho-reviews': 'Duyệt học liệu mẫu',
  'kho-assets': 'Học liệu mẫu trong Kho',
  assessment: 'Đề kiểm tra TT22',
  eval: 'Đánh giá chất lượng',
  signals: 'Tín hiệu chất lượng',
  'class-notes': 'Ghi chú lớp học',
  'teacher-sessions': 'Nhật ký phiên đăng nhập',
  'user-prefs': 'Tùy chọn người dùng',
  'user-roles': 'Phân quyền người dùng',
  'usage-ledger': 'Sổ sử dụng AI',
  'audit-log': 'Nhật ký quản trị',
  'ops-log': 'Nhật ký sao lưu và vận hành',
};

export function storeFilePath(key: string): string {
  const envName = ENV_FILE[key];
  const fromEnv = envName ? process.env[envName]?.trim() : '';
  return fromEnv || join(process.cwd(), '.data', `${key}.json`);
}

export interface StoreStatus {
  key: string;
  label: string;
  exists: boolean;
  bytes: number;
  records: number;
  lastWrite: string | null;
  location: 'disk' | 'supabase' | 'both' | 'none';
  cloudUpdatedAt: string | null;
  error?: string;
}

export interface InspectResult {
  cloud: { configured: boolean; enabled: boolean; backend: string; tableName: string; error?: string };
  stores: StoreStatus[];
}

/** Đọc nội dung một kho; null nếu chưa có. Ném lỗi nếu đọc hỏng (để người gọi báo lỗi, không im lặng). */
export async function readStoreData(key: string): Promise<unknown | null> {
  const data = await readJsonStrict<unknown | null>(storeFilePath(key), () => null);
  return data === undefined ? null : data;
}

async function mtimeOf(file: string): Promise<string | null> {
  try {
    return (await stat(file)).mtime.toISOString();
  } catch {
    return null;
  }
}

export async function inspectStores(): Promise<InspectResult> {
  let cloudKeys = new Map<string, string | undefined>();
  let cloud: InspectResult['cloud'] = { configured: false, enabled: isCloudStoreEnabled(), backend: 'disabled', tableName: '' };
  try {
    const c = await inspectCloudStoreStatus();
    cloud = { configured: c.configured, enabled: isCloudStoreEnabled(), backend: c.backend, tableName: c.tableName };
    cloudKeys = new Map(c.keys.map((k) => [k.key, k.updatedAt]));
    if (c.configured && c.backend === 'disabled') cloud.error = 'Không đọc được danh sách kho trên Supabase.';
  } catch {
    cloud.error = 'Không kết nối được Supabase.';
  }

  const stores: StoreStatus[] = [];
  for (const key of STORE_KEYS) {
    const file = storeFilePath(key);
    const lastWrite = await mtimeOf(file);
    const inCloud = cloudKeys.has(key);
    let bytes = 0;
    let records = 0;
    let error: string | undefined;
    if (lastWrite || inCloud) {
      try {
        const data = await readJsonStrict<unknown | null>(file, () => null);
        if (data !== null && data !== undefined) {
          bytes = Buffer.byteLength(JSON.stringify(data), 'utf8');
          records = countRecords(data);
        }
      } catch (e) {
        error = e instanceof Error ? e.message : 'Không đọc được kho.';
      }
    }
    stores.push({
      key,
      label: STORE_LABELS[key] ?? key,
      exists: Boolean(lastWrite) || inCloud,
      bytes,
      records,
      lastWrite,
      location: lastWrite && inCloud ? 'both' : inCloud ? 'supabase' : lastWrite ? 'disk' : 'none',
      cloudUpdatedAt: cloudKeys.get(key) ?? null,
      ...(error ? { error } : {}),
    });
  }
  return { cloud, stores };
}
