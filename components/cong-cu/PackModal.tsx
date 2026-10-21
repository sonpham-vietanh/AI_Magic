'use client';

import { useEffect, useRef } from 'react';
import type { CompleteLessonPack, LessonPackSection } from '@/app/api/generate-pack/route';
import { Icon } from '@/components/ui/icons';
import { MathText } from '@/components/MathText';
import { Modal } from './Modal';

export type PackStepStatus = 'waiting' | 'running' | 'done';
export const PACK_STEP_IDS: LessonPackSection['id'][] = [
  'giao_an',
  'phieu_hoc_tap',
  'kiem_tra_nhanh',
  'cam_nang_socratic',
];
export const initialPackSteps = (): Record<LessonPackSection['id'], PackStepStatus> => ({
  giao_an: 'waiting',
  phieu_hoc_tap: 'waiting',
  kiem_tra_nhanh: 'waiting',
  cam_nang_socratic: 'waiting',
});

export function PackModal({
  mode,
  loading,
  elapsed,
  steps,
  preview,
  pack,
  tab,
  onTab,
  notice,
  lessonTitle,
  className,
  questionsCount,
  socraticCount,
  onDownload,
  onCancel,
  onClose,
}: {
  mode: 'lesson' | 'exam';
  loading: boolean;
  elapsed: number;
  steps: Record<LessonPackSection['id'], PackStepStatus>;
  preview: string;
  pack: CompleteLessonPack | null;
  tab: LessonPackSection['id'];
  onTab: (id: LessonPackSection['id']) => void;
  notice: string;
  lessonTitle: string;
  className: string;
  questionsCount: number;
  socraticCount: number;
  onDownload: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const previewRef = useRef<HTMLPreElement | null>(null);
  useEffect(() => {
    if (previewRef.current) previewRef.current.scrollTop = previewRef.current.scrollHeight;
  }, [preview]);

  const labels: Record<LessonPackSection['id'], string> = {
    giao_an: 'Kế hoạch bài dạy (Công văn 5512)',
    phieu_hoc_tap: `Phiếu học tập A4, 3 mức${className ? ` cho lớp ${className}` : ''}`,
    kiem_tra_nhanh: `Kiểm tra cuối tiết (${questionsCount} câu từ ngân hàng)`,
    cam_nang_socratic: `Cẩm nang hỏi đáp gợi mở (${socraticCount} kịch bản) và liên môn`,
  };

  const title =
    mode === 'exam'
      ? 'Đề kiểm tra nhiều bài'
      : 'Trọn bộ hồ sơ bài dạy';

  const actions = pack ? (
    <>
      <button type="button" className="ag-btn primary small" onClick={onDownload}>
        <Icon name="download" size={18} />
        Tải Word
      </button>
      <button type="button" className="ag-btn small" onClick={() => window.print()}>
        <Icon name="print" size={18} />
        <span className="cc-hide-narrow">In / PDF</span>
        <span className="cc-show-narrow">In</span>
      </button>
    </>
  ) : null;

  return (
    <Modal
      size="xl"
      eyebrow={mode === 'exam' ? 'Máy trộn đề' : `${lessonTitle || 'Hồ sơ tiết dạy'}${className ? ` · Lớp ${className}` : ''}`}
      title={title}
      lockBackdrop={loading}
      closeLabel={loading ? 'Hủy và đóng' : 'Đóng'}
      onClose={loading ? onCancel : onClose}
      onEscape={loading ? onCancel : onClose}
      actions={actions}
    >
      {loading ? (
        <div className="cc-run">
          <div className="ag-run-head">
            <span className="ag-run-title">
              <span className="ag-spin" aria-hidden="true" />
              {mode === 'exam' ? 'Đang trộn đề…' : 'Đang soạn trọn bộ hồ sơ…'}
            </span>
            <span className="ag-timer" role="timer" aria-live="off">
              {elapsed} giây
            </span>
          </div>

          {mode === 'lesson' && (
            <ol className="ag-trace" aria-live="polite">
              {PACK_STEP_IDS.map((id) => {
                const st = steps[id];
                return (
                  <li key={id}>
                    <span className={`ag-trace-dot${st === 'done' ? '' : st === 'running' ? ' warn' : ' wait'}`}>
                      {st === 'done' ? (
                        <Icon name="check" size={14} />
                      ) : st === 'running' ? (
                        <span className="ag-spin cc-spin-sm" aria-hidden="true" />
                      ) : null}
                    </span>
                    <span>
                      <b>{labels[id]}</b>{' '}
                      <span className="cc-step-state">
                        {st === 'done' ? 'xong' : st === 'running' ? 'đang soạn' : 'chờ'}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {mode === 'lesson' && (
            <pre ref={previewRef} className="cc-preview" aria-live="off">
              {preview || 'Đang chờ máy chủ phản hồi…'}
            </pre>
          )}
          {mode === 'exam' && (
            <p className="ag-note">Hệ thống đang rút câu hỏi thật và lập ma trận. Thường mất khoảng một phút.</p>
          )}

          <div className="ag-actions">
            <button type="button" className="ag-btn" onClick={onCancel}>
              <Icon name="stop" size={18} />
              Hủy
            </button>
          </div>
        </div>
      ) : pack ? (
        <div className="cc-result">
          {notice && (
            <div className="ag-alert ok no-print" role="status">
              <Icon name="check" size={18} />
              <span>{notice}</span>
            </div>
          )}
          <div className="ag-tabs cc-tabs no-print" role="tablist" aria-label="Các phần của hồ sơ">
            {pack.sections.map((sec) => (
              <button
                key={sec.id}
                type="button"
                role="tab"
                id={`cc-ptab-${sec.id}`}
                aria-selected={tab === sec.id}
                aria-controls="cc-ppanel"
                className="ag-tab"
                onClick={() => onTab(sec.id)}
              >
                {sec.tabTitle}
              </button>
            ))}
          </div>
          {pack.sections
            .filter((s) => s.id === tab)
            .map((sec) => (
              <article key={sec.id} className="cc-doc" id="cc-ppanel" role="tabpanel" aria-labelledby={`cc-ptab-${sec.id}`}>
                <div className="cc-doc-meta">
                  <strong>Trường Việt Anh</strong>
                  <span>
                    Môn {pack.subject} · Lớp {pack.className} · GV {pack.teacherName}
                  </span>
                </div>
                <h3>{sec.docHeading}</h3>
                <div className="cc-doc-text">
                  <MathText text={sec.content} />
                </div>
              </article>
            ))}
        </div>
      ) : (
        <div className="ag-alert bad" role="alert">
          <Icon name="alert" size={18} />
          <span>{notice || 'Không thể tạo bộ hồ sơ. Cô/thầy thử lại giúp em.'}</span>
        </div>
      )}
    </Modal>
  );
}
