'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { buildDocxBlob, downloadBlob } from '@/lib/export/docx';
import { MathText } from '@/components/MathText';
import { classifyLine } from '@/components/agent/Canvas';

export interface Section {
  heading: string;
  body: string;
}

interface Parsed {
  notes: string[];
  questions: { n: number; text: string; answer: string }[];
  others: Section[];
}

const isQuestions = (h: string) => /^(Câu hỏi|Đề bài)/i.test(h.trim());
const isAnswers = (h: string) => /^Đáp án/i.test(h.trim());
const isMatrixInfo = (h: string) => /^(Ma trận|Thiếu câu hỏi)/i.test(h.trim());

/** Tách các mục của máy chủ thành từng câu hỏi kèm đáp án (ghép theo số câu). */
export function parseSections(sections: Section[]): Parsed {
  const notes: string[] = [];
  const questions: Parsed['questions'] = [];
  const others: Section[] = [];
  const answerMap = new Map<number, string>();
  for (const s of sections) {
    if (isAnswers(s.heading)) {
      for (const block of s.body.split(/\n{2,}/)) {
        const m = /^Câu\s*(\d+)/.exec(block.trim());
        if (m) answerMap.set(Number(m[1]), block.trim());
      }
    }
  }
  for (const s of sections) {
    if (isQuestions(s.heading)) {
      for (const block of s.body.split(/\n{2,}/)) {
        const t = block.trim();
        if (!t) continue;
        const m = /^Câu\s*(\d+)/.exec(t);
        if (m) questions.push({ n: Number(m[1]), text: t, answer: answerMap.get(Number(m[1])) ?? '' });
        else notes.push(...t.split('\n').map((l) => l.replace(/^Lưu ý:\s*/, '').trim()).filter(Boolean));
      }
    } else if (!isAnswers(s.heading) && !isMatrixInfo(s.heading)) {
      others.push(s);
    }
  }
  return { notes, questions, others };
}

function Lines({ text }: { text: string }) {
  return (
    <>
      {text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((l, i) =>
          l.trim() === '' ? null : (
            <p key={i} className={`ag-line ${classifyLine(l) === 'li' ? 'li' : ''}`}>
              <MathText text={l.trim()} />
            </p>
          ),
        )}
    </>
  );
}

/** Danh sách câu hỏi dạng thẻ, đáp án gấp lại; có In và Tải .docx. */
export function QuestionSet({ sections, docTitle, showTools = true }: { sections: Section[]; docTitle: string; showTools?: boolean }) {
  const { notes, questions, others } = parseSections(sections);
  const [open, setOpen] = useState(false);

  const exportDocx = async () => {
    const blob = await buildDocxBlob({ title: docTitle.toUpperCase(), subtitle: [], sections });
    downloadBlob(blob, `${docTitle.replace(/[^\w\-]+/g, '-').slice(0, 40) || 'de'}.docx`);
  };

  return (
    <div className="kt-set">
      {showTools && (
        <div className="kt-set-tools">
          <button type="button" className="ag-btn small" onClick={() => setOpen((v) => !v)} aria-pressed={open}>
            {open ? 'Ẩn tất cả đáp án' : 'Hiện tất cả đáp án'}
          </button>
          <button type="button" className="ag-btn small" onClick={() => void exportDocx()}>
            <Icon name="download" size={16} /> Tải .docx
          </button>
          <button type="button" className="ag-btn small" onClick={() => window.print()}>
            <Icon name="print" size={16} /> In
          </button>
        </div>
      )}
      {notes.length > 0 && (
        <div className="ag-alert info" role="note">
          <Icon name="info" size={18} />
          <div>{notes.map((n, i) => <div key={i}>{n}</div>)}</div>
        </div>
      )}
      {questions.length === 0 && <p className="ag-note">Chưa có câu hỏi phù hợp.</p>}
      <ol className="kt-qs">
        {questions.map((q) => (
          <li key={q.n} className="ag-card kt-q">
            <div className="kt-q-text">
              <Lines text={q.text} />
            </div>
            {q.answer && (
              <details className="kt-ans" open={open}>
                <summary>Xem đáp án</summary>
                <Lines text={q.answer} />
              </details>
            )}
          </li>
        ))}
      </ol>
      {others.map((s) => (
        <div key={s.heading} className="ag-card kt-other">
          <h3>{s.heading}</h3>
          <Lines text={s.body} />
        </div>
      ))}
    </div>
  );
}
