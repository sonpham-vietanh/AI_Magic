import type {
  GeneratedResource,
  GradeLevel,
  SubjectCode,
  ToolCategoryCode,
} from './types';
import { searchAtoms } from './ui/lessonList';

// Không hard-code khoá. Thiếu biến môi trường sẽ báo lỗi khi gọi (lazy), không phải lúc import.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

// Chỉ có giá trị phía server (biến không có tiền tố NEXT_PUBLIC_).
export const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';

function getApiKey(): string {
  const key =
    typeof window === 'undefined'
      ? SUPABASE_SECRET_KEY || SUPABASE_PUBLISHABLE_KEY
      : SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !key) {
    throw new Error(
      'Thiếu cấu hình Supabase: cần NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (hoặc SUPABASE_SECRET_KEY trên server).',
    );
  }
  return key;
}

const SAFE_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

/** Id hợp lệ: chỉ [A-Za-z0-9_.:-], tối đa 128 ký tự. */
export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_ID_RE.test(id);
}

/** Trả về id nếu an toàn, ngược lại ném lỗi. */
export function assertSafeId(id: unknown): string {
  if (!isSafeId(id)) throw new Error('Mã định danh không hợp lệ');
  return id;
}

/**
 * Làm sạch giá trị tìm kiếm đưa vào bộ lọc PostgREST (or=(...), ilike...):
 * loại các ký tự đặc biệt , ( ) * " \ % : & # ? ; < > và ký tự điều khiển.
 */
export function escapeFilterValue(q: string, maxLen = 100): string {
  return String(q ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[,()*"'`\\%&#?;<>{}[\]|^~=+!@$:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function replaceInnermost(
  text: string,
  re: RegExp,
  fn: (...m: string[]) => string,
): string {
  let out = text;
  for (let i = 0; i < 12; i++) {
    const next = out.replace(re, fn);
    if (next === out) break;
    out = next;
  }
  return out;
}

function wrapIfComplex(x: string): string {
  const t = x.trim();
  return /^[\wℚℝℤℕα-ωΑ-Ω.]+$/.test(t) ? t : `(${t})`;
}

export function cleanFactoryText(raw?: string | null): string {
  if (!raw) return '';
  let t = String(raw)
    .replace(/\\[()[\]]/g, '')
    // Chỉ bỏ cặp $...$ / $$...$$ dạng công thức (không có khoảng trắng sát dấu), giữ "5$" hay "$5"
    .replace(/\$\$([\s\S]+?)\$\$/g, '$1')
    .replace(/\$(?!\s)([^$\n]*?[^\s$])\$/g, '$1')
    .replace(/\$([^\s$\\])\$/g, '$1');

  t = replaceInnermost(
    t,
    /\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,
    (_m, a, b) => `${wrapIfComplex(a)}/${wrapIfComplex(b)}`,
  );
  t = replaceInnermost(t, /\\sqrt\s*\{([^{}]*)\}/g, (_m, a) => `√(${a})`);
  t = replaceInnermost(
    t,
    /\\(?:text|mathrm|mathbf|mathit|mathsf|operatorname)\s*\{([^{}]*)\}/g,
    (_m, a) => a,
  );
  t = replaceInnermost(
    t,
    /\\(?:overrightarrow|vec)\s*\{([^{}]*)\}/g,
    (_m, a) => `${a.trim()}\u20d7`,
  );
  t = replaceInnermost(
    t,
    /\\(?:widehat|hat)\s*\{([^{}]*)\}/g,
    (_m, a) => `∠${a.trim()}`,
  );
  t = replaceInnermost(
    t,
    /\\(?:overline|bar)\s*\{([^{}]*)\}/g,
    (_m, a) => a.trim(),
  );

  return t
    .replace(/\^\s*\{\s*\\circ\s*\}/g, '°')
    .replace(/\^\s*\\circ\b/g, '°')
    .replace(/\\circ\b/g, '°')
    .replace(/\\mathbb\{Q\}/g, 'ℚ')
    .replace(/\\mathbb\{R\}/g, 'ℝ')
    .replace(/\\mathbb\{Z\}/g, 'ℤ')
    .replace(/\\mathbb\{N\}/g, 'ℕ')
    .replace(/\\mathbb\{C\}/g, 'ℂ')
    .replace(/\\in\b/g, '∈')
    .replace(/\\notin\b/g, '∉')
    .replace(/\\subseteq\b/g, '⊆')
    .replace(/\\subset\b/g, '⊂')
    .replace(/\\supseteq\b/g, '⊇')
    .replace(/\\supset\b/g, '⊃')
    .replace(/\\cup\b/g, '∪')
    .replace(/\\cap\b/g, '∩')
    .replace(/\\emptyset\b/g, '∅')
    .replace(/\\varnothing\b/g, '∅')
    .replace(/\\setminus\b/g, '\\')
    .replace(/\\backslash\b/g, '\\')
    .replace(/\\leq?\b/g, '≤')
    .replace(/\\geq?\b/g, '≥')
    .replace(/\\neq?\b/g, '≠')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\equiv\b/g, '≡')
    .replace(/\\sim\b/g, '∼')
    .replace(/\\cong\b/g, '≅')
    .replace(/\\pm\b/g, '±')
    .replace(/\\mp\b/g, '∓')
    .replace(/\\times\b/g, '×')
    .replace(/\\div\b/g, '÷')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\ast\b/g, '*')
    .replace(/\\perp\b/g, '⊥')
    .replace(/\\parallel\b/g, '∥')
    .replace(/\\angle\b/g, '∠')
    .replace(/\\triangle\b/g, '△')
    .replace(/\\Leftrightarrow\b/g, '⇔')
    .replace(/\\iff\b/g, '⇔')
    .replace(/\\Rightarrow\b/g, '⇒')
    .replace(/\\implies\b/g, '⇒')
    .replace(/\\Leftarrow\b/g, '⇐')
    .replace(/\\leftrightarrow\b/g, '↔')
    .replace(/\\(?:rightarrow|to)\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\\forall\b/g, '∀')
    .replace(/\\exists\b/g, '∃')
    .replace(/\\infty\b/g, '∞')
    .replace(/\\partial\b/g, '∂')
    .replace(/\\sum\b/g, '∑')
    .replace(/\\prod\b/g, '∏')
    .replace(/\\int\b/g, '∫')
    .replace(/\\alpha\b/g, 'α')
    .replace(/\\beta\b/g, 'β')
    .replace(/\\gamma\b/g, 'γ')
    .replace(/\\delta\b/g, 'δ')
    .replace(/\\epsilon\b/g, 'ε')
    .replace(/\\varepsilon\b/g, 'ε')
    .replace(/\\theta\b/g, 'θ')
    .replace(/\\lambda\b/g, 'λ')
    .replace(/\\mu\b/g, 'μ')
    .replace(/\\sigma\b/g, 'σ')
    .replace(/\\omega\b/g, 'ω')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\varphi\b/g, 'φ')
    .replace(/\\phi\b/g, 'φ')
    .replace(/\\Delta\b/g, 'Δ')
    .replace(/\\Omega\b/g, 'Ω')
    .replace(/\\(?:left|right)\s*([()[\]|.{])/g, '$1')
    .replace(/\\(?:left|right)\\([{}])/g, '$1')
    .replace(
      /([0-9a-zA-Z)\]])\\(sin|cos|tan|cot|arcsin|arccos|arctan|log|ln|lim|max|min|gcd|lcm)\b/g,
      '$1·$2',
    )
    .replace(
      /\\(sin|cos|tan|cot|arcsin|arccos|arctan|log|ln|lim|max|min|gcd|lcm)\b/g,
      '$1',
    )
    .replace(/\^\s*\{\s*2\s*\}/g, '²')
    .replace(/\^\s*\{\s*3\s*\}/g, '³')
    .replace(/\^2(?![0-9])/g, '²')
    .replace(/\^3(?![0-9])/g, '³')
    .replace(/\^\s*\{([^{}]+)\}/g, (_m, exp: string) =>
      exp.trim().length <= 1 ? `^${exp.trim()}` : `^(${exp.trim()})`,
    )
    .replace(/_\s*\{([^{}]+)\}/g, (_m, sub: string) =>
      sub.trim().length <= 2 ? `_${sub.trim()}` : `_(${sub.trim()})`,
    )
    .replace(/\\[,;:!]\s*/g, ' ')
    .replace(/\\\s+/g, ' ')
    .replace(/\\([{}])/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/(^|[^\w*])\*([^\s*](?:[^*\n]*[^\s*])?)\*(?![\w*])/g, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .trim();
}

export interface SupabaseAtom {
  id: string;
  code: string;
  title: string;
  subject: string;
  grade: number;
  chapter: string;
  lesson: string;
  parent_id: string | null;
  ord: number;
  atom_type: string;
  bloom: string;
  dok: number;
  nang_luc: string | null;
  yeu_cau: string | null;
  quan_niem_sai: string | null;
  verified: boolean;
  hasFactoryPackage?: boolean;
  factoryPackageCount?: number;
  factoryAssetCount?: number;
  hasTainguyen?: boolean;
}

export interface SupabaseFactoryPackage {
  id: string;
  atomId: string;
  level: number;
  bloom: string;
  status: string;
  updatedAt?: string;
  updatedBy?: string;
  fields: {
    objective?: string;
    explanation?: string;
    example?: string;
    counterExample?: string;
    commonMistake?: string;
    strategy?: string;
    questions?: string;
  };
}

export interface SupabaseFactoryAsset {
  id: string;
  packageId: string;
  format: string;
  formatLabel: string;
  status: string;
  createdBy?: string;
  createdAt?: string;
  model?: string;
  content: Record<string, unknown>;
  sections: { heading: string; body: string }[];
}

export interface SupabaseEdge {
  id: string;
  from_id: string;
  to_id: string;
  relation: string;
  weight: number;
  bloom_gap: number | null;
  quan_niem_sai: string | null;
  tan_suat: string | null;
  remediation_hint: string | null;
  cross_subject: string | null;
  verified: boolean;
  linkedAtom?: SupabaseAtom;
  direction?: 'incoming' | 'outgoing';
}

export interface SupabaseQuestionDistractor {
  lyDo?: string;
  noiDung?: string;
}

export interface SupabaseQuestion {
  id: string;
  atom_id: string;
  noi_dung: string;
  key: string;
  tier: string;
  dok: number;
  do_kho: string;
  dap_an: string;
  loi_giai: string;
  tham_so_hoa: string;
  nhieu: SupabaseQuestionDistractor[] | null;
}

export interface SupabaseSocratic {
  id: string;
  atom_id: string;
  vi_tri: string;
  chuong: string;
  q_index: number;
  question_summary: string;
  wrong_answer: string;
  misconception: string;
  bac_1: string;
  bac_2: string;
  bac_3: string;
  bac_4: string;
  dap_an: string;
  luat_no_luc: string | null;
}

export interface SupabaseTeacherUser {
  id: string;
  name: string;
  role: string;
  title?: string;
  subject?: string;
  email?: string;
}

export interface SupabaseTainguyenMeta {
  id: string;
  ord: number;
  name: string;
  atomId: string;
  format: string;
  dok: string | number;
  uploadedAt?: string;
  uploadedBy?: string;
}

export interface SupabaseTainguyenFull extends SupabaseTainguyenMeta {
  content: string;
}

export interface SupabaseTreeNode {
  id: string;
  kind: 'subject' | 'grade' | 'chapter' | 'lesson' | string;
  parent_id: string | null;
  title: string;
  code: string;
  ord: number;
  subject: string | null;
  grade: number | null;
}

export interface SupabaseActivityItem {
  id: string;
  at: string;
  by: string;
  href?: string;
  action: string;
  target: string;
}

export interface SupabaseReviewItem {
  id: string;
  at: string;
  by: string;
  note?: string;
  aiReport?: {
    summary?: string;
    flags?: string[];
    criteria?: { ok: boolean; name: string; note: string }[];
  };
}

export interface SupabaseMetaSettings {
  philosophy?: string;
  gradeRules?: string;
  styleGuide?: string;
  tutorEmail?: string;
}

export interface SupabaseStatsOverview {
  atomsCount: number;
  edgesCount: number;
  questionsCount: number;
  socraticCount: number;
  resourcesCount: number;
  packagesCount: number;
  tainguyenCount: number;
  treeCount: number;
  activityCount: number;
  reviewsCount: number;
  users: SupabaseTeacherUser[];
  settings?: SupabaseMetaSettings;
  /** true nếu có truy vấn thất bại (số liệu có thể thiếu/không chính xác). */
  degraded?: boolean;
  errors?: string[];
}

async function sbFetch(path: string, init?: RequestInit): Promise<Response> {
  const apiKey = getApiKey();
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
}

/** Trả về null (và ghi lỗi) khi truy vấn đếm thất bại. */
async function fetchCount(
  tableAndFilter: string,
  errors: string[],
): Promise<number | null> {
  const label = tableAndFilter.split('?')[0];
  try {
    const res = await sbFetch(`/${tableAndFilter}`, {
      method: 'HEAD',
      headers: { Prefer: 'count=exact' },
    });
    if (!res.ok) {
      console.error(`[supabase] count ${label} failed: HTTP ${res.status}`);
      errors.push(`${label}: HTTP ${res.status}`);
      return null;
    }
    const range = res.headers.get('content-range');
    if (range && range.includes('/')) {
      const total = Number(range.split('/')[1]);
      if (!Number.isNaN(total)) return total;
    }
    errors.push(`${label}: thiếu content-range`);
  } catch (e) {
    console.error(
      `[supabase] count ${label} error:`,
      e instanceof Error ? e.message : 'unknown',
    );
    errors.push(`${label}: ${e instanceof Error ? e.message : 'lỗi kết nối'}`);
  }
  return null;
}

export async function fetchSupabaseOverview(): Promise<SupabaseStatsOverview> {
  const errors: string[] = [];
  const [
    atomsCountR,
    edgesCountR,
    questionsCountR,
    socraticCountR,
    resourcesCountR,
    packagesCountR,
    tainguyenCountR,
    treeCountR,
    activityCountR,
    reviewsCountR,
    usersRes,
    metaRes,
  ] = await Promise.all([
    fetchCount('atoms?select=id', errors),
    fetchCount('edges?select=id', errors),
    fetchCount('questions?select=id', errors),
    fetchCount('socratic?select=id', errors),
    fetchCount('resources?select=id', errors),
    fetchCount('studio_kv?collection=eq.packages&select=id', errors),
    fetchCount('studio_kv?collection=eq.tainguyen&select=id', errors),
    fetchCount('tree_scaffold?select=id', errors),
    fetchCount('studio_kv?collection=eq.activity&select=id', errors),
    fetchCount('studio_kv?collection=eq.reviews&select=id', errors),
    sbFetch('/studio_kv?collection=eq.users&select=id,j').catch(() => null),
    sbFetch('/studio_kv?collection=eq._meta&id=eq.settings&select=id,j').catch(
      () => null,
    ),
  ]);
  const atomsCount = atomsCountR ?? 0;
  const edgesCount = edgesCountR ?? 0;
  const questionsCount = questionsCountR ?? 0;
  const socraticCount = socraticCountR ?? 0;
  const resourcesCount = resourcesCountR ?? 0;
  const packagesCount = packagesCountR ?? 0;
  const tainguyenCount = tainguyenCountR ?? 0;
  const treeCount = treeCountR ?? 0;
  const activityCount = activityCountR ?? 0;
  const reviewsCount = reviewsCountR ?? 0;
  if (!usersRes || !usersRes.ok) {
    errors.push(`users: ${usersRes ? `HTTP ${usersRes.status}` : 'lỗi kết nối'}`);
  }
  if (!metaRes || !metaRes.ok) {
    errors.push(`settings: ${metaRes ? `HTTP ${metaRes.status}` : 'lỗi kết nối'}`);
  }

  let users: SupabaseTeacherUser[] = [];
  if (usersRes && usersRes.ok) {
    const rows = (await usersRes.json()) as {
      id: string;
      j: SupabaseTeacherUser;
    }[];
    users = rows
      .map((r) => r.j)
      .filter((u) => u && u.name)
      .map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        title: u.title,
        subject: u.subject,
        email: u.email,
      }));
  }

  let settings: SupabaseMetaSettings | undefined;
  if (metaRes && metaRes.ok) {
    const metaRows = (await metaRes.json()) as {
      id: string;
      j: SupabaseMetaSettings;
    }[];
    if (metaRows[0]?.j) {
      settings = {
        philosophy: metaRows[0].j.philosophy,
        gradeRules: metaRows[0].j.gradeRules,
        styleGuide: metaRows[0].j.styleGuide,
        tutorEmail: metaRows[0].j.tutorEmail,
      };
    }
  }

  return {
    atomsCount,
    edgesCount,
    questionsCount,
    socraticCount,
    resourcesCount,
    packagesCount,
    tainguyenCount,
    treeCount,
    activityCount,
    reviewsCount,
    users,
    settings,
    degraded: errors.length > 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

const SUBJECT_CODE_TO_DB_NAME: Record<string, string> = {
  toan: 'Toán',
  ngu_van: 'Ngữ văn',
  tieng_anh: 'Tiếng Anh',
  khtn: 'Khoa học tự nhiên',
  vat_ly: 'Vật lí',
  hoa_hoc: 'Hoá học',
  sinh_hoc: 'Sinh học',
  lich_su_dia_ly: 'Lịch sử và Địa lí',
  dia_ly: 'Địa lí',
  gdcd_gdktpl: 'Giáo dục công dân',
  tin_hoc: 'Tin học',
  cong_nghe: 'Công nghệ',
  oxford: 'Oxford English',
};

export function mapSubjectCodeToSupabaseSubject(
  code?: string,
): string | undefined {
  if (!code || code === 'all') return undefined;
  return SUBJECT_CODE_TO_DB_NAME[code] || code;
}

export function mapSupabaseSubjectToCode(subjectName?: string): SubjectCode {
  if (!subjectName) return 'toan';
  const s = subjectName.toLowerCase();
  if (s.includes('toán')) return 'toan';
  if (s.includes('ngữ văn') || s.includes('tiếng việt')) return 'ngu_van';
  if (s.includes('tiếng anh') || s.includes('oxford')) return 'tieng_anh';
  if (s.includes('khoa học tự nhiên')) return 'khtn';
  if (s.includes('vật lí') || s.includes('vật lý')) return 'vat_ly';
  if (s.includes('hoá học') || s.includes('hóa học')) return 'hoa_hoc';
  if (s.includes('sinh học')) return 'sinh_hoc';
  if (s.includes('lịch sử và địa')) return 'lich_su_dia_ly';
  if (s.includes('địa lí') || s.includes('địa lý')) return 'dia_ly';
  if (s.includes('công dân') || s.includes('kinh tế')) return 'gdcd_gdktpl';
  if (s.includes('tin học')) return 'tin_hoc';
  if (s.includes('công nghệ')) return 'cong_nghe';
  return 'toan';
}

function sanitizeAtom(a: SupabaseAtom): SupabaseAtom {
  return {
    ...a,
    title: cleanFactoryText(a.title),
    chapter: cleanFactoryText(a.chapter),
    lesson: cleanFactoryText(a.lesson),
    yeu_cau: a.yeu_cau ? cleanFactoryText(a.yeu_cau) : null,
    quan_niem_sai: a.quan_niem_sai ? cleanFactoryText(a.quan_niem_sai) : null,
  };
}

/** Tìm theo từ khoá bằng chỉ mục toàn bộ bài; trả đủ trường như truy vấn cũ (đọc lại hàng đầy đủ cho các bài tìm được). */
async function searchSupabaseAtoms(params: {
  subject?: string;
  grade?: string | number;
  search?: string;
  limit?: number;
}): Promise<{ atoms: SupabaseAtom[]; totalCount: number }> {
  const limit = Math.min(Math.max(params.limit || 60, 1), 200);
  const scoped = await listAtomIndex({
    subject: params.subject,
    grade: params.grade === undefined ? undefined : String(params.grade),
  });
  const lite = scoped.map((a) => ({ ...a, subject: a.subjectCode }));
  const hits = searchAtoms(lite, params.search || '', { limit: 10_000 });
  const top = hits.slice(0, limit);
  const ids = top.map((h) => h.atom.id).filter(isSafeId);
  const bySlim = new Map(scoped.map((a) => [a.id, a]));
  const full = new Map<string, SupabaseAtom>();
  if (ids.length) {
    const res = await sbFetch(
      `/atoms?select=id,code,title,subject,grade,chapter,lesson,parent_id,ord,atom_type,bloom,dok,nang_luc,yeu_cau,quan_niem_sai,verified&id=in.(${ids.join(',')})`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    for (const a of (await res.json()) as SupabaseAtom[]) full.set(a.id, a);
  }
  const atoms: SupabaseAtom[] = [];
  for (const h of top) {
    const row = full.get(h.atom.id);
    const slim = bySlim.get(h.atom.id);
    if (!row || !slim) continue;
    atoms.push({
      ...sanitizeAtom(row),
      hasFactoryPackage: slim.hasFactoryPackage,
      factoryPackageCount: slim.factoryPackageCount,
      factoryAssetCount: slim.factoryAssetCount,
    });
  }
  return { atoms, totalCount: hits.length };
}

export async function querySupabaseAtoms(params: {
  subject?: string;
  grade?: string | number;
  search?: string;
  parentId?: string;
  limit?: number;
  onlyFactoryReady?: boolean;
}): Promise<{ atoms: SupabaseAtom[]; totalCount: number }> {
  // Có từ khoá: tìm không dấu, hiểu đồng nghĩa (pitago/pythagore), xếp theo độ khớp, trên TOÀN BỘ bài của phạm vi lọc.
  if ((params.search || '').trim() && !params.parentId && !params.onlyFactoryReady) {
    try {
      return await searchSupabaseAtoms(params);
    } catch (err) {
      console.error('[supabase] indexed atom search failed, falling back:', err);
    }
  }
  // Fetch factory package & asset index in parallel so we can badge and prioritize Factory-ready atoms
  const [pkgIndexRes, assetIndexRes, tnIndexRes] = await Promise.all([
    sbFetch(
      '/studio_kv?collection=eq.packages&select=id,atomId:j->>atomId&limit=500',
    ),
    sbFetch(
      '/studio_kv?collection=eq.assets&select=id,packageId:j->>packageId&limit=500',
    ),
    sbFetch(
      '/studio_kv?collection=eq.tainguyen&select=id,atomId:j->>atomId&limit=800',
    ),
  ]);

  const pkgIndexRows: { id: string; atomId?: string }[] = pkgIndexRes.ok
    ? ((await pkgIndexRes.json()) as { id: string; atomId?: string }[])
    : [];
  const assetIndexRows: { id: string; packageId?: string }[] = assetIndexRes.ok
    ? ((await assetIndexRes.json()) as { id: string; packageId?: string }[])
    : [];
  const tnIndexRows: { id: string; atomId?: string }[] = tnIndexRes.ok
    ? ((await tnIndexRes.json()) as { id: string; atomId?: string }[])
    : [];

  const pkgCountByAtomId = new Map<string, number>();
  const pkgIdsByAtomId = new Map<string, string[]>();
  for (const row of pkgIndexRows) {
    if (!row.atomId) continue;
    pkgCountByAtomId.set(
      row.atomId,
      (pkgCountByAtomId.get(row.atomId) || 0) + 1,
    );
    const list = pkgIdsByAtomId.get(row.atomId) || [];
    list.push(row.id);
    pkgIdsByAtomId.set(row.atomId, list);
  }

  const assetCountByPkgId = new Map<string, number>();
  for (const row of assetIndexRows) {
    if (!row.packageId) continue;
    assetCountByPkgId.set(
      row.packageId,
      (assetCountByPkgId.get(row.packageId) || 0) + 1,
    );
  }

  const tnAtomIds = new Set<string>(
    tnIndexRows.map((r) => r.atomId || '').filter(Boolean),
  );

  // Giới hạn 100 id hợp lệ để URL không quá dài / không bị chèn bộ lọc
  const factoryAtomIds = Array.from(pkgCountByAtomId.keys())
    .filter(isSafeId)
    .slice(0, 100);

  const buildFilterParts = (): string[] => {
    const parts: string[] = [
      'select=id,code,title,subject,grade,chapter,lesson,parent_id,ord,atom_type,bloom,dok,nang_luc,yeu_cau,quan_niem_sai,verified',
      'order=grade.asc,ord.asc',
    ];
    const dbSubject = mapSubjectCodeToSupabaseSubject(params.subject);
    if (dbSubject) {
      parts.push(`subject=eq.${encodeURIComponent(dbSubject)}`);
    }
    if (params.grade && params.grade !== 'all') {
      parts.push(`grade=eq.${encodeURIComponent(String(params.grade))}`);
    }
    if (params.parentId) {
      parts.push(`parent_id=eq.${encodeURIComponent(params.parentId)}`);
    }
    const q = escapeFilterValue(params.search || '');
    if (q) {
      const e = encodeURIComponent(q);
      parts.push(
        `or=(title.ilike.*${e}*,chapter.ilike.*${e}*,lesson.ilike.*${e}*,code.ilike.*${e}*)`,
      );
    }
    return parts;
  };

  if (params.parentId && !isSafeId(params.parentId)) {
    return { atoms: [], totalCount: 0 };
  }

  const baseParts = buildFilterParts();
  const limit = Math.min(Math.max(params.limit || 60, 1), 200);

  // Also fetch matching factory-ready atoms explicitly so they are always included at the top
  const factoryParts = [...buildFilterParts()];
  if (factoryAtomIds.length > 0) {
    factoryParts.push(`id=in.(${factoryAtomIds.join(',')})`);
  }

  const [mainRes, factoryRes] = await Promise.all([
    params.onlyFactoryReady && factoryAtomIds.length > 0
      ? sbFetch(`/atoms?${factoryParts.join('&')}&limit=200`, {
          headers: { Prefer: 'count=exact' },
        })
      : sbFetch(`/atoms?${baseParts.join('&')}&limit=${limit}`, {
          headers: { Prefer: 'count=exact' },
        }),
    !params.onlyFactoryReady && factoryAtomIds.length > 0
      ? sbFetch(`/atoms?${factoryParts.join('&')}&limit=100`)
      : Promise.resolve(null),
  ]);

  if (!mainRes.ok) {
    console.error(`[supabase] query atoms failed: HTTP ${mainRes.status}`);
    return { atoms: [], totalCount: 0 };
  }
  if (factoryRes && !factoryRes.ok) {
    console.error(
      `[supabase] query factory atoms failed: HTTP ${factoryRes.status}`,
    );
  }

  const range = mainRes.headers.get('content-range');
  const totalCount =
    range && range.includes('/') ? Number(range.split('/')[1]) || 0 : 0;
  const mainAtoms = (await mainRes.json()) as SupabaseAtom[];
  const priorityAtoms: SupabaseAtom[] =
    factoryRes && factoryRes.ok
      ? ((await factoryRes.json()) as SupabaseAtom[])
      : [];

  const mergedMap = new Map<string, SupabaseAtom>();
  for (const a of [...priorityAtoms, ...mainAtoms]) {
    if (!mergedMap.has(a.id)) {
      const pkgCount = pkgCountByAtomId.get(a.id) || 0;
      const candidatePkgIds = new Set<string>([
        ...(pkgIdsByAtomId.get(a.id) || []),
        `${a.code}-L1`,
        `${a.code}-L2`,
        `${a.code}-L3`,
        `${a.id}-L1`,
        `${a.id}-L2`,
        `${a.id}-L3`,
      ]);
      let assetCount = 0;
      for (const pid of candidatePkgIds) {
        assetCount += assetCountByPkgId.get(pid) || 0;
      }

      mergedMap.set(a.id, {
        ...sanitizeAtom(a),
        hasFactoryPackage: pkgCount > 0,
        factoryPackageCount: pkgCount,
        factoryAssetCount: assetCount,
        hasTainguyen: tnAtomIds.has(a.id),
      });
    }
  }

  const enrichedList = Array.from(mergedMap.values()).sort((a, b) => {
    const aScore =
      (a.hasFactoryPackage ? 500 : 0) +
      (a.factoryAssetCount || 0) * 30 +
      (a.factoryPackageCount || 0) * 20 +
      (a.hasTainguyen ? 10 : 0);
    const bScore =
      (b.hasFactoryPackage ? 500 : 0) +
      (b.factoryAssetCount || 0) * 30 +
      (b.factoryPackageCount || 0) * 20 +
      (b.hasTainguyen ? 10 : 0);
    if (bScore !== aScore) return bScore - aScore;
    if (a.grade !== b.grade) return a.grade - b.grade;
    return (a.ord || 0) - (b.ord || 0);
  });

  return {
    atoms: enrichedList.slice(0, limit),
    totalCount: totalCount || enrichedList.length,
  };
}

/* ---------- Chỉ mục bài học dùng cho danh sách đầy đủ và tìm kiếm chéo khối/môn ---------- */

export interface SlimAtom {
  id: string;
  code: string;
  title: string;
  /** Tên môn trong cơ sở dữ liệu (ví dụ "Toán"). */
  subject: string;
  /** Mã môn của ứng dụng (ví dụ "toan"). */
  subjectCode: string;
  grade: number;
  chapter: string;
  lesson: string;
  ord: number;
  hasFactoryPackage: boolean;
  factoryPackageCount: number;
  factoryAssetCount: number;
}

const DB_NAME_TO_SUBJECT_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(SUBJECT_CODE_TO_DB_NAME).map(([code, name]) => [name.toLowerCase(), code]),
);

function slugSubject(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Tên môn trong dữ liệu -> mã môn của ứng dụng. Môn lạ giữ mã dạng chữ không dấu, KHÔNG rơi về Toán. */
export function subjectCodeFromDbName(name: string): string {
  const n = (name || '').trim();
  const direct = DB_NAME_TO_SUBJECT_CODE[n.toLowerCase()];
  if (direct) return direct;
  const s = slugSubject(n);
  if (s.includes('kinh_te') || s.includes('cong_dan')) return 'gdcd_gdktpl';
  if (s === 'lich_su') return 'lich_su';
  return s || 'khac';
}

const ATOM_INDEX_TTL_MS = 5 * 60_000;
let atomIndexCache: { at: number; promise: Promise<SlimAtom[]> } | null = null;

export function invalidateAtomIndex(): void {
  atomIndexCache = null;
}

async function fetchAllAtomsSlim(): Promise<SlimAtom[]> {
  const [pkgRes, assetRes] = await Promise.all([
    sbFetch('/studio_kv?collection=eq.packages&select=id,atomId:j->>atomId&limit=2000'),
    sbFetch('/studio_kv?collection=eq.assets&select=id,packageId:j->>packageId&limit=3000'),
  ]);
  const pkgRows: { id: string; atomId?: string }[] = pkgRes.ok ? await pkgRes.json() : [];
  const assetRows: { id: string; packageId?: string }[] = assetRes.ok ? await assetRes.json() : [];
  const pkgCount = new Map<string, number>();
  const pkgIds = new Map<string, string[]>();
  for (const r of pkgRows) {
    if (!r.atomId) continue;
    pkgCount.set(r.atomId, (pkgCount.get(r.atomId) || 0) + 1);
    pkgIds.set(r.atomId, [...(pkgIds.get(r.atomId) || []), r.id]);
  }
  const assetByPkg = new Map<string, number>();
  for (const r of assetRows) {
    if (r.packageId) assetByPkg.set(r.packageId, (assetByPkg.get(r.packageId) || 0) + 1);
  }

  const PAGE = 1000;
  const out: SlimAtom[] = [];
  for (let offset = 0; offset < 40_000; offset += PAGE) {
    const res = await sbFetch(
      `/atoms?select=id,code,title,subject,grade,chapter,lesson,ord&order=grade.asc,code.asc&limit=${PAGE}&offset=${offset}`,
    );
    if (!res.ok) {
      console.error(`[supabase] list atoms failed: HTTP ${res.status}`);
      if (offset === 0) throw new Error('Không đọc được danh sách bài.');
      break;
    }
    const rows = (await res.json()) as Pick<
      SupabaseAtom,
      'id' | 'code' | 'title' | 'subject' | 'grade' | 'chapter' | 'lesson' | 'ord'
    >[];
    for (const a of rows) {
      const ids = [...(pkgIds.get(a.id) || []), `${a.code}-L1`, `${a.code}-L2`, `${a.code}-L3`, `${a.id}-L1`, `${a.id}-L2`, `${a.id}-L3`];
      let assets = 0;
      for (const pid of new Set(ids)) assets += assetByPkg.get(pid) || 0;
      const pc = pkgCount.get(a.id) || 0;
      out.push({
        id: a.id,
        code: a.code,
        title: cleanFactoryText(a.title),
        subject: a.subject,
        subjectCode: subjectCodeFromDbName(a.subject),
        grade: Number(a.grade),
        chapter: cleanFactoryText(a.chapter),
        lesson: cleanFactoryText(a.lesson),
        ord: a.ord || 0,
        hasFactoryPackage: pc > 0,
        factoryPackageCount: pc,
        factoryAssetCount: assets,
      });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Toàn bộ bài (không cắt ở 200), nhớ 5 phút. Lọc theo mã môn và khối ('all' hoặc bỏ trống = tất cả). */
export async function listAtomIndex(params: { subject?: string; grade?: string } = {}): Promise<SlimAtom[]> {
  if (!atomIndexCache || Date.now() - atomIndexCache.at > ATOM_INDEX_TTL_MS) {
    const promise = fetchAllAtomsSlim();
    atomIndexCache = { at: Date.now(), promise };
    promise.catch(() => {
      if (atomIndexCache?.promise === promise) atomIndexCache = null;
    });
  }
  const all = await atomIndexCache.promise;
  const sub = params.subject && params.subject !== 'all' ? params.subject : '';
  const gr = params.grade && params.grade !== 'all' ? Number(params.grade) : NaN;
  return all.filter((a) => (!sub || a.subjectCode === sub) && (Number.isNaN(gr) || a.grade === gr));
}

/** Số bài theo môn và khối: giúp giao diện biết môn nào chưa có dữ liệu. */
export function summarizeCoverage(atoms: SlimAtom[]): Record<string, Record<string, number>> {
  const cov: Record<string, Record<string, number>> = {};
  for (const a of atoms) {
    const bySub = (cov[a.subjectCode] ||= {});
    bySub[String(a.grade)] = (bySub[String(a.grade)] || 0) + 1;
  }
  return cov;
}

export async function fetchSupabaseAtomDetail(atomId: string): Promise<{
  atom: SupabaseAtom | null;
  packages: SupabaseFactoryPackage[];
  factoryAssets: SupabaseFactoryAsset[];
  edges: SupabaseEdge[];
  questions: SupabaseQuestion[];
  socratic: SupabaseSocratic[];
  tainguyen: SupabaseTainguyenMeta[];
}> {
  if (!isSafeId(atomId)) {
    return {
      atom: null,
      packages: [],
      factoryAssets: [],
      edges: [],
      questions: [],
      socratic: [],
      tainguyen: [],
    };
  }
  const atomRes = await sbFetch(
    `/atoms?or=(id.eq.${encodeURIComponent(atomId)},code.eq.${encodeURIComponent(atomId)})&limit=1`,
  );
  if (!atomRes.ok) {
    console.error(`[supabase] fetch atom detail failed: HTTP ${atomRes.status}`);
  }
  const atomsList = atomRes.ok ? ((await atomRes.json()) as SupabaseAtom[]) : [];
  const rawAtom = atomsList[0] || null;
  const atom = rawAtom ? sanitizeAtom(rawAtom) : null;
  // id/code lấy từ DB cũng phải qua kiểm tra trước khi nhúng vào bộ lọc
  const targetId = atom && isSafeId(atom.id) ? atom.id : atomId;
  const targetCode = atom && isSafeId(atom.code) ? atom.code : targetId;

  const [edgesRes, questionsRes, socraticRes, tnRes, pkgRes] =
    await Promise.all([
      sbFetch(
        `/edges?or=(from_id.eq.${encodeURIComponent(targetId)},to_id.eq.${encodeURIComponent(targetId)})&limit=25`,
      ),
      sbFetch(`/questions?atom_id=eq.${encodeURIComponent(targetId)}&limit=25`),
      sbFetch(`/socratic?atom_id=eq.${encodeURIComponent(targetId)}&limit=15`),
      sbFetch(
        `/studio_kv?collection=eq.tainguyen&j->>atomId=eq.${encodeURIComponent(targetId)}&select=id,ord,name:j->>name,atomId:j->>atomId,format:j->>format,dok:j->>dok,uploadedAt:j->>uploadedAt,uploadedBy:j->>uploadedBy`,
      ),
      sbFetch(
        `/studio_kv?collection=eq.packages&or=(j->>atomId.eq.${encodeURIComponent(targetId)},id.ilike.${encodeURIComponent(targetCode)}*,id.ilike.${encodeURIComponent(targetId)}*)&select=id,j`,
      ),
    ]);

  const rawEdges: SupabaseEdge[] = edgesRes.ok
    ? ((await edgesRes.json()) as SupabaseEdge[])
    : [];
  const rawQuestions: SupabaseQuestion[] = questionsRes.ok
    ? ((await questionsRes.json()) as SupabaseQuestion[])
    : [];
  const questions: SupabaseQuestion[] = rawQuestions.map((q) => ({
    ...q,
    noi_dung: cleanFactoryText(q.noi_dung),
    dap_an: cleanFactoryText(q.dap_an),
    loi_giai: cleanFactoryText(q.loi_giai),
  }));

  const rawSocratic: SupabaseSocratic[] = socraticRes.ok
    ? ((await socraticRes.json()) as SupabaseSocratic[])
    : [];
  const socratic: SupabaseSocratic[] = rawSocratic.map((s) => ({
    ...s,
    question_summary: cleanFactoryText(s.question_summary),
    wrong_answer: cleanFactoryText(s.wrong_answer),
    misconception: cleanFactoryText(s.misconception),
    bac_1: cleanFactoryText(s.bac_1),
    bac_2: cleanFactoryText(s.bac_2),
    bac_3: cleanFactoryText(s.bac_3),
    bac_4: cleanFactoryText(s.bac_4),
    dap_an: cleanFactoryText(s.dap_an),
  }));

  const tainguyen: SupabaseTainguyenMeta[] = tnRes.ok
    ? ((await tnRes.json()) as SupabaseTainguyenMeta[])
    : [];

  const rawPkgRows: {
    id: string;
    j: {
      id?: string;
      atomId?: string;
      level?: number;
      bloom?: string;
      status?: string;
      updatedAt?: string;
      updatedBy?: string;
      fields?: Record<string, string>;
    };
  }[] = pkgRes.ok ? await pkgRes.json() : [];

  const packages: SupabaseFactoryPackage[] = rawPkgRows
    .map((row) => {
      const f = row.j?.fields || {};
      const inferredLevel =
        row.j?.level ||
        (row.id.endsWith('-L3') ? 3 : row.id.endsWith('-L2') ? 2 : 1);
      return {
        id: row.id,
        atomId: row.j?.atomId || targetId,
        level: inferredLevel,
        bloom:
          row.j?.bloom ||
          (inferredLevel === 3
            ? 'Vận dụng / Vận dụng cao'
            : inferredLevel === 2
              ? 'Thông hiểu'
              : 'Nhận biết / Nhớ'),
        status: row.j?.status || 'draft_ai',
        updatedAt: row.j?.updatedAt,
        updatedBy: row.j?.updatedBy || 'Factory Việt Anh (Rễ)',
        fields: {
          objective: cleanFactoryText(f.objective),
          explanation: cleanFactoryText(f.explanation),
          example: cleanFactoryText(f.example),
          counterExample: cleanFactoryText(f.counterExample),
          commonMistake: cleanFactoryText(f.commonMistake),
          strategy: cleanFactoryText(f.strategy),
          questions: cleanFactoryText(f.questions),
        },
      };
    })
    .sort((a, b) => a.level - b.level);

  // Fetch Factory Assets (8 formats: text, worksheet, slide, quiz, mindmap, flashcard, podcast, video)
  // matching either targetCode*, targetId*, or any of the package IDs
  const [resTableResp, assetsKvResp] = await Promise.all([
    sbFetch(
      `/resources?or=(package_id.ilike.${encodeURIComponent(targetCode)}*,package_id.ilike.${encodeURIComponent(targetId)}*)&select=id,package_id,format,status,content,created_at,created_by,model`,
    ),
    sbFetch(
      `/studio_kv?collection=eq.assets&or=(j->>packageId.ilike.${encodeURIComponent(targetCode)}*,j->>packageId.ilike.${encodeURIComponent(targetId)}*)&select=id,j`,
    ),
  ]);

  const rawResTable: RawSupabaseResourceRow[] = resTableResp.ok
    ? await resTableResp.json()
    : [];
  const rawAssetsKv: {
    id: string;
    j: {
      id?: string;
      packageId?: string;
      format?: string;
      status?: string;
      createdBy?: string;
      createdAt?: string;
      model?: string;
      content?: Record<string, unknown>;
    };
  }[] = assetsKvResp.ok ? await assetsKvResp.json() : [];

  const assetMap = new Map<string, SupabaseFactoryAsset>();

  for (const r of rawResTable) {
    const fmtMeta = FORMAT_LABELS[r.format] || {
      label: `Học liệu (${r.format})`,
      category: 'ke_hoach_bai_day' as ToolCategoryCode,
      toolId: 'khbd-5512',
    };
    const sections = convertContentToSections(r.format, r.content || {}).map(
      (s) => ({
        heading: cleanFactoryText(s.heading),
        body: cleanFactoryText(s.body),
      }),
    );
    assetMap.set(r.id, {
      id: r.id,
      packageId: r.package_id,
      format: r.format,
      formatLabel: fmtMeta.label,
      status: r.status || 'ready',
      createdBy: r.created_by || 'Factory Việt Anh (Rễ)',
      createdAt: r.created_at,
      model: r.model,
      content: r.content || {},
      sections,
    });
  }

  for (const row of rawAssetsKv) {
    const j = row.j || {};
    const id = j.id || row.id;
    if (assetMap.has(id)) continue;
    const fmt = j.format || 'text';
    const fmtMeta = FORMAT_LABELS[fmt] || {
      label: `Học liệu (${fmt})`,
      category: 'ke_hoach_bai_day' as ToolCategoryCode,
      toolId: 'khbd-5512',
    };
    const sections = convertContentToSections(fmt, j.content || {}).map(
      (s) => ({
        heading: cleanFactoryText(s.heading),
        body: cleanFactoryText(s.body),
      }),
    );
    assetMap.set(id, {
      id,
      packageId: j.packageId || `${targetCode}-L1`,
      format: fmt,
      formatLabel: fmtMeta.label,
      status: j.status || 'ready',
      createdBy: j.createdBy || 'Factory Việt Anh (Rễ)',
      createdAt: j.createdAt,
      model: j.model,
      content: j.content || {},
      sections,
    });
  }

  const factoryAssets = Array.from(assetMap.values());

  // Nếu bảng public.questions chưa có câu hỏi cho bài này nhưng trong Factory Asset đã có gói Quiz,
  // tự động nạp câu hỏi từ Factory Quiz Asset sang danh sách questions để giáo viên dùng luôn!
  if (questions.length === 0) {
    const quizAsset = factoryAssets.find((a) => a.format === 'quiz');
    const rawQuizItems = Array.isArray(quizAsset?.content?.questions)
      ? (quizAsset!.content.questions as {
          q?: string;
          options?: string[];
          answer?: number;
          explanation?: string;
          dok?: number;
        }[])
      : [];

    rawQuizItems.forEach((qi, idx) => {
      const opts = Array.isArray(qi.options) ? qi.options : [];
      const ansIdx = typeof qi.answer === 'number' ? qi.answer : 0;
      const correctText = opts[ansIdx]
        ? `${String.fromCharCode(65 + ansIdx)}. ${cleanFactoryText(opts[ansIdx])}`
        : String.fromCharCode(65 + ansIdx);

      const distractors = opts
        .map((opt, oi) =>
          oi !== ansIdx
            ? {
                noiDung: `${String.fromCharCode(65 + oi)}. ${cleanFactoryText(opt)}`,
                lyDo: 'Phương án nhiễu kiểm tra lỗi sai thường gặp của học sinh.',
              }
            : null,
        )
        .filter((d): d is { noiDung: string; lyDo: string } => d !== null);

      questions.push({
        id: `${quizAsset?.id || 'FQ'}-Q${idx + 1}`,
        atom_id: targetId,
        noi_dung: cleanFactoryText(
          `${qi.q || ''}${opts.length > 0 ? '\n' + opts.map((o, oi) => `${String.fromCharCode(65 + oi)}. ${o}`).join('   |   ') : ''}`,
        ),
        key: correctText,
        tier: 'core',
        dok: qi.dok || 1,
        do_kho: qi.dok === 3 ? 'Vận dụng' : qi.dok === 2 ? 'Thông hiểu' : 'Nhận biết',
        dap_an: correctText,
        loi_giai: cleanFactoryText(
          qi.explanation || packages[0]?.fields.explanation || '',
        ),
        tham_so_hoa: '',
        nhieu: distractors,
      });
    });
  }

  // Nếu bảng public.socratic chưa có nhưng Gói Factory (packages) đã có commonMistake & strategy,
  // tự động chuyển thành kịch bản Socratic 4 bậc cho giáo viên dùng trên lớp
  if (socratic.length === 0 && packages[0]) {
    const p = packages[0];
    socratic.push({
      id: `SOC-${p.id}`,
      atom_id: targetId,
      vi_tri: atom?.lesson || '',
      chuong: atom?.chapter || '',
      q_index: 1,
      question_summary: p.fields.objective || atom?.title || '',
      wrong_answer:
        p.fields.commonMistake ||
        atom?.quan_niem_sai ||
        'Áp dụng công thức máy móc khi chưa đủ điều kiện',
      misconception:
        p.fields.commonMistake ||
        atom?.quan_niem_sai ||
        'Chưa phân biệt được trường hợp chuẩn và phản ví dụ',
      bac_1: 'Em nhận thấy điều gì trong dữ kiện đề bài vừa cho?',
      bac_2: `Điều đó có luôn đúng không? Hãy đối chiếu với phản ví dụ: ${p.fields.counterExample || 'trường hợp ngoại lệ'}.`,
      bac_3: `Vì sao lại xảy ra sự khác biệt đó? Hãy kiểm tra lại định nghĩa: ${p.fields.explanation || atom?.yeu_cau || ''}.`,
      bac_4: `Chốt quy tắc đúng và áp dụng vào ví dụ chuẩn: ${p.fields.example || ''}.`,
      dap_an: p.fields.explanation || atom?.yeu_cau || '',
      luat_no_luc: p.fields.strategy || null,
    });
  }

  const enrichedEdges = atom
    ? await enrichEdgesWithAtoms(rawEdges, atom.id)
    : rawEdges;

  return {
    atom: atom
      ? {
          ...atom,
          hasFactoryPackage: packages.length > 0,
          factoryPackageCount: packages.length,
          factoryAssetCount: factoryAssets.length,
          hasTainguyen: tainguyen.length > 0,
        }
      : null,
    packages,
    factoryAssets,
    edges: enrichedEdges,
    questions,
    socratic,
    tainguyen,
  };
}

async function enrichEdgesWithAtoms(
  edges: SupabaseEdge[],
  centerAtomId: string,
): Promise<SupabaseEdge[]> {
  if (edges.length === 0) return [];
  const neighborIds = Array.from(
    new Set(
      edges.map((e) => (e.from_id === centerAtomId ? e.to_id : e.from_id)),
    ),
  )
    .filter(isSafeId)
    .slice(0, 100);
  if (neighborIds.length === 0) return edges;

  const inFilter = neighborIds.map((id) => `"${id}"`).join(',');
  const res = await sbFetch(
    `/atoms?id=in.(${encodeURIComponent(inFilter)})&select=id,code,title,subject,grade,chapter,lesson,bloom,dok,yeu_cau,quan_niem_sai`,
  );
  const neighbors: SupabaseAtom[] = res.ok
    ? ((await res.json()) as SupabaseAtom[]).map(sanitizeAtom)
    : [];
  const map = new Map(neighbors.map((n) => [n.id, n]));

  return edges.map((e) => {
    const otherId = e.from_id === centerAtomId ? e.to_id : e.from_id;
    return {
      ...e,
      quan_niem_sai: e.quan_niem_sai ? cleanFactoryText(e.quan_niem_sai) : null,
      remediation_hint: e.remediation_hint ? cleanFactoryText(e.remediation_hint) : null,
      direction: e.from_id === centerAtomId ? 'outgoing' : 'incoming',
      linkedAtom: map.get(otherId),
    };
  });
}

export async function fetchSupabaseTreeScaffold(params?: {
  subject?: string;
  grade?: string | number;
  kind?: string;
  parentId?: string;
}): Promise<SupabaseTreeNode[]> {
  const parts: string[] = [
    'select=id,kind,parent_id,title,code,ord,subject,grade',
    'order=ord.asc',
  ];
  if (params?.kind) {
    if (!isSafeId(params.kind)) return [];
    parts.push(`kind=eq.${encodeURIComponent(params.kind)}`);
  }
  if (params?.parentId && !isSafeId(params.parentId)) return [];
  if (params?.subject && params.subject !== 'all') {
    const dbSub = mapSubjectCodeToSupabaseSubject(params.subject) || params.subject;
    parts.push(`subject=eq.${encodeURIComponent(dbSub)}`);
  }
  if (params?.grade && params.grade !== 'all') {
    parts.push(`grade=eq.${encodeURIComponent(String(params.grade))}`);
  }
  if (params?.parentId) {
    parts.push(`parent_id=eq.${encodeURIComponent(params.parentId)}`);
  }
  parts.push('limit=300');

  const res = await sbFetch(`/tree_scaffold?${parts.join('&')}`);
  if (!res.ok) return [];
  const nodes = (await res.json()) as SupabaseTreeNode[];
  return nodes.map((n) => ({
    ...n,
    title: cleanFactoryText(n.title),
  }));
}

export async function fetchSupabaseTainguyenList(params?: {
  format?: string;
  atomId?: string;
  search?: string;
  limit?: number;
}): Promise<{ items: SupabaseTainguyenMeta[]; totalCount: number }> {
  const parts: string[] = [
    'collection=eq.tainguyen',
    'select=id,ord,name:j->>name,atomId:j->>atomId,format:j->>format,dok:j->>dok,uploadedAt:j->>uploadedAt,uploadedBy:j->>uploadedBy',
    'order=ord.desc',
  ];

  if (params?.format && params.format !== 'all') {
    if (!isSafeId(params.format)) return { items: [], totalCount: 0 };
    parts.push(`j->>format=ilike.${encodeURIComponent(params.format)}`);
  }
  if (params?.atomId) {
    if (!isSafeId(params.atomId)) return { items: [], totalCount: 0 };
    parts.push(`j->>atomId=eq.${encodeURIComponent(params.atomId)}`);
  }
  const q = escapeFilterValue(params?.search || '');
  if (q) {
    const e = encodeURIComponent(q);
    parts.push(`or=(j->>name.ilike.*${e}*,j->>atomId.ilike.*${e}*)`);
  }
  parts.push(`limit=${Math.min(params?.limit || 120, 300)}`);

  const res = await sbFetch(`/studio_kv?${parts.join('&')}`, {
    headers: { Prefer: 'count=exact' },
  });
  if (!res.ok) return { items: [], totalCount: 0 };

  const range = res.headers.get('content-range');
  const totalCount =
    range && range.includes('/') ? Number(range.split('/')[1]) || 0 : 0;
  const items = (await res.json()) as SupabaseTainguyenMeta[];
  return { items, totalCount: totalCount || items.length };
}

export async function fetchSupabaseTainguyenById(
  id: string,
): Promise<SupabaseTainguyenFull | null> {
  if (!isSafeId(id)) return null;
  const res = await sbFetch(
    `/studio_kv?collection=eq.tainguyen&id=eq.${encodeURIComponent(id)}&select=id,ord,j&limit=1`,
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as {
    id: string;
    ord: number;
    j: SupabaseTainguyenFull;
  }[];
  if (!rows[0]?.j) return null;
  return {
    ...rows[0].j,
    id: rows[0].id,
    ord: rows[0].ord,
  };
}

export async function fetchSupabaseActivityAndReviews(limit = 100): Promise<{
  activities: SupabaseActivityItem[];
  reviews: SupabaseReviewItem[];
}> {
  const [actRes, revRes] = await Promise.all([
    sbFetch(
      `/studio_kv?collection=eq.activity&order=ord.desc&limit=${Math.min(Math.max(Math.floor(Number(limit)) || 100, 1), 500)}&select=id,j`,
    ),
    sbFetch(`/studio_kv?collection=eq.reviews&order=ord.desc&limit=20&select=id,j`),
  ]);

  const activities: SupabaseActivityItem[] = actRes.ok
    ? ((await actRes.json()) as { id: string; j: SupabaseActivityItem }[]).map(
        (r) => ({ ...r.j, id: r.id }),
      )
    : [];

  const reviews: SupabaseReviewItem[] = revRes.ok
    ? ((await revRes.json()) as { id: string; j: SupabaseReviewItem }[]).map(
        (r) => ({ ...r.j, id: r.id }),
      )
    : [];

  return { activities, reviews };
}

interface RawSupabaseResourceRow {
  id: string;
  package_id: string;
  format: string;
  status: string;
  content: Record<string, unknown>;
  created_at: string;
  created_by: string;
  model: string;
  folder: string | null;
}

interface RawPackageKvRow {
  id: string;
  j: {
    id: string;
    bloom?: string;
    level?: number;
    atomId?: string;
    fields?: {
      objective?: string;
      explanation?: string;
      example?: string;
      questions?: string;
      commonMistake?: string;
      counterExample?: string;
      strategy?: string;
    };
    updatedAt?: string;
    updatedBy?: string;
  };
}

const FORMAT_LABELS: Record<
  string,
  { label: string; category: ToolCategoryCode; toolId: string }
> = {
  worksheet: {
    label: 'Phiếu học tập (Worksheet)',
    category: 'phieu_hoc_tap_hoat_dong',
    toolId: 'pht-tram-hoc-tap',
  },
  slide: {
    label: 'Dàn ý Bài trình chiếu (Slide)',
    category: 'ke_hoach_bai_day',
    toolId: 'khbd-5512',
  },
  text: {
    label: 'Tài liệu Đọc hiểu & Lý thuyết',
    category: 'chuyen_doi_hoc_lieu',
    toolId: 'cdhl-phan-bac-van-ban',
  },
  flashcard: {
    label: 'Bộ Thẻ ghi nhớ (Flashcards)',
    category: 'phieu_hoc_tap_hoat_dong',
    toolId: 'pht-tro-choi-khoi-dong',
  },
  mindmap: {
    label: 'Sơ đồ Tư duy (Mindmap)',
    category: 'chuyen_doi_hoc_lieu',
    toolId: 'cdhl-so-do-tu-duy',
  },
  quiz: {
    label: 'Đề Trắc nghiệm & Giải thích (Quiz)',
    category: 'kiem_tra_danh_gia',
    toolId: 'ktdg-trac-nghiem-4-lua-chon',
  },
  podcast: {
    label: 'Kịch bản Âm thanh Đối thoại (Podcast)',
    category: 'chuyen_doi_hoc_lieu',
    toolId: 'cdhl-kich-ban-podcast',
  },
  video: {
    label: 'Kịch bản Phim Tình huống Sư phạm (Video)',
    category: 'phieu_hoc_tap_hoat_dong',
    toolId: 'pht-tinh-huong-thuc-te',
  },
};

function parseGradeSubjectFromPkgId(pkgId: string): {
  grade: GradeLevel;
  subject: SubjectCode;
} {
  const upper = (pkgId || '').toUpperCase();
  let subject: SubjectCode = 'toan';
  if (upper.startsWith('NV')) subject = 'ngu_van';
  else if (upper.startsWith('TA') || upper.startsWith('OX'))
    subject = 'tieng_anh';
  else if (upper.startsWith('KH')) subject = 'khtn';
  else if (upper.startsWith('VL')) subject = 'vat_ly';
  else if (upper.startsWith('HH')) subject = 'hoa_hoc';
  else if (upper.startsWith('SH')) subject = 'sinh_hoc';
  else if (upper.startsWith('DL')) subject = 'dia_ly';
  else if (upper.startsWith('LS')) subject = 'lich_su_dia_ly';
  else if (upper.startsWith('GD')) subject = 'gdcd_gdktpl';
  else if (upper.startsWith('TH')) subject = 'tin_hoc';

  const gradeMatch = upper.match(
    /^(?:TO|NV|TA|KH|VL|HH|SH|DL|LS|GD|TH)(\d{1,2})/,
  );
  const gradeNum = gradeMatch ? gradeMatch[1] : '7';
  const validGrade = (
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].includes(
      gradeNum,
    )
      ? gradeNum
      : '7'
  ) as GradeLevel;

  return { grade: validGrade, subject };
}

function convertContentToSections(
  format: string,
  content: Record<string, unknown>,
): { heading: string; body: string }[] {
  if (!content) return [];

  if (Array.isArray(content.sections)) {
    return (content.sections as { heading?: string; body?: string }[]).map(
      (s, idx) => ({
        heading: s.heading || `Phần ${idx + 1}`,
        body: String(s.body || ''),
      }),
    );
  }

  if (Array.isArray(content.slides)) {
    return (
      content.slides as { title?: string; bullets?: string[]; notes?: string }[]
    ).map((sl, idx) => ({
      heading: `Slide ${idx + 1}: ${sl.title || ''}`,
      body: [
        ...(Array.isArray(sl.bullets) ? sl.bullets.map((b) => `• ${b}`) : []),
        sl.notes ? `\nGhi chú giảng dạy: ${sl.notes}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    }));
  }

  if (Array.isArray(content.cards)) {
    return [
      {
        heading: `Bộ thẻ ghi nhớ (${content.cards.length} thẻ)`,
        body: (content.cards as { front?: string; back?: string }[])
          .map(
            (c, i) =>
              `Thẻ ${i + 1}:\n- Mặt trước (Câu hỏi): ${c.front || ''}\n- Mặt sau (Đáp án): ${c.back || ''}`,
          )
          .join('\n\n'),
      },
    ];
  }

  if (typeof content.markdown === 'string') {
    return [
      {
        heading: 'Cấu trúc Sơ đồ Tư duy (Mindmap)',
        body: content.markdown,
      },
    ];
  }

  if (Array.isArray(content.questions)) {
    return (
      content.questions as {
        q?: string;
        options?: string[];
        answer?: number;
        explanation?: string;
        dok?: number;
      }[]
    ).map((q, idx) => {
      const opts = Array.isArray(q.options)
        ? q.options
            .map((o, oi) => `   ${String.fromCharCode(65 + oi)}. ${o}`)
            .join('\n')
        : '';
      const ansChar =
        typeof q.answer === 'number' ? String.fromCharCode(65 + q.answer) : '';
      return {
        heading: `Câu ${idx + 1} (Mức DOK ${q.dok || 1})`,
        body: `${q.q || ''}\n${opts}\n\nĐáp án đúng: ${ansChar}\nGiải thích: ${q.explanation || ''}`,
      };
    });
  }

  if (Array.isArray(content.script)) {
    return [
      {
        heading: 'Kịch bản Đối thoại Âm thanh (Podcast)',
        body: (content.script as { speaker?: string; text?: string }[])
          .map((line) => `${line.speaker || 'GV'}: "${line.text || ''}"`)
          .join('\n\n'),
      },
    ];
  }

  if (Array.isArray(content.scenes)) {
    return (
      content.scenes as {
        beat?: string;
        setting?: string;
        visual?: string;
        mucTieu?: string;
        dialogue?: { speaker?: string; line?: string }[];
      }[]
    ).map((sc, idx) => ({
      heading: `Cảnh ${idx + 1}: ${sc.beat || 'Tình huống'}`,
      body: [
        sc.mucTieu ? `Mục tiêu sư phạm: ${sc.mucTieu}` : '',
        sc.setting ? `Bối cảnh: ${sc.setting}` : '',
        sc.visual ? `Hình ảnh minh họa: ${sc.visual}` : '',
        Array.isArray(sc.dialogue)
          ? `\nLời thoại:\n` +
            sc.dialogue.map((d) => `- ${d.speaker}: "${d.line}"`).join('\n')
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    }));
  }

  return [
    {
      heading: `Nội dung (${format})`,
      body: JSON.stringify(content, null, 2),
    },
  ];
}

export async function fetchSupabaseLibraryResources(): Promise<
  GeneratedResource[]
> {
  try {
    const [resRowsResp, pkgRowsResp] = await Promise.all([
      sbFetch(
        '/resources?order=created_at.desc&limit=100&select=id,package_id,format,status,content,created_at,created_by,model,folder',
      ),
      sbFetch('/studio_kv?collection=eq.packages&limit=50&select=id,j'),
    ]);

    const rawResources: RawSupabaseResourceRow[] = resRowsResp.ok
      ? ((await resRowsResp.json()) as RawSupabaseResourceRow[])
      : [];
    const rawPackages: RawPackageKvRow[] = pkgRowsResp.ok
      ? ((await pkgRowsResp.json()) as RawPackageKvRow[])
      : [];

    const convertedPackages: GeneratedResource[] = rawPackages.map((row) => {
      const pkg = row.j;
      const f = pkg.fields || {};
      const { grade, subject } = parseGradeSubjectFromPkgId(row.id);
      const sections = [
        f.objective
          ? { heading: '1. Mục tiêu cần đạt (GDPT 2018)', body: cleanFactoryText(f.objective) }
          : null,
        f.explanation
          ? {
              heading: '2. Kiến thức trọng tâm & Ghi nhớ',
              body: cleanFactoryText(f.explanation),
            }
          : null,
        f.strategy
          ? { heading: '3. Chiến lược dẫn dắt Socratic', body: cleanFactoryText(f.strategy) }
          : null,
        f.example
          ? { heading: '4. Ví dụ minh họa thực tế', body: cleanFactoryText(f.example) }
          : null,
        f.commonMistake
          ? {
              heading: '5. Quan niệm sai phổ biến & Cách khắc phục',
              body: cleanFactoryText(f.commonMistake),
            }
          : null,
        f.counterExample
          ? { heading: '6. Tình huống phản ví dụ', body: cleanFactoryText(f.counterExample) }
          : null,
        f.questions
          ? { heading: '7. Câu hỏi luyện tập', body: cleanFactoryText(f.questions) }
          : null,
      ].filter((s): s is { heading: string; body: string } => s !== null);

      const markdownContent = sections
        .map((s) => `## ${s.heading}\n\n${s.body}`)
        .join('\n\n');

      return {
        id: `PKG-${row.id}`,
        createdAt: pkg.updatedAt || '2026-07-27T02:15:33.755Z',
        toolId: 'khbd-5512',
        toolName: `Gói Học liệu (${pkg.bloom || 'GDPT 2018'})`,
        category: 'ke_hoach_bai_day',
        teacher: {
          name: pkg.updatedBy || 'Tổ Chuyên môn',
          email: 'chuyenmon@truongvietanh.com',
        },
        grade,
        subject,
        knowledgeNodeId: pkg.atomId,
        linkedNodeIds: [],
        title: `[${row.id}] Gói Học liệu (${pkg.bloom || 'Mức ' + (pkg.level || 1)})`,
        markdownContent,
        structuredSections: sections,
        moetComplianceChecklist: [
          {
            criterion: 'Chuẩn đầu ra GDPT 2018',
            passed: true,
            note: 'Mã Atom ' + (pkg.atomId || row.id),
          },
        ],
        generationMode: 'llm_live',
        modelUsed: 'Supabase studio_kv (packages)',
        estimatedMinutesSaved: 45,
      };
    });

    const inferMetaFromTitle = (
      title: string,
      fallback: { label: string; category: ToolCategoryCode; toolId: string },
      format: string,
      pkgId: string,
    ): { label: string; category: ToolCategoryCode; toolId: string; displayTitle: string } => {
      const lower = title.toLowerCase();
      let displayTitle = cleanFactoryText(title);
      if (format === 'video' && /^cảnh\s+\d+/i.test(displayTitle)) {
        displayTitle = `Kịch bản Video Tình huống (${pkgId}) — ${displayTitle}`;
      }
      if (
        lower.includes('kế hoạch bài dạy') ||
        lower.includes('giáo án') ||
        lower.includes('mô hình 5e') ||
        lower.includes('công văn 5512')
      ) {
        return {
          label: 'Kế hoạch bài dạy (5512 / 5E)',
          category: 'ke_hoach_bai_day',
          toolId: 'khbd-5512',
          displayTitle,
        };
      }
      if (
        lower.includes('nhận xét học bạ') ||
        lower.includes('sổ liên lạc') ||
        lower.includes('phụ huynh') ||
        lower.includes('thư gửi') ||
        lower.includes('nội quy') ||
        lower.includes('kế hoạch chủ nhiệm')
      ) {
        return {
          label: 'Giao tiếp PH & Quản lý lớp',
          category: 'giao_tiep_quan_ly_lop',
          toolId: 'qllh-nhan-xet-hoc-ba',
          displayTitle,
        };
      }
      if (lower.includes('phân hóa') || lower.includes('hồ sơ lớp')) {
        return {
          label: 'Phân hóa & Hỗ trợ học sinh',
          category: 'phan_hoa_ho_tro',
          toolId: 'phht-bai-tap-3-muc',
          displayTitle,
        };
      }
      if (
        lower.includes('đề kiểm tra') ||
        lower.includes('trắc nghiệm') ||
        lower.includes('ma trận') ||
        lower.includes('rubric') ||
        lower.includes('kiểm tra 15') ||
        lower.includes('đánh giá')
      ) {
        return {
          label: 'Kiểm tra & Đánh giá',
          category: 'kiem_tra_danh_gia',
          toolId: 'ktdg-trac-nghiem-4-lua-chon',
          displayTitle,
        };
      }
      if (
        format === 'video' ||
        format === 'podcast' ||
        format === 'mindmap' ||
        lower.includes('sơ đồ tư duy') ||
        lower.includes('podcast') ||
        lower.includes('kịch bản video')
      ) {
        return {
          label: fallback.label,
          category: 'chuyen_doi_hoc_lieu',
          toolId: fallback.toolId,
          displayTitle,
        };
      }
      return { ...fallback, displayTitle };
    };

    const convertedResources: GeneratedResource[] = rawResources.map((r) => {
      const baseMeta = FORMAT_LABELS[r.format] || {
        label: `Học liệu (${r.format})`,
        category: 'ke_hoach_bai_day' as ToolCategoryCode,
        toolId: 'khbd-5512',
      };
      const { grade, subject } = parseGradeSubjectFromPkgId(r.package_id);
      const sections = convertContentToSections(r.format, r.content || {});
      const firstLineTitle =
        typeof r.content?.title === 'string'
          ? r.content.title
          : sections[0]?.heading && !sections[0].heading.startsWith('Phần ')
            ? sections[0].heading
            : `${baseMeta.label} — Mã gói ${r.package_id}`;

      const savedCategory =
        typeof r.content?.category === 'string'
          ? (r.content.category as ToolCategoryCode)
          : undefined;
      const savedToolId =
        typeof r.content?.toolId === 'string' ? r.content.toolId : undefined;
      const savedToolName =
        typeof r.content?.toolName === 'string' ? r.content.toolName : undefined;

      const inferred = inferMetaFromTitle(
        firstLineTitle,
        baseMeta,
        r.format,
        r.package_id,
      );

      const markdownContent = sections
        .map((s) => `## ${s.heading}\n\n${s.body}`)
        .join('\n\n');

      return {
        id: r.id,
        createdAt: r.created_at,
        toolId: savedToolId || inferred.toolId,
        toolName: savedToolName || inferred.label,
        category: savedCategory || inferred.category,
        teacher: {
          name: r.created_by || 'Anh Hùng (Quản trị học thuật)',
          email: 'hung.nguyen@truongvietanh.com',
        },
        grade,
        subject,
        className: r.folder || undefined,
        knowledgeNodeId: r.package_id,
        linkedNodeIds: [],
        title: `[${r.id}] ${inferred.displayTitle}`,
        markdownContent,
        structuredSections: sections,
        moetComplianceChecklist: [
          {
            criterion: 'Dữ liệu thực Supabase (`resources`)',
            passed: true,
            note: `Package: ${r.package_id}`,
          },
        ],
        generationMode: 'llm_live',
        modelUsed: r.model || 'claude-sonnet-5',
        estimatedMinutesSaved: 35,
      };
    });

    return [...convertedResources, ...convertedPackages];
  } catch {
    return [];
  }
}

export async function saveResourceToSupabase(
  resource: GeneratedResource,
): Promise<boolean> {
  try {
    // Chỉ chấp nhận id dạng R-<số>; còn lại luôn sinh id mới phía server.
    // Dùng ignore-duplicates để không ghi đè bản ghi đã tồn tại của người khác.
    const rand = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    const resId = /^R-\d{1,20}$/.test(String(resource.id))
      ? resource.id
      : `R-${Date.now()}${rand}`;
    const nodeId = isSafeId(resource.knowledgeNodeId)
      ? resource.knowledgeNodeId
      : '';
    const formatByCategory: Partial<Record<ToolCategoryCode, string>> = {
      ke_hoach_bai_day: 'text',
      phieu_hoc_tap_hoat_dong: 'worksheet',
      kiem_tra_danh_gia: 'quiz',
      chuyen_doi_hoc_lieu: 'mindmap',
      giao_tiep_quan_ly_lop: 'text',
      phan_hoa_ho_tro: 'worksheet',
      tich_hop_lien_mon: 'text',
      tro_ly_su_pham: 'text',
    };
    const dbFormat = formatByCategory[resource.category] || 'worksheet';
    const payload = {
      id: resId,
      package_id: nodeId || `${resource.subject.toUpperCase()}-G${resource.grade}`,
      format: dbFormat,
      status: 'ready',
      content: {
        title: resource.title,
        category: resource.category,
        toolId: resource.toolId,
        toolName: resource.toolName,
        sections: resource.structuredSections,
      },
      created_at: resource.createdAt,
      created_by: resource.teacher.name,
      model: resource.modelUsed || 'vietanh-studio',
      tokens: 0,
      cost_usd: 0,
      pkg_version: 1,
      archived: false,
      folder: resource.className || `Khối ${resource.grade}`,
    };

    const actId = `act${Date.now().toString(16)}${rand}`;
    const actPayload = {
      collection: 'activity',
      id: actId,
      ord: Math.floor(Date.now() / 1000),
      j: {
        id: actId,
        at: new Date().toISOString(),
        by: resource.teacher.name,
        href: `/atom/${nodeId}`,
        action: 'biên soạn',
        target: resource.title,
      },
    };

    const [res1, res2] = await Promise.all([
      sbFetch('/resources', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(payload),
      }),
      sbFetch('/studio_kv', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(actPayload),
      }),
    ]);

    let ok = true;
    if (!res1.ok) {
      ok = false;
      const body = (await res1.text().catch(() => '')).slice(0, 500);
      console.error(`[supabase] save resource failed: HTTP ${res1.status} ${body}`);
    } else {
      const inserted = (await res1.json().catch(() => null)) as unknown;
      if (Array.isArray(inserted) && inserted.length === 0) {
        ok = false;
        console.error('[supabase] save resource skipped: id đã tồn tại');
      }
    }
    if (!res2.ok) {
      ok = false;
      const body = (await res2.text().catch(() => '')).slice(0, 500);
      console.error(`[supabase] save activity failed: HTTP ${res2.status} ${body}`);
    }
    return ok;
  } catch (e) {
    console.error(
      '[supabase] save resource error:',
      e instanceof Error ? e.message : 'unknown',
    );
    return false;
  }
}
