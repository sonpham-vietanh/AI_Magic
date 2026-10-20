import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'package.json',
  'tsconfig.json',
  'next.config.ts',
  'README.md',
  'docs/PRD.md',
  'docs/MAGICSCHOOL_BENCHMARK.md',
  'docs/ARCHITECTURE_AND_KNOWLEDGE_GRAPH.md',
  'ops/major-os-mo-ta.md',
  'supabase/migrations/20261016000001_init_teaching_resources.sql',
  'lib/types.ts',
  'lib/catalog/categories.ts',
  'lib/catalog/tools-part1.ts',
  'lib/catalog/tools-part2.ts',
  'lib/catalog/index.ts',
  'lib/knowledge-graph/nodes.ts',
  'lib/knowledge-graph/edges.ts',
  'lib/knowledge-graph/index.ts',
  'lib/classes/profiles.ts',
  'lib/classes/index.ts',
  'lib/engine/promptBuilder.ts',
  'lib/engine/llmClient.ts',
  'lib/engine/smartGenerator.ts',
  'lib/server/store.ts',
  'app/layout.tsx',
  'app/globals.css',
  'app/page.tsx',
  'app/so-do-lien-mon/page.tsx',
  'app/ho-so-lop-hoc/page.tsx',
  'app/thu-vien/page.tsx',
  'app/api/generate/route.ts',
  'app/api/assistant/route.ts',
  'app/api/resources/route.ts',
  'app/api/major-os/usage/route.ts',
  'components/Shell.tsx',
  'components/DashboardClient.tsx',
  'components/ToolStudioModal.tsx',
  'components/AssistantDrawer.tsx',
];

let failed = false;

console.log('=== KIỂM TRA HỆ THỐNG MAGICSTUDIO VIỆT ANH ===');

for (const rel of requiredFiles) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    console.error(`[FAIL] Thiếu file: ${rel}`);
    failed = true;
  }
}

const part1 = fs.readFileSync(path.join(root, 'lib/catalog/tools-part1.ts'), 'utf8');
const part2 = fs.readFileSync(path.join(root, 'lib/catalog/tools-part2.ts'), 'utf8');
const toolCount1 = (part1.match(/category:\s*'/g) || []).length;
const toolCount2 = (part2.match(/category:\s*'/g) || []).length;
const totalTools = toolCount1 + toolCount2;

console.log(`[INFO] Số lượng công cụ Phần 1: ${toolCount1}`);
console.log(`[INFO] Số lượng công cụ Phần 2: ${toolCount2}`);
console.log(`[INFO] Tổng số công cụ sư phạm: ${totalTools}`);

if (totalTools < 80) {
  console.error(`[FAIL] Tổng số công cụ (${totalTools}) nhỏ hơn yêu cầu 80 công cụ của anh Dương.`);
  failed = true;
}

const nodesContent = fs.readFileSync(path.join(root, 'lib/knowledge-graph/nodes.ts'), 'utf8');
const edgesContent = fs.readFileSync(path.join(root, 'lib/knowledge-graph/edges.ts'), 'utf8');
const nodeCount = (nodesContent.match(/moetRequiredOutcomes:/g) || []).length;
const edgeCount = (edgesContent.match(/relation:\s*'/g) || []).length;
console.log(`[INFO] Knowledge Graph: ${nodeCount} nút kiến thức, ${edgeCount} cạnh liên kết liên môn.`);

const classesContent = fs.readFileSync(path.join(root, 'lib/classes/profiles.ts'), 'utf8');
const classCount = (classesContent.match(/campus:\s*'/g) || []).length;
console.log(`[INFO] Hồ sơ Lớp học (Class DNA): ${classCount} lớp mẫu.`);

// --- Quét bí mật (pattern ghép chuỗi để file này không tự khớp) ---
const secretPatterns = [
  ['sb_' + 'secret_', /sb_secret_/],
  ['sb_' + 'publishable_', /sb_publishable_/],
  ['sk-', /sk-[a-z0-9]{8,}/i],
  ['abc-' + 'tunnel', /abc-tunnel/],
  ['va-major-os-' + 'secret', /va-major-os-secret/],
];
const skipDirs = new Set(['node_modules', '.next', '.data', '.git']);
const textExt = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|sql|txt|example)$/i;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (textExt.test(e.name)) out.push(full);
  }
  return out;
}

const scanFiles = [
  ...['app', 'components', 'lib', 'scripts', 'docs', 'ops'].flatMap((d) => walk(path.join(root, d))),
  ...fs.readdirSync(root).filter((f) => f.endsWith('.md') || f === '.env.example').map((f) => path.join(root, f)),
];
let secretHits = 0;
for (const file of scanFiles) {
  if (path.basename(file) === 'smoke-test.mjs') continue; // file này chứa định nghĩa pattern
  const lines = fs.readFileSync(file, 'utf8').split(String.fromCharCode(10));
  lines.forEach((line, i) => {
    for (const [name, re] of secretPatterns) {
      if (re.test(line)) {
        console.error(`[FAIL] Nghi lộ bí mật (${name}) tại ${path.relative(root, file)}:${i + 1}`);
        secretHits++;
      }
    }
  });
}
if (secretHits > 0) failed = true;
else console.log(`[INFO] Quét bí mật: sạch (${scanFiles.length} file).`);

// --- demo=1 không được tồn tại trong app/ hoặc components/ ---
for (const file of ['app', 'components'].flatMap((d) => walk(path.join(root, d)))) {
  const lines = fs.readFileSync(file, 'utf8').split(String.fromCharCode(10));
  lines.forEach((line, i) => {
    if (line.includes('demo=1')) {
      console.error(`[FAIL] Còn "demo=1" tại ${path.relative(root, file)}:${i + 1}`);
      failed = true;
    }
  });
}

if (failed) {
  process.exit(1);
}

console.log(`[PASS] Cấu trúc dự án, ${totalTools} công cụ, Knowledge Graph, Class DNA, quét bí mật và Major OS v2 đạt chuẩn!`);
