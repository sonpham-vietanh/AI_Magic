#!/usr/bin/env node
// Sao lưu toàn bộ .data/*.json ra thư mục có dấu thời gian, kèm MANIFEST.json (SHA-256 từng tệp), giữ N bản gần nhất.
// Chạy bằng node thuần (Node >= 22), không cần cài thêm gì. Dùng được trong container Coolify.
//
//   node scripts/backup-data.mjs [--data-dir .data] [--out backups] [--keep 14] [--supabase]
//
// --supabase: kéo thêm các kho đang lưu trên Supabase (cần NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SECRET_KEY trong môi trường).
// Lưu ý: bản sao lưu này là bản THÔ (chưa loại dữ liệu nhạy cảm) nên phải giữ ở nơi chỉ quản trị viên truy cập được.
// Khác với tệp tải từ trang /quan-tri/du-lieu (đã loại token/mã/khóa, định dạng riêng, chỉ để lưu trữ và đối chiếu).
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const BACKUP_DIR_RE = /^va-backup-\d{8}T\d{6}Z$/;
const FILE_RE = /^[a-z0-9][a-z0-9-]*\.json$/;

export function parseArgs(argv) {
  const o = { dataDir: '.data', out: 'backups', keep: 14, supabase: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === '--data-dir') o.dataDir = val();
    else if (a === '--out') o.out = val();
    else if (a === '--keep') o.keep = Number(val());
    else if (a === '--supabase') o.supabase = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`Tham số không hợp lệ: ${a}`);
  }
  if (!Number.isInteger(o.keep) || o.keep < 1) throw new Error('--keep phải là số nguyên >= 1');
  return o;
}

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function stamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

async function pullSupabase(destDir) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SECRET_KEY || '').trim();
  if (!url || !key) throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SECRET_KEY nên không kéo được từ Supabase.');
  const table = process.env.SUPABASE_APP_STORE_TABLE || 'va_app_store';
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  let rows = null;
  let res = await fetch(`${url}/rest/v1/${encodeURIComponent(table)}?select=store_key,payload`, { headers });
  if (res.ok) {
    rows = (await res.json()).map((r) => ({ key: r.store_key, data: r.payload }));
  } else if (res.status === 404 || res.status === 400) {
    res = await fetch(`${url}/rest/v1/studio_kv?collection=eq.va_app_store_v2&select=id,j`, { headers });
    if (!res.ok) throw new Error(`Supabase trả HTTP ${res.status} khi đọc phân vùng va_app_store_v2.`);
    rows = (await res.json()).map((r) => ({ key: r.id, data: r.j }));
  } else {
    throw new Error(`Supabase trả HTTP ${res.status} khi đọc bảng ${table}.`);
  }
  await mkdir(destDir, { recursive: true });
  const files = {};
  for (const r of rows) {
    if (!FILE_RE.test(`${r.key}.json`)) continue;
    const buf = Buffer.from(JSON.stringify(r.data), 'utf8');
    await writeFile(join(destDir, `${r.key}.json`), buf);
    files[`${r.key}.json`] = { sha256: sha256(buf), bytes: buf.length };
  }
  return files;
}

export async function runBackup(opts, now = new Date()) {
  const dataDir = resolve(opts.dataDir);
  const outRoot = resolve(opts.out);
  let names;
  try {
    names = (await readdir(dataDir)).filter((n) => FILE_RE.test(n));
  } catch (e) {
    throw new Error(`Không đọc được thư mục dữ liệu ${dataDir} (${e.code || e.message}).`);
  }
  const dest = join(outRoot, `va-backup-${stamp(now)}`);
  await mkdir(dest, { recursive: true });

  const files = {};
  for (const n of names.sort()) {
    const src = join(dataDir, n);
    const before = await readFile(src);
    // Kiểm tra là JSON hợp lệ để cảnh báo sớm, nhưng vẫn sao lưu nguyên bản.
    try {
      JSON.parse(before.toString('utf8'));
    } catch {
      console.warn(`CẢNH BÁO: ${n} không phải JSON hợp lệ (vẫn sao lưu nguyên bản).`);
    }
    await copyFile(src, join(dest, n));
    const copied = await readFile(join(dest, n));
    if (sha256(copied) !== sha256(before)) {
      // Tệp đổi giữa lúc đọc và chép (app đang ghi): chép lại một lần.
      await copyFile(src, join(dest, n));
    }
    const final = await readFile(join(dest, n));
    files[n] = { sha256: sha256(final), bytes: final.length };
  }

  let supabase = null;
  if (opts.supabase) {
    supabase = await pullSupabase(join(dest, 'supabase'));
  }

  const manifest = {
    format: 'va-disk-backup',
    version: 1,
    createdAt: now.toISOString(),
    sourceDataDir: dataDir,
    files,
    ...(supabase ? { supabase } : {}),
  };
  await writeFile(join(dest, 'MANIFEST.json'), JSON.stringify(manifest, null, 2), 'utf8');

  // Giữ N bản gần nhất (chỉ xóa thư mục đúng mẫu tên của chính script này).
  const all = (await readdir(outRoot)).filter((n) => BACKUP_DIR_RE.test(n)).sort();
  const removed = [];
  for (const old of all.slice(0, Math.max(0, all.length - opts.keep))) {
    const p = join(outRoot, old);
    if ((await stat(p)).isDirectory()) {
      await rm(p, { recursive: true, force: true });
      removed.push(old);
    }
  }
  return { dest, manifest, removed, kept: all.length - removed.length };
}

// Chạy phần chính trừ khi đang được import trong test (cũng chạy được khi nạp qua stdin: node --input-type=module -).
const invokedDirectly = !process.env.VITEST;
if (invokedDirectly) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
      console.log('Dùng: node scripts/backup-data.mjs [--data-dir .data] [--out backups] [--keep 14] [--supabase]');
      process.exit(0);
    }
    const r = await runBackup(opts);
    const n = Object.keys(r.manifest.files).length;
    console.log(`Đã sao lưu ${n} tệp vào ${r.dest}`);
    if (r.manifest.supabase) console.log(`Đã kéo ${Object.keys(r.manifest.supabase).length} kho từ Supabase.`);
    if (r.removed.length) console.log(`Đã xóa ${r.removed.length} bản cũ (giữ ${r.kept}).`);
  } catch (e) {
    console.error(`LỖI: ${e.message}`);
    process.exit(1);
  }
}
