#!/usr/bin/env node
// Kiểm tra RLS của Supabase từ góc nhìn "khách" (anon): chỉ ĐỌC, không ghi, không in khóa, không in nội dung hàng.
//
//   node scripts/check-rls.mjs [--env-file .env.local] [--json]
//
// Cần NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (trong môi trường hoặc --env-file).
// Kết quả mỗi bảng:
//   DOC_DUOC       anon đọc được ít nhất 1 hàng  -> RÒ RỈ, cần bật RLS
//   TRONG_HOAC_CHAN  HTTP 200 nhưng 0 hàng (bảng trống HOẶC RLS lọc hết; script không phân biệt được)
//   CHAN           401/403: anon bị từ chối
//   KHONG_CO       bảng không tồn tại (hoặc không lộ qua API)
// Mã thoát: 0 = không có bảng vận hành nào đọc được; 2 = va_app_store / va_app_store_v2 đọc được; 1 = lỗi chạy.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TABLES = ['va_app_store', 'studio_kv', 'resources', 'users', 'atoms', 'edges', 'questions', 'socratic', 'packages', 'tainguyen', 'activity', 'reviews', '_meta'];

export function loadEnvFile(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

export function classify(status, bodyText) {
  if (status === 200) {
    try {
      const rows = JSON.parse(bodyText);
      return Array.isArray(rows) && rows.length > 0 ? 'DOC_DUOC' : 'TRONG_HOAC_CHAN';
    } catch {
      return 'LOI';
    }
  }
  if (status === 401 || status === 403) return 'CHAN';
  if (status === 404 || (status === 400 && /PGRST205|42P01|does not exist/.test(bodyText))) return 'KHONG_CO';
  return 'LOI';
}

async function probe(url, key, path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Range: '0-0' },
    cache: 'no-store',
  });
  const text = await res.text();
  return classify(res.status, text);
}

export async function checkRls(url, key) {
  const results = [];
  for (const t of TABLES) {
    results.push({ target: t, result: await probe(url, key, `${encodeURIComponent(t)}?select=*&limit=1`).catch(() => 'LOI') });
  }
  results.push({
    target: "studio_kv (collection 'va_app_store_v2')",
    result: await probe(url, key, 'studio_kv?collection=eq.va_app_store_v2&select=id&limit=1').catch(() => 'LOI'),
  });
  return results;
}

// Chạy phần chính trừ khi đang được import trong test (cũng chạy được khi nạp qua stdin: node --input-type=module -).
const invokedDirectly = !process.env.VITEST;
if (invokedDirectly) {
  try {
    const argv = process.argv.slice(2);
    const fi = argv.indexOf('--env-file');
    const json = argv.includes('--json');
    const fileEnv = fi >= 0 ? loadEnvFile(argv[fi + 1]) : {};
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || fileEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();
    if (!url || !key) throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
    const results = await checkRls(url, key);
    if (json) console.log(JSON.stringify(results, null, 2));
    else for (const r of results) console.log(`${r.result.padEnd(16)} ${r.target}`);
    const leaked = results.filter((r) => r.result === 'DOC_DUOC');
    const ops = leaked.filter((r) => r.target === 'va_app_store' || r.target.includes('va_app_store_v2'));
    if (!json) {
      console.log(leaked.length ? `\nanon ĐỌC ĐƯỢC ${leaked.length} mục ở trên (kiểm tra xem có chủ ý công khai không).` : '\nanon không đọc được hàng nào.');
      console.log('Lưu ý: TRONG_HOAC_CHAN không chứng minh được RLS đã bật (bảng có thể đang trống).');
    }
    process.exit(ops.length ? 2 : 0);
  } catch (e) {
    console.error(`LỖI: ${e.message}`);
    process.exit(1);
  }
}
