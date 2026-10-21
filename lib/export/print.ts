// Bản in sạch cho phiếu học tập: HTML riêng cho học sinh và cho giáo viên (đáp án), in qua iframe ẩn.
import type { WorksheetData } from '@/lib/resources/types';
import { escapeHtml } from './docx';

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
`;

function wrap(title: string, inner: string): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${CSS}</style></head><body>${inner}</body></html>`;
}

/** Trang phiếu cho HỌC SINH: tuyệt đối không có đáp án. */
export function buildWorksheetStudentHtml(d: WorksheetData): string {
  let n = 0;
  const body = (d.sections ?? [])
    .map((sec) => {
      const items = (sec.items ?? [])
        .map((it) => {
          n++;
          const rules = Array.from({ length: Math.max(0, Math.min(10, it.lines ?? 3)) }, () => '<div class="ruled"></div>').join('');
          const tag = it.level ? ` <span class="tag">(${LEVEL[it.level]})</span>` : '';
          return `<div class="q"><b>Câu ${n}.</b> ${escapeHtml(it.prompt)}${tag}</div>${rules}`;
        })
        .join('');
      return `<h2>${escapeHtml(sec.heading)}</h2>${items}`;
    })
    .join('');
  return wrap(
    d.title,
    `<div class="school">TRƯỜNG VIỆT ANH</div><div class="who"><span>Họ và tên:</span><span>Lớp:</span><span>Ngày:</span></div><h1>${escapeHtml(d.title)}</h1>${body}`,
  );
}

/** Trang đáp án riêng cho GIÁO VIÊN. */
export function buildWorksheetTeacherHtml(d: WorksheetData): string {
  const body = (d.answerKey ?? [])
    .map((k) => `<div class="key"><h2>${escapeHtml(k.heading)}</h2><p>${escapeHtml(k.body)}</p></div>`)
    .join('');
  return wrap(
    `${d.title} - Đáp án`,
    `<div class="school">TRƯỜNG VIỆT ANH</div><div class="banner">DÀNH CHO GIÁO VIÊN — không phát cho học sinh</div><h1>Đáp án: ${escapeHtml(d.title)}</h1>${body}`,
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
