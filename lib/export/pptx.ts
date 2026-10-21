// Dựng tệp PowerPoint (16:9) từ SlidesData bằng pptxgenjs. Chạy được cả trong trình duyệt lẫn Node.
import type { Slide, SlidesData } from '@/lib/resources/types';

const NAVY = '14153A';
const GOLD = 'F9DD0E';
const CREAM = 'FAF9F4';
const INK = '1A1A2E';
const MUTED = '54556E';
const FONT = 'Arial'; // có đủ dấu tiếng Việt trên Windows/macOS/PowerPoint Online

// Slide 16:9 = 10 x 5.625 inch
const BODY_W = 5.9; // inch khi có khung gợi ý hình
const BODY_W_FULL = 8.9;
const BODY_H = 3.3;

/** Ước lượng số dòng khi một đoạn chữ cỡ `pt` đặt vào khung rộng `widthIn` inch. */
export function estimateLines(text: string, pt: number, widthIn: number): number {
  const charW = (pt * 0.5) / 72; // inch / ký tự (Arial trung bình ~0.5em)
  const perLine = Math.max(6, Math.floor(widthIn / charW));
  let lines = 0;
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let cur = 0;
    let n = 1;
    for (const w of words) {
      const len = w.length;
      if (cur === 0) cur = len;
      else if (cur + 1 + len <= perLine) cur += 1 + len;
      else {
        n++;
        cur = len;
      }
      while (cur > perLine) {
        n++;
        cur -= perLine;
      }
    }
    lines += n;
  }
  return lines;
}

/** Chọn cỡ chữ lớn nhất (pt) để các gạch đầu dòng vừa khung, không tràn. */
export function fitBulletFont(bullets: string[], widthIn: number, heightIn: number): number {
  for (const pt of [24, 22, 20, 18, 16, 14, 12]) {
    const textW = widthIn - 0.35; // trừ phần thụt gạch đầu dòng
    const lines = bullets.reduce((s, b) => s + estimateLines(b, pt, textW), 0);
    const h = ((lines * pt * 1.2 + bullets.length * pt * 0.5) / 72);
    if (h <= heightIn) return pt;
  }
  return 12;
}

export function fitTitleFont(title: string, widthIn: number): number {
  for (const pt of [30, 28, 26, 24, 22, 20]) {
    if (estimateLines(title, pt * 1.1, widthIn) <= 2) return pt;
  }
  return 20;
}

function slideNotes(s: Slide): string {
  const parts: string[] = [];
  if (s.notes) parts.push(s.notes);
  if (s.visual) parts.push(`Gợi ý hình minh hoạ: ${s.visual}`);
  return parts.join('\n\n');
}

export interface PptxBuildResult {
  data: Uint8Array;
  slideCount: number;
}

export async function buildSlidesPptx(deck: SlidesData): Promise<PptxBuildResult> {
  const mod = await import('pptxgenjs');
  const PptxGenJS = (mod as { default?: unknown }).default ?? mod;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pptx = new (PptxGenJS as any)();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = deck.title;
  pptx.author = 'Trường Việt Anh';
  pptx.company = 'Trường Việt Anh';

  // Bìa
  const cover = pptx.addSlide();
  cover.background = { color: NAVY };
  cover.addShape('rect', { x: 0.6, y: 2.95, w: 1.6, h: 0.08, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
  cover.addText(deck.title, {
    x: 0.6,
    y: 1.2,
    w: 8.8,
    h: 1.6,
    fontFace: FONT,
    fontSize: fitTitleFont(deck.title, 8.8) + 6,
    bold: true,
    color: 'FFFFFF',
    valign: 'bottom',
    fit: 'shrink',
  });
  cover.addText('Trường Việt Anh', { x: 0.6, y: 3.2, w: 8.8, h: 0.5, fontFace: FONT, fontSize: 18, color: GOLD });
  cover.addNotes('Slide bìa. Chiếu khi học sinh vào lớp.');

  const slides = deck.slides ?? [];
  slides.forEach((s, idx) => {
    const sl = pptx.addSlide();
    sl.background = { color: CREAM };
    sl.addShape('rect', { x: 0, y: 0, w: 10, h: 1.1, fill: { color: NAVY }, line: { color: NAVY, width: 0 } });
    sl.addShape('rect', { x: 0, y: 1.1, w: 10, h: 0.06, fill: { color: GOLD }, line: { color: GOLD, width: 0 } });
    sl.addText(s.title, {
      x: 0.5,
      y: 0.1,
      w: 9,
      h: 0.9,
      fontFace: FONT,
      fontSize: fitTitleFont(s.title, 9),
      bold: true,
      color: 'FFFFFF',
      valign: 'middle',
      fit: 'shrink',
    });

    const bullets = (s.bullets ?? []).filter(Boolean);
    const hasVisual = !!s.visual;
    const w = hasVisual ? BODY_W : BODY_W_FULL;
    const pt = fitBulletFont(bullets, w, BODY_H);
    if (bullets.length) {
      sl.addText(
        bullets.map((b) => ({
          text: b,
          options: { bullet: { indent: 18 }, breakLine: true, paraSpaceAfter: Math.round(pt * 0.5) },
        })),
        { x: 0.5, y: 1.45, w, h: BODY_H + 0.2, fontFace: FONT, fontSize: pt, color: INK, valign: 'top', fit: 'shrink' },
      );
    }
    if (hasVisual) {
      sl.addShape('roundRect', {
        x: 6.7,
        y: 1.5,
        w: 2.8,
        h: 3.0,
        fill: { color: 'FBF6DC' },
        line: { color: 'D3CFC0', width: 1, dashType: 'dash' },
        rectRadius: 0.1,
      });
      sl.addText(
        [
          { text: 'Gợi ý hình minh hoạ', options: { bold: true, color: NAVY, fontSize: 12, breakLine: true } },
          { text: s.visual as string, options: { color: INK, fontSize: 12 } },
        ],
        { x: 6.8, y: 1.6, w: 2.6, h: 2.8, fontFace: FONT, valign: 'top', fit: 'shrink' },
      );
    }
    sl.addText('Trường Việt Anh', { x: 0.5, y: 5.2, w: 4, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED });
    sl.addText(String(idx + 1), { x: 8.8, y: 5.2, w: 0.7, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTED, align: 'right' });
    sl.addNotes(slideNotes(s) || 'Chưa có ghi chú cho slide này.');
  });

  const out = (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
  return { data: out, slideCount: slides.length + 1 };
}
