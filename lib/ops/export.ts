// Dựng gói sao lưu từ các kho thật (đọc qua readJsonStrict). Lỗi đọc một kho làm hỏng cả gói: không xuất gói thiếu mà im lặng.
import { STORE_KEYS } from '../server/supabaseStore';
import { buildBundle, type Bundle } from './exportBundle';
import { readStoreData } from './stores';

export async function buildExportFromStores(createdBy: string): Promise<Bundle> {
  const raw: Record<string, unknown> = {};
  for (const key of STORE_KEYS) raw[key] = await readStoreData(key);
  return buildBundle(raw, { createdBy });
}
