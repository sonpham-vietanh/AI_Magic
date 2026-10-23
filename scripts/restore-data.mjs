#!/usr/bin/env node
// Khôi phục .data/*.json từ một thư mục do scripts/backup-data.mjs tạo. MẶC ĐỊNH CHỈ XEM THỬ (dry-run).
//
//   node scripts/restore-data.mjs <thư-mục-sao-lưu> [--target .data]            (xem thử, không ghi gì)
//   node scripts/restore-data.mjs <thư-mục-sao-lưu> --apply [--only a,b] [--yes] (ghi thật, có hỏi xác nhận)
//
// An toàn:
//  - Kiểm tra SHA-256 từng tệp theo MANIFEST.json trước; có tệp lệch thì dừng, không ghi gì.
//  - Trước khi ghi đè, tệp hiện có được giữ lại thành <tên>.json.pre-restore-<thời điểm>.
//  - Ghi nguyên tử (tệp tạm rồi đổi tên). Chỉ khôi phục các tệp .json có tên hợp lệ trong manifest.
//  - NÊN TẮT ứng dụng (hoặc dừng ghi) trước khi khôi phục; script không tự kiểm tra được.
//  - Không khôi phục lên Supabase (thư mục supabase/ trong bản sao lưu chỉ để đối chiếu thủ công).
//  - --apply hỏi gõ "KHOI PHUC"; môi trường không có bàn phím phải thêm --yes một cách chủ động.
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

const FILE_RE = /^[a-z0-9][a-z0-9-]*\.json$/;
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function parseArgs(argv) {
  const o = { source: '', target: '.data', apply: false, yes: false, only: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target') o.target = argv[++i];
    else if (a === '--apply') o.apply = true;
    else if (a === '--yes') o.yes = true;
    else if (a === '--dry-run') o.apply = false;
    else if (a === '--only') o.only = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('--')) throw new Error(`Tham số không hợp lệ: ${a}`);
    else if (!o.source) o.source = a;
    else throw new Error(`Thừa tham số: ${a}`);
  }
  return o;
}

/** Đọc manifest và kiểm tra checksum mọi tệp. Trả về { files, problems }. */
export async function verifyBackupDir(dir) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(dir, 'MANIFEST.json'), 'utf8'));
  } catch (e) {
    throw new Error(`Không đọc được MANIFEST.json trong ${dir} (${e.code || e.message}).`);
  }
  if (manifest?.format !== 'va-disk-backup' || typeof manifest.files !== 'object' || !manifest.files) {
    throw new Error('MANIFEST.json không đúng định dạng va-disk-backup.');
  }
  const files = [];
  const problems = [];
  for (const [name, meta] of Object.entries(manifest.files)) {
    if (!FILE_RE.test(name)) {
      problems.push(`${name}: tên tệp không hợp lệ, bỏ qua`);
      continue;
    }
    try {
      const buf = await readFile(join(dir, name));
      if (sha256(buf) !== meta.sha256) problems.push(`${name}: checksum không khớp`);
      else files.push({ name, bytes: buf.length, sha256: meta.sha256 });
    } catch (e) {
      problems.push(`${name}: không đọc được (${e.code || e.message})`);
    }
  }
  return { manifest, files, problems };
}

async function currentSha(path) {
  try {
    return sha256(await readFile(path));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export async function planRestore(opts) {
  const dir = resolve(opts.source);
  const target = resolve(opts.target);
  const { manifest, files, problems } = await verifyBackupDir(dir);
  let selected = files;
  if (opts.only) {
    const missing = opts.only.filter((n) => !files.some((f) => f.name === `${n}.json`));
    if (missing.length) throw new Error(`--only chứa kho không có trong bản sao lưu: ${missing.join(', ')}`);
    selected = files.filter((f) => opts.only.includes(f.name.replace(/\.json$/, '')));
  }
  const items = [];
  for (const f of selected) {
    const cur = await currentSha(join(target, f.name));
    items.push({ ...f, action: cur === null ? 'tạo mới' : cur === f.sha256 ? 'giống hệt (bỏ qua)' : 'ghi đè', same: cur === f.sha256 });
  }
  return { dir, target, manifest, items, problems };
}

export async function applyRestore(plan, now = new Date()) {
  const ts = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const done = [];
  for (const it of plan.items) {
    if (it.same) continue;
    const dest = join(plan.target, it.name);
    let existed = true;
    try {
      await stat(dest);
    } catch {
      existed = false;
    }
    if (existed) await copyFile(dest, `${dest}.pre-restore-${ts}`);
    const buf = await readFile(join(plan.dir, it.name));
    if (sha256(buf) !== it.sha256) throw new Error(`${it.name}: tệp nguồn đổi giữa chừng, dừng.`);
    const tmp = `${dest}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, buf);
    await rename(tmp, dest);
    done.push(it.name);
  }
  return done;
}

// Chạy phần chính trừ khi đang được import trong test (cũng chạy được khi nạp qua stdin: node --input-type=module -).
const invokedDirectly = !process.env.VITEST;
if (invokedDirectly) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help || !opts.source) {
      console.log('Dùng: node scripts/restore-data.mjs <thư-mục-sao-lưu> [--target .data] [--only a,b] [--apply [--yes]]');
      process.exit(opts.help ? 0 : 1);
    }
    const plan = await planRestore(opts);
    console.log(`Bản sao lưu: ${plan.dir} (tạo lúc ${plan.manifest.createdAt})`);
    console.log(`Đích: ${plan.target}`);
    for (const it of plan.items) console.log(`  - ${it.name.padEnd(34)} ${it.action}`);
    if (plan.problems.length) {
      console.error('\nCó vấn đề với bản sao lưu, DỪNG, không ghi gì:');
      for (const p of plan.problems) console.error(`  ! ${p}`);
      process.exit(2);
    }
    if (!opts.apply) {
      console.log('\nĐây là XEM THỬ (dry-run), chưa ghi gì. Thêm --apply để khôi phục thật.');
      process.exit(0);
    }
    const toWrite = plan.items.filter((i) => !i.same);
    if (toWrite.length === 0) {
      console.log('\nKhông có gì cần ghi.');
      process.exit(0);
    }
    if (!opts.yes) {
      if (!process.stdin.isTTY) {
        console.error('\nKhông có bàn phím để xác nhận. Thêm --yes nếu chắc chắn, và nhớ tắt ứng dụng trước.');
        process.exit(1);
      }
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ans = (await rl.question(`\nSẽ ghi ${toWrite.length} tệp vào ${plan.target}. Đã tắt ứng dụng chưa? Gõ KHOI PHUC để tiếp tục: `)).trim();
      rl.close();
      if (ans !== 'KHOI PHUC') {
        console.log('Đã huỷ, chưa ghi gì.');
        process.exit(1);
      }
    }
    const done = await applyRestore(plan);
    console.log(`\nĐã khôi phục ${done.length} tệp. Bản cũ giữ lại dạng *.pre-restore-*. Khởi động lại ứng dụng.`);
  } catch (e) {
    console.error(`LỖI: ${e.message}`);
    process.exit(1);
  }
}
