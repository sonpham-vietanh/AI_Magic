// Gói sao lưu/xuất dữ liệu: loại dữ liệu nhạy cảm, tính checksum SHA-256 từng kho, và kiểm tra lại gói đã tải lên.
// Hàm thuần (không đọc ghi đĩa) để dễ kiểm thử. Chỉ KIỂM TRA gói, không bao giờ khôi phục tự động.
import { createHash } from 'node:crypto';

export const BUNDLE_FORMAT = 'va-backup';
export const BUNDLE_VERSION = 1;

export interface StoreManifestEntry {
  sha256: string;
  bytes: number;
  records: number;
  redactedFields: number;
}

export interface BundleManifest {
  format: typeof BUNDLE_FORMAT;
  version: number;
  createdAt: string;
  createdBy: string;
  stores: Record<string, StoreManifestEntry>;
  /** Kho chưa có dữ liệu (chưa tạo tệp) nên không đưa vào gói. */
  empty: string[];
  note: string;
}

export interface Bundle {
  manifest: BundleManifest;
  stores: Record<string, unknown>;
}

const SENSITIVE_EXACT = new Set([
  'code', 'key', 'sig', 'signature', 'verifier', 'codeverifier', 'sessionid', 'otp', 'pin', 'csrf', 'jwt', 'cookie',
]);
const SENSITIVE_PART = ['token', 'secret', 'password', 'passwd', 'apikey', 'authorization', 'cookie', 'privatekey'];

/** Tên trường có phải dữ liệu nhạy cảm (token phiên, mã, khóa)? Email KHÔNG nằm trong nhóm này. */
export function isSensitiveKey(name: string): boolean {
  const k = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!k) return false;
  if (SENSITIVE_EXACT.has(k) || k.endsWith('key')) return true;
  return SENSITIVE_PART.some((p) => k.includes(p));
}

/** Sao chép sâu và bỏ các trường nhạy cảm. Trả về dữ liệu đã làm sạch và số trường đã loại. */
export function redactSensitive(value: unknown): { value: unknown; removed: number } {
  let removed = 0;
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > 60) return null;
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (isSensitiveKey(k)) {
          removed++;
          continue;
        }
        out[k] = walk(x, depth + 1);
      }
      return out;
    }
    return v;
  };
  return { value: walk(value, 0), removed };
}

/** JSON ổn định (khóa sắp xếp) để checksum không phụ thuộc thứ tự khóa sau khi truyền qua lại. */
export function stableStringify(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) out[k] = walk(o[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value)) ?? 'null';
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Đếm số bản ghi: mảng gốc = độ dài; đối tượng = tổng độ dài các mảng cấp 1 (nếu có) hoặc số khóa. */
export function countRecords(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    const vals = Object.values(data as Record<string, unknown>);
    const arrays = vals.filter(Array.isArray) as unknown[][];
    if (arrays.length > 0) return arrays.reduce((n, a) => n + a.length, 0);
    return vals.length;
  }
  return data == null ? 0 : 1;
}

export function buildBundle(
  rawStores: Record<string, unknown>,
  opts: { createdBy: string; now?: Date },
): Bundle {
  const stores: Record<string, unknown> = {};
  const manifestStores: Record<string, StoreManifestEntry> = {};
  const empty: string[] = [];
  for (const key of Object.keys(rawStores).sort()) {
    const raw = rawStores[key];
    if (raw === null || raw === undefined) {
      empty.push(key);
      continue;
    }
    const { value, removed } = redactSensitive(raw);
    const text = stableStringify(value);
    stores[key] = value;
    manifestStores[key] = {
      sha256: sha256Hex(text),
      bytes: Buffer.byteLength(text, 'utf8'),
      records: countRecords(value),
      redactedFields: removed,
    };
  }
  return {
    manifest: {
      format: BUNDLE_FORMAT,
      version: BUNDLE_VERSION,
      createdAt: (opts.now ?? new Date()).toISOString(),
      createdBy: opts.createdBy,
      stores: manifestStores,
      empty,
      note: 'Đã loại token phiên, mã và khóa. Email giữ nguyên. Gói này chỉ để lưu trữ và đối chiếu, không khôi phục tự động.',
    },
    stores,
  };
}

export interface StoreCheck {
  key: string;
  ok: boolean;
  records: number;
  bytes: number;
  expectedSha256?: string;
  actualSha256?: string;
  problem?: string;
}

export interface VerifyReport {
  ok: boolean;
  version?: number;
  createdAt?: string;
  createdBy?: string;
  checks: StoreCheck[];
  errors: string[];
  warnings: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Xác thực cấu trúc và checksum của gói. Không ném lỗi; mọi vấn đề nằm trong báo cáo. */
export function verifyBundle(input: unknown, knownKeys: readonly string[] = []): VerifyReport {
  const report: VerifyReport = { ok: false, checks: [], errors: [], warnings: [] };
  if (!isObj(input)) {
    report.errors.push('Tệp không phải một gói sao lưu (không phải đối tượng JSON).');
    return report;
  }
  const manifest = input.manifest;
  const stores = input.stores;
  if (!isObj(manifest)) report.errors.push('Thiếu phần "manifest".');
  if (!isObj(stores)) report.errors.push('Thiếu phần "stores".');
  if (!isObj(manifest) || !isObj(stores)) return report;

  if (manifest.format !== BUNDLE_FORMAT) report.errors.push(`Định dạng không đúng (cần "${BUNDLE_FORMAT}").`);
  if (typeof manifest.version !== 'number') report.errors.push('Thiếu số phiên bản gói.');
  else if (manifest.version > BUNDLE_VERSION) {
    report.errors.push(`Gói phiên bản ${manifest.version} mới hơn bản hệ thống này hiểu (${BUNDLE_VERSION}).`);
  } else report.version = manifest.version;
  if (typeof manifest.createdAt === 'string') {
    if (Number.isNaN(Date.parse(manifest.createdAt))) report.warnings.push('Thời điểm tạo gói không hợp lệ.');
    else report.createdAt = manifest.createdAt;
  } else report.warnings.push('Thiếu thời điểm tạo gói.');
  if (typeof manifest.createdBy === 'string') report.createdBy = manifest.createdBy;

  const mStores = manifest.stores;
  if (!isObj(mStores)) {
    report.errors.push('Manifest thiếu danh sách checksum các kho.');
    return report;
  }

  for (const key of Object.keys(mStores).sort()) {
    const entry = mStores[key];
    const expected = isObj(entry) && typeof entry.sha256 === 'string' ? entry.sha256 : undefined;
    if (!(key in stores)) {
      report.checks.push({ key, ok: false, records: 0, bytes: 0, expectedSha256: expected, problem: 'Manifest có kho này nhưng phần dữ liệu bị thiếu.' });
      continue;
    }
    if (!expected || !/^[0-9a-f]{64}$/.test(expected)) {
      report.checks.push({ key, ok: false, records: 0, bytes: 0, problem: 'Checksum trong manifest thiếu hoặc sai dạng.' });
      continue;
    }
    const text = stableStringify(stores[key]);
    const actual = sha256Hex(text);
    const match = actual === expected;
    report.checks.push({
      key,
      ok: match,
      records: countRecords(stores[key]),
      bytes: Buffer.byteLength(text, 'utf8'),
      expectedSha256: expected,
      actualSha256: actual,
      ...(match ? {} : { problem: 'Checksum không khớp: dữ liệu đã bị sửa hoặc hỏng.' }),
    });
    if (redactSensitive(stores[key]).removed > 0) {
      report.warnings.push(`Kho "${key}" còn chứa trường có vẻ nhạy cảm (token, mã, khóa). Không nên lưu gói này ở nơi công khai.`);
    }
  }
  for (const key of Object.keys(stores)) {
    if (!(key in mStores)) report.errors.push(`Kho "${key}" có dữ liệu nhưng không có checksum trong manifest.`);
  }
  if (knownKeys.length > 0) {
    for (const key of Object.keys(stores)) {
      if (!knownKeys.includes(key)) report.warnings.push(`Kho "${key}" không thuộc danh sách kho hiện hành của hệ thống.`);
    }
  }
  if (report.checks.length === 0) report.warnings.push('Gói không có kho dữ liệu nào.');
  for (const c of report.checks) if (!c.ok) report.errors.push(`Kho "${c.key}": ${c.problem ?? 'không hợp lệ'}`);

  report.ok = report.errors.length === 0;
  return report;
}
