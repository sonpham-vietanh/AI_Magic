'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { buildExamDocument, examPrintHtml } from '@/lib/assessment/examDoc';
import type { ExamItemSnapshot } from '@/lib/assessment/types';
import { useWordExport } from './useWordExport';
import { printHtml } from './printFrame';

interface Props {
  examId: string;
  examDate: string | null;
  items: ExamItemSnapshot[];
  rows: { atomId: string; atomCode: string; title: string }[];
  shortfall: string[];
}

/** Xuất đề trọn bộ: Word (ma trận + đặc tả + đề + đáp án) và bản in riêng đề / đáp án. */
export function ExamExport({ examId, examDate, items, rows, shortfall }: Props) {
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [minutes, setMinutes] = useState(45);
  const { busy, error, run } = useWordExport();
  const doc = useMemo(
    () => buildExamDocument(items, rows, shortfall, { examId, examDate, subject, grade, minutes }),
    [items, rows, shortfall, examId, examDate, subject, grade, minutes],
  );
  const empty = doc.questions.length === 0;
  const word = () =>
    run(async () => {
      const { buildExamDocxBlob } = await import('./examDocx');
      return { blob: await buildExamDocxBlob(doc), filename: `${examId}.docx` };
    });
  return (
    <section className="ag-card kt-act" aria-label="Xuất đề">
      <h3>Xuất đề trọn bộ</h3>
      <p className="ag-note">
        Tệp Word gồm trang 1 ma trận và bảng đặc tả, tiếp theo là đề, cuối cùng là đáp án (trang riêng, ghi “Dành cho giáo viên”). Tổng điểm {doc.totalPoints} trên 10.
      </p>
      <div className="ag-field-row kt-row">
        <div>
          <label htmlFor="x-subject" className="ag-field-label">Môn</label>
          <input id="x-subject" className="ag-field" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ví dụ: Toán" />
        </div>
        <div>
          <label htmlFor="x-grade" className="ag-field-label">Khối</label>
          <input id="x-grade" className="ag-field" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Ví dụ: 10" />
        </div>
        <div>
          <label htmlFor="x-min" className="ag-field-label">Thời gian (phút)</label>
          <input id="x-min" type="number" min={5} max={180} className="ag-field" value={minutes} onChange={(e) => setMinutes(Math.max(5, Math.min(180, Number(e.target.value) || 45)))} />
        </div>
      </div>
      <div className="ag-actions">
        <button type="button" className="ag-btn dark" onClick={() => void word()} disabled={empty || busy}>
          {busy ? <span className="ag-spin" aria-hidden="true" /> : <Icon name="download" size={18} />} Tải đề (.docx)
        </button>
        <button type="button" className="ag-btn" onClick={() => printHtml(examPrintHtml(doc, 'de'))} disabled={empty}>
          <Icon name="print" size={18} /> In / Lưu PDF đề
        </button>
        <button type="button" className="ag-btn" onClick={() => printHtml(examPrintHtml(doc, 'dap_an'))} disabled={empty}>
          <Icon name="print" size={18} /> In / Lưu PDF đáp án
        </button>
      </div>
      {error && (
        <div className="ag-alert bad" role="alert">
          <Icon name="alert" size={18} />
          <div>{error}</div>
        </div>
      )}
      {empty && <p className="ag-note">Đề chưa có câu nào nên chưa xuất được.</p>}
    </section>
  );
}
