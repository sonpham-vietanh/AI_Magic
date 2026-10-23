// Bản in sạch cho phiếu học tập: HTML riêng cho học sinh và cho giáo viên (đáp án), in qua iframe ẩn.
import type { WorksheetData } from '@/lib/resources/types';
import katex from 'katex';
import { escapeHtml } from './docx';
import { latexToUnicode } from './latex';
import { splitMath } from '@/lib/text/math';
import { viDatesInText } from '@/lib/text/date';

export interface PrintOptions {
  /** true: đóng dấu "BẢN NHÁP, CHƯA DUYỆT" ở đầu và chân mỗi trang in. */
  draft?: boolean;
}

const DRAFT_STAMP = 'BẢN NHÁP, CHƯA DUYỆT';

/**
 * Văn bản có công thức thành HTML an toàn: chữ được thoát ký tự, công thức dựng bằng KaTeX (MathML, trình duyệt tự vẽ nên
 * khung in không cần tệp kiểu). Công thức hỏng rơi về chuỗi Unicode.
 */
export function mathHtml(text: string): string {
  return splitMath(viDatesInText(String(text ?? '')))
    .map((seg) => {
      if (seg.type === 'text') return escapeHtml(seg.value);
      try {
        return katex.renderToString(seg.value, { throwOnError: false, trust: false, displayMode: !!seg.display, output: 'mathml' });
      } catch {
        return escapeHtml(latexToUnicode(seg.value));
      }
    })
    .join('');
}

const LEVEL: Record<string, string> = { nho: 'Nhớ', hieu: 'Hiểu', van_dung: 'Vận dụng' };

const CSS = `
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: Arial, 'Helvetica Neue', sans-serif; color: #1a1a2e; font-size: 13pt; line-height: 1.45; margin: 0; }
.school { font-weight: 700; letter-spacing: .04em; color: #14153a; border-bottom: 2px solid #14153a; padding-bottom: 4px; margin-bottom: 14px; font-size: 11pt; }
.who { display: flex; gap: 24px; margin-bottom: 12px; font-size: 12pt; }
.who span { flex: 1; border-bottom: 1px dotted #555; padding-bottom: 2px; }
.who span:first-child { flex: 3; }
h1 { text-align: center; font-size: 19pt; color: #14153a; margin: 8px 0 14px; }
h2 { font-size: 14pt; color: #14153a; border-bottom: 1px solid #d3cfc0; padding-bottom: 3px; margin: 18px 0 8px; break-after: avoid; }
.q { margin: 10px 0 4px; break-inside: avoid; }
.q b { color: #14153a; }
.tag { font-size: 10pt; color: #54556e; font-style: italic; }
.ruled { height: 8.5mm; border-bottom: 1px dotted #666; }
.banner { text-align: center; font-weight: 700; background: #fbf6dc; border: 1px solid #e8c40a; color: #7a5f00; padding: 6px; margin: 4px 0 14px; }
.key { break-inside: avoid; margin-bottom: 8px; }
.key p { margin: 2px 0; white-space: pre-wrap; }
math { font-size: 1.05em; }
.ds { position: fixed; left: 0; right: 0; text-align: center; font: 700 9pt Arial, sans-serif; color: #7c2d12; background: #fef3c7; border-top: 1px solid #b45309; border-bottom: 1px solid #b45309; padding: 2px 0; }
.ds.top { top: 0; }
.ds.bot { bottom: 0; }
body.is-draft { padding: 7mm 0; }
.doc-sec { margin-bottom: 6px; }
.doc-sec p { margin: 3px 0; white-space: pre-wrap; }
.doc-sec table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; break-inside: auto; }
.doc-sec td, .doc-sec th { border: 1px solid #000; padding: 4px 8px; vertical-align: top; text-align: left; }
.sub { text-align: center; color: #54556e; margin: 0 0 4px; font-size: 11pt; }
`;

function wrap(title: string, inner: string, o: PrintOptions = {}): string {
  const stamp = o.draft ? `<div class="ds top">${DRAFT_STAMP}</div><div class="ds bot">${DRAFT_STAMP}</div>` : '';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${CSS}</style></head><body${o.draft ? ' class="is-draft"' : ''}>${stamp}${inner}</body></html>`;
}

/** Bản in của một bản soạn dạng văn bản (Kế hoạch bài dạy, bài đọc...): tiêu đề, các mục, công thức, A4. */
export function buildDocumentHtml(input: { title: string; subtitle?: string[]; sections: { heading: string; body: string }[] }, o: PrintOptions = {}): string {
  const secs = input.sections
    .map((s) => `<div class="doc-sec">${s.heading.trim() ? `<h2>${mathHtml(s.heading)}</h2>` : ''}${String(s.body ?? '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => `<p>${mathHtml(l)}</p>`)
      .join('')}</div>`)
    .join('');
  const subs = (input.subtitle ?? []).filter(Boolean).map((t) => `<p class="sub">${mathHtml(t)}</p>`).join('');
  return wrap(input.title, `<div class="school">TRƯỜNG VIỆT ANH</div><h1>${mathHtml(input.title)}</h1>${subs}${secs}`, o);
}

/** Trang phiếu cho HỌC SINH: tuyệt đối không có đáp án. */
export function buildWorksheetStudentHtml(d: WorksheetData, o: PrintOptions = {}): string {
  let n = 0;
  const body = (d.sections ?? [])
    .map((sec) => {
      const items = (sec.items ?? [])
        .map((it) => {
          n++;
          const rules = Array.from({ length: Math.max(0, Math.min(10, it.lines ?? 3)) }, () => '<div class="ruled"></div>').join('');
          const tag = it.level ? ` <span class="tag">(${LEVEL[it.level]})</span>` : '';
          return `<div class="q"><b>Câu ${n}.</b> ${mathHtml(it.prompt)}${tag}</div>${rules}`;
        })
        .join('');
      return `<h2>${escapeHtml(sec.heading)}</h2>${items}`;
    })
    .join('');
  return wrap(
    d.title,
    `<div class="school">TRƯỜNG VIỆT ANH</div><div class="who"><span>Họ và tên:</span><span>Lớp:</span><span>Ngày:</span></div><h1>${mathHtml(d.title)}</h1>${body}`,
    o,
  );
}

/** Trang đáp án riêng cho GIÁO VIÊN. */
export function buildWorksheetTeacherHtml(d: WorksheetData, o: PrintOptions = {}): string {
  const body = (d.answerKey ?? [])
    .map((k) => `<div class="key"><h2>${escapeHtml(k.heading)}</h2><p>${mathHtml(k.body)}</p></div>`)
    .join('');
  return wrap(
    `${d.title} - Đáp án`,
    `<div class="school">TRƯỜNG VIỆT ANH</div><div class="banner">DÀNH CHO GIÁO VIÊN — không phát cho học sinh</div><h1>Đáp án: ${mathHtml(d.title)}</h1>${body}`,
    o,
  );
}

/** Mở hộp thoại in cho một đoạn HTML bằng iframe ẩn (không mở cửa sổ mới). */
export function printHtml(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return reject(new Error('Chỉ in được trong trình duyệt.'));
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    const remove = () => setTimeout(() => frame.remove(), 1500);
    frame.onload = () => {
      const w = frame.contentWindow;
      if (!w) return reject(new Error('Không mở được bản in.'));
      setTimeout(() => {
        try {
          w.focus();
          w.print();
        } catch (e) {
          remove();
          reject(e instanceof Error ? e : new Error('Không mở được bản in.'));
          return;
        }
        resolve();
        // Giữ khung đủ lâu để hộp thoại in dùng xong.
        setTimeout(() => frame.remove(), 120000);
      }, 150);
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
