'use client';

import { rovingRef, rovingKeyDown } from '@/components/resources/roving';
import { useEffect, useState } from 'react';
import { MathText } from '@/components/MathText';
import { Icon } from '@/components/ui/icons';
import type {
  SupabaseQuestion,
  SupabaseSocratic,
  SupabaseTainguyenFull,
  SupabaseTainguyenMeta,
} from '@/lib/supabase';
import { Modal } from './Modal';
import { readApiJson } from './shared';

type LiveTab = 'quiz' | 'socratic' | 'simulation';

/** Bảng tương tác để chiếu lên TV lớp học: câu hỏi, gợi mở từng bậc, mô phỏng. */
export function LiveBoard({
  lessonTitle,
  className,
  questions,
  socratic,
  sims,
  onClose,
}: {
  lessonTitle: string;
  className: string;
  questions: SupabaseQuestion[];
  socratic: SupabaseSocratic[];
  sims: SupabaseTainguyenMeta[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<LiveTab>('quiz');
  const [qIdx, setQIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sIdx, setSIdx] = useState(0);
  const [step, setStep] = useState(1);
  const [activeSim, setActiveSim] = useState<SupabaseTainguyenFull | null>(null);
  const [simError, setSimError] = useState('');

  const loadSim = (id: string) => {
    setSimError('');
    fetch(`/api/supabase/knowledge?mode=tainguyen&tainguyenId=${encodeURIComponent(id)}`)
      .then((r) => readApiJson<{ ok?: boolean; item?: SupabaseTainguyenFull | null }>(r))
      .then((data) => {
        if (data.ok && data.item) setActiveSim(data.item);
        else setSimError('Không tìm thấy mô phỏng này.');
      })
      .catch((err: unknown) =>
        setSimError(err instanceof Error ? err.message : 'Không tải được mô phỏng.'),
      );
  };

  // Mở bảng là nạp sẵn mô phỏng đầu tiên (nếu có).
  useEffect(() => {
    if (sims[0]) loadSim(sims[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = questions[qIdx];
  const script = socratic[sIdx];
  const tabs: { id: LiveTab; label: string }[] = [
    { id: 'quiz', label: `Câu hỏi (${questions.length})` },
    { id: 'socratic', label: `Gợi mở từng bậc (${socratic.length})` },
    { id: 'simulation', label: 'Mô phỏng' },
  ];

  return (
    <Modal
      size="xl"
      eyebrow={`Bảng tương tác${className ? ` · Lớp ${className}` : ''}`}
      title={lessonTitle || 'Bài học tương tác'}
      onClose={onClose}
    >
      <div className="ag-tabs cc-tabs cc-tabs-flush" role="tablist" ref={rovingRef} onKeyDown={rovingKeyDown} aria-label="Chế độ chiếu">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`cc-ltab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="cc-lpanel"
            className="ag-tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="cc-lpanel" role="tabpanel" aria-labelledby={`cc-ltab-${tab}`} className="cc-live">
        {tab === 'quiz' &&
          (q ? (
            <div className="cc-live-card">
              <div className="cc-live-meta">
                <span className="ag-status none">
                  Câu {qIdx + 1} / {questions.length}
                </span>
                <span className="ag-status draft">
                  {q.do_kho} · DOK {q.dok}
                </span>
              </div>
              <div className="cc-live-question">
                <MathText text={q.noi_dung} />
              </div>

              {Array.isArray(q.nhieu) && q.nhieu.length > 0 && (
                <div>
                  <p className="ag-field-label">Phương án học sinh hay nhầm</p>
                  <ul className="cc-traps">
                    {q.nhieu.map((n, i) => (
                      <li key={i}>
                        <MathText text={n.noiDung} />
                        {revealed && (
                          <span className="cc-trap-why">
                            Vì sao sai: <MathText text={n.lyDo} />
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {revealed && (
                <div className="ag-alert ok cc-answer" role="status">
                  <div>
                    <strong>
                      Đáp án: <MathText text={q.dap_an} />
                    </strong>
                    <div className="cc-answer-sol">
                      <b>Hướng dẫn giải:</b> <MathText text={q.loi_giai} />
                    </div>
                  </div>
                </div>
              )}

              <div className="cc-live-nav">
                <button
                  type="button"
                  className="ag-btn"
                  disabled={qIdx === 0}
                  onClick={() => {
                    setQIdx((i) => Math.max(0, i - 1));
                    setRevealed(false);
                  }}
                >
                  Câu trước
                </button>
                <button
                  type="button"
                  className="ag-btn primary"
                  aria-pressed={revealed}
                  onClick={() => setRevealed((v) => !v)}
                >
                  {revealed ? 'Ẩn đáp án' : 'Xem đáp án'}
                </button>
                <button
                  type="button"
                  className="ag-btn"
                  disabled={qIdx >= questions.length - 1}
                  onClick={() => {
                    setQIdx((i) => Math.min(questions.length - 1, i + 1));
                    setRevealed(false);
                  }}
                >
                  Câu tiếp
                </button>
              </div>
            </div>
          ) : (
            <p className="cc-empty-line">Bài này chưa có câu hỏi.</p>
          ))}

        {tab === 'socratic' &&
          (script ? (
            <div className="cc-live-card">
              {socratic.length > 1 && (
                <div className="cc-filters" role="group" aria-label="Chọn kịch bản">
                  {socratic.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`ag-chip cc-chip${i === sIdx ? ' active' : ''}`}
                      aria-pressed={i === sIdx}
                      onClick={() => {
                        setSIdx(i);
                        setStep(1);
                      }}
                    >
                      Kịch bản {i + 1}
                    </button>
                  ))}
                </div>
              )}
              <div>
                <span className="cc-eyebrow">Khi học sinh trả lời sai</span>
                <h3 className="cc-live-wrong">&ldquo;{script.wrong_answer}&rdquo;</h3>
                <p className="cc-meta">Nguyên nhân gốc: {script.misconception}</p>
              </div>
              <ol className="cc-steps">
                {[
                  { n: 1, title: 'Bậc 1 · Khơi gợi', text: script.bac_1 },
                  { n: 2, title: 'Bậc 2 · Định hướng', text: script.bac_2 },
                  { n: 3, title: 'Bậc 3 · Phản biện', text: script.bac_3 },
                  { n: 4, title: 'Bậc 4 · Chốt kiến thức', text: script.bac_4 },
                ].map((s) => {
                  const visible = s.n <= step;
                  return (
                    <li key={s.n} className={visible ? 'shown' : 'hidden'}>
                      <strong>{s.title}</strong>
                      <span>{visible ? s.text : 'Bấm “Mở gợi ý tiếp” để hiện cho học sinh.'}</span>
                    </li>
                  );
                })}
              </ol>
              <div className="cc-live-nav">
                <button type="button" className="ag-btn" onClick={() => setStep(1)}>
                  <Icon name="refresh" size={18} />
                  Đặt lại
                </button>
                <button
                  type="button"
                  className="ag-btn primary"
                  disabled={step >= 4}
                  onClick={() => setStep((s) => Math.min(4, s + 1))}
                >
                  Mở gợi ý tiếp ({step}/4)
                </button>
              </div>
            </div>
          ) : (
            <p className="cc-empty-line">Bài này chưa có kịch bản gợi mở.</p>
          ))}

        {tab === 'simulation' && (
          <div className="cc-live-card">
            {sims.length > 0 ? (
              <div className="cc-filters" role="group" aria-label="Chọn mô phỏng">
                {sims.map((sim) => (
                  <button
                    key={sim.id}
                    type="button"
                    className={`ag-chip cc-chip${activeSim?.id === sim.id ? ' active' : ''}`}
                    aria-pressed={activeSim?.id === sim.id}
                    onClick={() => loadSim(sim.id)}
                  >
                    {sim.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="cc-empty-line">Chưa có mô phỏng cho bài này.</p>
            )}
            {simError && (
              <div className="ag-alert bad" role="alert">
                <Icon name="alert" size={18} />
                <span>{simError}</span>
              </div>
            )}
            {activeSim ? (
              <iframe
                title={activeSim.name}
                srcDoc={activeSim.content}
                className="cc-sim"
                sandbox="allow-scripts"
              />
            ) : (
              sims.length > 0 &&
              !simError && <p className="cc-empty-line">Đang tải mô phỏng…</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
