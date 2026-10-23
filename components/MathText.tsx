'use client';

import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Fragment, useMemo } from 'react';
import { splitMath } from '@/lib/text/math';
import { latexToUnicode } from '@/lib/export/latex';

export { splitMath };

function renderKatex(tex: string, display: boolean): string | null {
  try {
    return katex.renderToString(tex, {
      throwOnError: false,
      trust: false,
      displayMode: display,
      output: 'htmlAndMathml',
    });
  } catch {
    return null;
  }
}

/**
 * Hiện văn bản có công thức LaTeX ($..$, $$..$$, \(..\), \[..\]) bằng KaTeX; phần còn lại là text node của React.
 * Văn bản không có dấu phân cách công thức hiện nguyên như chữ thường. Công thức hỏng rơi về chữ Unicode đọc được.
 */
export function MathText({ text }: { text?: string | null }) {
  const segs = useMemo(() => (typeof text === 'string' && text ? splitMath(text) : []), [text]);
  if (segs.length === 0) return null;
  return (
    <>
      {segs.map((s, i) => {
        if (s.type === 'text') return <Fragment key={i}>{s.value}</Fragment>;
        const html = renderKatex(s.value, !!s.display);
        if (html === null) return <Fragment key={i}>{latexToUnicode(s.value)}</Fragment>;
        return (
          <span
            key={i}
            className={s.display ? 'mt-display' : 'mt-inline'}
            // Chỉ chèn đầu ra KaTeX của đúng đoạn công thức đã tách (trust tắt, không chạy lệnh nguy hiểm).
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </>
  );
}
