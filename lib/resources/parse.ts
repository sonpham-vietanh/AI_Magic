// Bóc JSON từ đầu ra LLM, chuẩn hoá nhẹ, kiểm bằng zod theo đúng types.ts.
import { z } from 'zod';
import type { ArtifactData, ArtifactKind, MindmapNode } from './types';

const MAX = {
  title: 200,
  short: 300,
  mid: 1200,
  long: 5000,
  sections: 14,
  items: 20,
  lines: 120,
  scenes: 40,
  slides: 30,
  children: 20,
  depth: 6,
};

const s = (v: unknown, max: number): string => {
  if (typeof v === 'string') return v.trim().slice(0, max);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).slice(0, max);
  return '';
};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : NaN;
};

/** Lấy chuỗi JSON đầu tiên cân đối ngoặc, ưu tiên khối ```json. */
export function extractJson(raw: string): string | null {
  if (!raw) return null;
  const fence = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(raw);
  const src = fence && fence[1].includes('{') ? fence[1] : raw;
  const start = src.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

/** Lệnh LaTeX bắt đầu bằng b/f/n/r/t: JSON.parse sẽ hiểu nhầm thành ký tự điều khiển nếu chỉ có MỘT dấu gạch chéo. */
const LATEX_CMD_RE =
  /^(?:frac|dfrac|tfrac|times|theta|tan|tau|text|textbf|textit|to|top|right|rightarrow|rightleftharpoons|neq|ne|nu|not|notin|nabla|beta|bar|begin|bf|binom|bigcup|bigcap|bullet|forall|flat|rho|rm|ref)(?![a-zA-Z])/;

/**
 * Sửa dấu gạch chéo ngược trong chuỗi JSON do AI trả: công thức LaTeX như \frac, \sqrt, \alpha hay bị viết với MỘT dấu
 * (JSON sai hoặc, tệ hơn, \f thành ký tự điều khiển làm mất công thức). Chỉ sửa trong chuỗi, giữ nguyên escape hợp lệ.
 */
export function repairLatexEscapes(json: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (!inStr) {
      out += c;
      if (c === '"') inStr = true;
      continue;
    }
    if (c === '"') {
      inStr = false;
      out += c;
      continue;
    }
    if (c !== '\\') {
      out += c;
      continue;
    }
    const n = json[i + 1];
    if (n === undefined) {
      out += '\\\\';
    } else if (n === '\\' || n === '"' || n === '/') {
      out += c + n;
      i++;
    } else if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(json.slice(i + 2, i + 6))) {
      out += c;
    } else if ('bfnrt'.includes(n)) {
      out += LATEX_CMD_RE.test(json.slice(i + 1)) ? '\\\\' : c;
    } else {
      out += '\\\\';
    }
  }
  return out;
}

const ne = (label: string) => z.string().min(1, `${label} đang trống`);
const scriptLines = z.array(z.object({ speaker: ne('speaker'), text: ne('text') })).min(1, 'chưa có lượt nói nào');

const mindNode: z.ZodType<MindmapNode> = z.lazy(() =>
  z.object({ id: ne('id'), label: ne('label'), children: z.array(mindNode).optional() }),
);

const SCHEMAS: { [K in ArtifactKind]: z.ZodType<ArtifactData[K]> } = {
  text: z.object({
    title: ne('title'),
    sections: z.array(z.object({ heading: ne('heading'), body: ne('body') })).min(1, 'chưa có mục nào'),
  }),
  mindmap: z.object({ title: ne('title'), root: mindNode }),
  infographic: z.object({
    title: ne('title'),
    subtitle: z.string().optional(),
    keyPoints: z.array(z.object({ label: ne('label'), text: ne('text') })).min(1, 'chưa có ý chính'),
    steps: z.array(z.object({ n: z.number(), title: ne('title'), text: z.string() })).optional(),
    facts: z.array(z.object({ value: ne('value'), caption: z.string() })).optional(),
    takeaway: ne('takeaway'),
  }),
  podcast: z.object({
    title: ne('title'),
    durationMin: z.number().positive('durationMin phải > 0'),
    hosts: z.array(ne('host')).min(1, 'chưa có người dẫn'),
    lines: scriptLines,
  }),
  tranh_luan: z.object({
    title: ne('title'),
    topic: ne('topic'),
    experts: z.array(z.object({ name: ne('name'), stance: ne('stance') })).min(1, 'chưa có chuyên gia'),
    lines: scriptLines,
    conclusion: ne('conclusion'),
  }),
  video: z.object({
    title: ne('title'),
    totalMin: z.number().positive('totalMin phải > 0'),
    scenes: z
      .array(
        z.object({
          n: z.number(),
          durationSec: z.number().positive('durationSec phải > 0'),
          visual: ne('visual'),
          narration: ne('narration'),
          onScreenText: z.string().optional(),
        }),
      )
      .min(1, 'chưa có cảnh nào'),
  }),
  slides: z.object({
    title: ne('title'),
    slides: z
      .array(
        z.object({
          title: ne('title'),
          bullets: z.array(ne('bullet')).min(1, 'slide chưa có ý'),
          notes: z.string().optional(),
          visual: z.string().optional(),
        }),
      )
      .min(1, 'chưa có slide'),
  }),
  worksheet: z.object({
    title: ne('title'),
    sections: z
      .array(
        z.object({
          heading: ne('heading'),
          items: z
            .array(
              z.object({
                prompt: ne('prompt'),
                lines: z.number().optional(),
                level: z.enum(['nho', 'hieu', 'van_dung']).optional(),
              }),
            )
            .min(1, 'phần chưa có câu'),
        }),
      )
      .min(1, 'chưa có phần nào'),
    answerKey: z.array(z.object({ heading: ne('heading'), body: ne('body') })).min(1, 'chưa có đáp án'),
  }),
};

const LEVELS: Record<string, 'nho' | 'hieu' | 'van_dung'> = {
  nho: 'nho', nhớ: 'nho', 'nhận biết': 'nho', hieu: 'hieu', hiểu: 'hieu', 'thông hiểu': 'hieu',
  van_dung: 'van_dung', 'vận dụng': 'van_dung', 'van dung': 'van_dung',
  'phân tích': 'van_dung', 'phan tich': 'van_dung',
};

function normNode(v: unknown, depth: number, counter: { n: number }): Record<string, unknown> {
  const o = obj(v);
  const id = counter.n === 0 ? 'root' : `n${counter.n}`;
  counter.n++;
  const node: Record<string, unknown> = { id, label: s(o.label ?? o.title ?? o.name, 120) };
  if (depth < MAX.depth) {
    const kids = arr(o.children).slice(0, MAX.children).map((c) => normNode(c, depth + 1, counter));
    if (kids.length) node.children = kids;
  }
  return node;
}

function normScript(v: unknown) {
  return arr(v)
    .slice(0, MAX.lines)
    .map((l) => {
      const o = obj(l);
      return { speaker: s(o.speaker ?? o.name, 80), text: s(o.text ?? o.line, MAX.mid) };
    });
}

function normalize(kind: ArtifactKind, d: Record<string, unknown>): unknown {
  switch (kind) {
    case 'text':
      return {
        title: s(d.title, MAX.title),
        sections: arr(d.sections).slice(0, MAX.sections).map((x) => {
          const o = obj(x);
          return { heading: s(o.heading ?? o.title, MAX.short), body: s(o.body ?? o.text, MAX.long) };
        }),
      };
    case 'mindmap':
      return { title: s(d.title, MAX.title), root: normNode(d.root, 1, { n: 0 }) };
    case 'infographic': {
      const out: Record<string, unknown> = {
        title: s(d.title, MAX.title),
        keyPoints: arr(d.keyPoints).slice(0, MAX.items).map((x) => {
          const o = obj(x);
          return { label: s(o.label ?? o.title, 100), text: s(o.text, MAX.short) };
        }),
        takeaway: s(d.takeaway, MAX.mid),
      };
      if (s(d.subtitle, MAX.short)) out.subtitle = s(d.subtitle, MAX.short);
      const steps = arr(d.steps).slice(0, MAX.items);
      if (steps.length)
        out.steps = steps.map((x, i) => {
          const o = obj(x);
          return { n: i + 1, title: s(o.title, 120), text: s(o.text, MAX.short) };
        });
      const facts = arr(d.facts).slice(0, MAX.items);
      if (facts.length)
        out.facts = facts.map((x) => {
          const o = obj(x);
          return { value: s(o.value, 60), caption: s(o.caption, 200) };
        });
      return out;
    }
    case 'podcast': {
      const hosts = arr(d.hosts).map((h) => s(typeof h === "object" ? obj(h).name : h, 80)).filter(Boolean).slice(0, 6);
      return { title: s(d.title, MAX.title), durationMin: num(d.durationMin), hosts, lines: normScript(d.lines) };
    }
    case 'tranh_luan':
      return {
        title: s(d.title, MAX.title),
        topic: s(d.topic, MAX.short),
        experts: arr(d.experts).slice(0, 6).map((x) => {
          const o = obj(x);
          return { name: s(o.name, 80), stance: s(o.stance, MAX.short) };
        }),
        lines: normScript(d.lines),
        conclusion: s(d.conclusion, MAX.long),
      };
    case 'video':
      return {
        title: s(d.title, MAX.title),
        totalMin: num(d.totalMin),
        scenes: arr(d.scenes).slice(0, MAX.scenes).map((x, i) => {
          const o = obj(x);
          const sc: Record<string, unknown> = {
            n: i + 1,
            durationSec: num(o.durationSec),
            visual: s(o.visual, MAX.mid),
            narration: s(o.narration, MAX.long),
          };
          if (s(o.onScreenText, 200)) sc.onScreenText = s(o.onScreenText, 200);
          return sc;
        }),
      };
    case 'slides':
      return {
        title: s(d.title, MAX.title),
        slides: arr(d.slides).slice(0, MAX.slides).map((x) => {
          const o = obj(x);
          const sl: Record<string, unknown> = {
            title: s(o.title, 160),
            bullets: arr(o.bullets).map((b) => s(b, 300)).filter(Boolean).slice(0, 10),
          };
          if (s(o.notes, MAX.long)) sl.notes = s(o.notes, MAX.long);
          if (s(o.visual, MAX.short)) sl.visual = s(o.visual, MAX.short);
          return sl;
        }),
      };
    case 'worksheet':
      return {
        title: s(d.title, MAX.title),
        sections: arr(d.sections).slice(0, 10).map((x) => {
          const o = obj(x);
          return {
            heading: s(o.heading ?? o.title, MAX.short),
            items: arr(o.items).slice(0, MAX.items).map((it) => {
              const io = obj(it);
              const r: Record<string, unknown> = { prompt: s(io.prompt ?? io.question, MAX.mid) };
              const ln = num(io.lines);
              if (Number.isFinite(ln)) r.lines = Math.min(12, Math.max(0, Math.round(ln)));
              const lv = LEVELS[s(io.level, 30).toLowerCase()];
              if (lv) r.level = lv;
              return r;
            }),
          };
        }),
        answerKey: arr(d.answerKey).slice(0, 20).map((x) => {
          const o = obj(x);
          return { heading: s(o.heading ?? o.title, MAX.short), body: s(o.body ?? o.text, MAX.long) };
        }),
      };
  }
}

export function parseArtifact<K extends ArtifactKind>(
  kind: K,
  raw: string,
): { ok: true; value: ArtifactData[K] } | { ok: false; error: string } {
  const json = extractJson(raw);
  if (!json) return { ok: false, error: 'Không tìm thấy JSON trong đầu ra.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(repairLatexEscapes(json));
  } catch (e) {
    return { ok: false, error: `JSON không hợp lệ: ${e instanceof Error ? e.message : 'lỗi cú pháp'}` };
  }
  const o = obj(parsed);
  if (Object.keys(o).length === 0) return { ok: false, error: 'JSON rỗng hoặc không phải đối tượng.' };
  const res = SCHEMAS[kind].safeParse(normalize(kind, o));
  if (!res.success) {
    const msg = res.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.length ? i.path.join('.') : '(gốc)'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: `Sai lược đồ ${kind}: ${msg}` };
  }
  return { ok: true, value: res.data as ArtifactData[K] };
}
