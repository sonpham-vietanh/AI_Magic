// Dựng văn bản để cô/thầy dán vào Gamma hoặc thêm làm nguồn trong NotebookLM.
// Hàm thuần: không gọi API ngoài, không phụ thuộc React hay trình duyệt.
import type { Artifact, SlidesData, TextData, WorksheetData } from '../resources/types';

export interface ExportSection {
  heading: string;
  body: string;
}

export interface ExportInput {
  title: string;
  /** Tên sản phẩm (VD: Kế hoạch bài dạy). */
  formatText?: string;
  lessonTitle?: string;
  bloomLevels?: string[];
  /** Văn bản hiện tại (có thể đã được giáo viên chỉnh). */
  text: string;
  sections?: ExportSection[];
  artifacts?: Artifact[];
}

const MAX_BULLETS = 5;
const MAX_BULLET_LEN = 140;
const GENERIC_HEADING = /^Nội dung( học liệu biên soạn)?$/i;
const OBJECTIVE_HEADING = /mục tiêu|yêu cầu cần đạt/i;
const QUESTION_HEADING = /câu hỏi|bài tập|luyện tập|vận dụng|kiểm tra|đánh giá|trắc nghiệm|quiz/i;

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function stripMarker(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^([-•–*]|\d{1,2}[.)]|[a-dđ]\))\s+/i, '')
    .trim();
}

function shorten(s: string, max = MAX_BULLET_LEN): string {
  const t = clean(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, '')}…`;
}

/** Tách thân mục thành các ý ngắn: mỗi dòng một ý, câu dài được tách theo dấu chấm. */
export function toBullets(body: string, max = MAX_BULLETS): string[] {
  const out: string[] = [];
  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const line = stripMarker(raw);
    if (!line) continue;
    const parts = line.length > MAX_BULLET_LEN ? line.split(/(?<=[.!?;])\s+/) : [line];
    for (const p of parts) {
      const t = shorten(p);
      if (t.length >= 3) out.push(t);
      if (out.length >= max) return out;
    }
  }
  return out;
}

function pickSlides(artifacts?: Artifact[]): SlidesData | undefined {
  const a = (artifacts ?? []).find((x) => x.kind === 'slides');
  const d = a?.data as SlidesData | undefined;
  return d && Array.isArray(d.slides) && d.slides.length > 0 ? d : undefined;
}

/** Nếu thiếu sections thì tách từ text: dòng "# Tiêu đề" hoặc dòng ngắn đứng riêng mở mục mới. */
function sectionsOf(i: ExportInput): ExportSection[] {
  if (i.sections && i.sections.length > 0 && i.sections.some((s) => s.body.trim() || s.heading.trim())) {
    return i.sections.map((s) => ({ heading: s.heading.trim(), body: s.body }));
  }
  const out: { heading: string; body: string[] }[] = [];
  for (const line of i.text.replace(/\r\n?/g, '\n').split('\n')) {
    const md = /^#{1,3}\s+(.+)$/.exec(line);
    if (md) out.push({ heading: md[1].trim(), body: [] });
    else {
      if (out.length === 0) out.push({ heading: '', body: [] });
      out[out.length - 1].body.push(line);
    }
  }
  return out.map((s) => ({ heading: s.heading, body: s.body.join('\n').trim() })).filter((s) => s.heading || s.body);
}

function realHeading(h: string, fallback: string): string {
  const t = clean(h);
  return !t || GENERIC_HEADING.test(t) ? fallback : t;
}

function metaLine(i: ExportInput): string {
  const bits = [i.formatText, i.lessonTitle ? `Bài: ${i.lessonTitle}` : '', i.bloomLevels?.length ? `Mức tư duy: ${i.bloomLevels.join(' → ')}` : '']
    .map((x) => (x ?? '').trim())
    .filter(Boolean);
  return bits.join(' · ');
}

/** Dàn ý markdown theo thẻ slide để dán vào Gamma ("Dán văn bản"): mỗi slide một tiêu đề, 3-5 ý, ghi chú cho giáo viên. */
export function buildGammaOutline(i: ExportInput): string {
  const lines: string[] = [`# ${clean(i.title) || 'Bài giảng'}`];
  const meta = metaLine(i);
  if (meta) lines.push('', meta);

  const deck = pickSlides(i.artifacts);
  if (deck) {
    deck.slides.forEach((s, idx) => {
      const bullets = (s.bullets ?? []).map((b) => shorten(stripMarker(String(b)))).filter(Boolean).slice(0, MAX_BULLETS);
      lines.push('', '---', '', `## Slide ${idx + 1}: ${clean(s.title) || `Nội dung ${idx + 1}`}`, '');
      for (const b of bullets) lines.push(`- ${b}`);
      if (s.visual?.trim()) lines.push('', `Gợi ý hình: ${clean(s.visual)}`);
      if (s.notes?.trim()) lines.push('', `Ghi chú cho giáo viên: ${clean(s.notes)}`);
    });
    return `${lines.join('\n')}\n`;
  }

  const secs = sectionsOf(i);
  secs.forEach((s, idx) => {
    const bullets = toBullets(s.body);
    if (!s.heading && bullets.length === 0) return;
    lines.push('', '---', '', `## Slide ${idx + 1}: ${realHeading(s.heading, `Nội dung ${idx + 1}`)}`, '');
    for (const b of bullets.slice(0, MAX_BULLETS)) lines.push(`- ${b}`);
    const rest = toBullets(s.body, 40).slice(MAX_BULLETS);
    if (rest.length > 0) lines.push('', `Ghi chú cho giáo viên: ${rest.map((r) => shorten(r, 200)).join(' ')}`);
  });
  return `${lines.join('\n')}\n`;
}

function worksheetQuestions(artifacts?: Artifact[]): string[] {
  const out: string[] = [];
  for (const a of artifacts ?? []) {
    if (a.kind !== 'worksheet') continue;
    const d = a.data as WorksheetData;
    for (const sec of d?.sections ?? []) for (const it of sec.items ?? []) if (it.prompt?.trim()) out.push(clean(it.prompt));
  }
  return out;
}

/** Văn bản nguồn sạch cho NotebookLM: tiêu đề, mục tiêu, nội dung, câu hỏi. Không có chú thích kỹ thuật. */
export function buildNotebookSource(i: ExportInput): string {
  const lines: string[] = [`# ${clean(i.title) || 'Học liệu'}`];
  const meta = metaLine(i);
  if (meta) lines.push('', meta);

  let secs = sectionsOf(i);
  const textArt = (i.artifacts ?? []).find((a) => a.kind === 'text')?.data as TextData | undefined;
  if (secs.length === 0 && textArt?.sections?.length) secs = textArt.sections;

  const objectives = secs.filter((s) => OBJECTIVE_HEADING.test(s.heading));
  const questionSecs = secs.filter((s) => !OBJECTIVE_HEADING.test(s.heading) && QUESTION_HEADING.test(s.heading));
  const content = secs.filter((s) => !objectives.includes(s) && !questionSecs.includes(s));

  if (objectives.length > 0) {
    lines.push('', '## Mục tiêu');
    for (const s of objectives) for (const b of toBullets(s.body, 12)) lines.push(`- ${b}`);
  }

  if (content.length > 0) {
    lines.push('', '## Nội dung');
    content.forEach((s, idx) => {
      const h = realHeading(s.heading, '');
      if (h) lines.push('', `### ${h}`, '');
      else if (idx > 0) lines.push('');
      lines.push(s.body.replace(/\r\n?/g, '\n').trim());
    });
  }

  const qs: string[] = [];
  for (const s of questionSecs) {
    const body = s.body.replace(/\r\n?/g, '\n').trim();
    if (body) qs.push(body);
  }
  const wq = worksheetQuestions(i.artifacts);
  if (qs.length > 0 || wq.length > 0) {
    lines.push('', '## Câu hỏi');
    if (qs.length > 0) lines.push('', ...qs);
    wq.forEach((q, n) => lines.push(`${n + 1}. ${q}`));
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

/** Tên tệp an toàn, có dấu gạch ngang, kèm hậu tố. */
export function exportFileName(title: string, suffix: string): string {
  const base = title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 50) || 'ban-soan';
  return `${base}-${suffix}.md`;
}

export const GAMMA_GUIDE = [
  'Mở gamma.app, chọn Tạo mới, rồi chọn “Dán văn bản” và dán nội dung vừa sao chép.',
  'Nếu Gamma hỏi, chọn giữ nguyên cấu trúc để mỗi mục “Slide” thành một thẻ, rồi chọn giao diện.',
];
export const NOTEBOOKLM_GUIDE = [
  'Mở notebooklm.google.com, tạo hoặc mở một sổ tay, bấm “Thêm nguồn”.',
  'Chọn “Văn bản đã sao chép” và dán nội dung, hoặc tải tệp .md vừa lưu lên.',
];
