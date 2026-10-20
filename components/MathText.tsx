'use client';

import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Fragment, useMemo } from 'react';

type Seg = { type: 'text' | 'math'; value: string; display?: boolean };

const MATH_RE =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;

export function splitMath(input: string): Seg[] {
  const segs: Seg[] = [];
  let last = 0;
  for (const m of input.matchAll(MATH_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) segs.push({ type: 'text', value: input.slice(last, idx) });
    const display = m[1] !== undefined || m[2] !== undefined;
    segs.push({
      type: 'math',
      value: (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim(),
      display,
    });
    last = idx + m[0].length;
  }
  if (last < input.length) segs.push({ type: 'text', value: input.slice(last) });
  return segs;
}

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
 * Renders text with $..$, $$..$$, \(..\) LaTeX via KaTeX; everything else
 * stays React text nodes. Already-cleaned text (no delimiters) renders as plain text.
 */
export function MathText({ text }: { text?: string | null }) {
  const segs = useMemo(
    () => (typeof text === 'string' && text ? splitMath(text) : []),
    [text],
  );
  if (segs.length === 0) return null;
  return (
    <>
      {segs.map((s, i) => {
        if (s.type === 'text') return <Fragment key={i}>{s.value}</Fragment>;
        const html = renderKatex(s.value, !!s.display);
        if (html === null) return <Fragment key={i}>{s.value}</Fragment>;
        return (
          <span
            key={i}
            // Only KaTeX output of the isolated math fragment is injected.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </>
  );
}
