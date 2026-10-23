// Phát hiện lớp CSS bị định nghĩa ở NHIỀU tệp (nguyên nhân lỗi kiểu thẻ trắng đè lên thanh bên navy).
// Chạy: node scripts/qa/css-collisions.mjs [--strict]
// Báo: các lớp có luật ở >= 2 tệp CSS khác nhau, kèm có đặt thuộc tính màu/nền (color, background...) hay không.
// --strict: thoát mã 1 nếu còn lớp trùng mà cả hai nơi đều đặt màu/nền (nguy cơ xung đột thật).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dirs = ['app', 'components'];
const files = [];
function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.css')) files.push(p);
  }
}
for (const d of dirs) {
  try {
    walk(join(ROOT, d));
  } catch {}
}

const colorProp = /(^|[;{\s])(color|background(-color|-image)?|border(-color)?)\s*:/;
const byClass = new Map(); // class -> Map(file -> {colored:boolean, rules:number})
for (const f of files) {
  const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // lấy từng khối "selector { body }" (bỏ qua at-rule lồng nhau ở mức đơn giản)
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim();
    if (sel.startsWith('@')) continue;
    const body = m[2];
    const colored = colorProp.test(body);
    for (const cm of sel.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
      const cls = cm[1];
      // chỉ tính lớp là "chủ thể" của luật (phần tử đích cuối cùng của selector)
      const last = sel.split(/[,]/).map((s) => s.trim());
      const isSubject = last.some((s) => {
        const tail = s.split(/[\s>+~]+/).pop() || '';
        return tail.includes('.' + cls);
      });
      if (!isSubject) continue;
      if (!byClass.has(cls)) byClass.set(cls, new Map());
      const fm = byClass.get(cls);
      const rec = fm.get(f) || { colored: false, rules: 0 };
      rec.rules++;
      rec.colored = rec.colored || colored;
      fm.set(f, rec);
    }
  }
}

const rel = (p) => p.replace(ROOT, '').replace(/\\/g, '/');
const rows = [];
for (const [cls, fm] of byClass) {
  if (fm.size < 2) continue;
  const list = [...fm.entries()].map(([f, r]) => ({ file: rel(f), colored: r.colored, rules: r.rules }));
  const coloredFiles = list.filter((x) => x.colored).length;
  rows.push({ cls, coloredFiles, files: list });
}
rows.sort((a, b) => b.coloredFiles - a.coloredFiles || a.cls.localeCompare(b.cls));
const risky = rows.filter((r) => r.coloredFiles >= 2);
console.log(`Tổng lớp bị định nghĩa ở >=2 tệp: ${rows.length}; trong đó cả hai nơi đều đặt màu/nền (nguy cơ xung đột thật): ${risky.length}`);
for (const r of risky) {
  console.log(`\n.${r.cls}`);
  for (const f of r.files) console.log(`   ${f.colored ? '[màu/nền]' : '[bố cục ]'} ${f.file} (${f.rules} luật)`);
}
if (process.argv.includes('--strict') && risky.length) process.exit(1);
