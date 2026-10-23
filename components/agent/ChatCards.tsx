'use client';

// Các thẻ của ô chat hợp nhất: "Mình hiểu / Chưa rõ", chọn soạn hay hỏi, câu trả lời hỏi đáp, chỉnh bằng lời,
// gợi ý bài ở khối khác, chọn lớp khác, khôi phục lần soạn dở. Tiền tố lớp CSS: ag-ask-.
import { Fragment } from 'react';
import { Icon } from '@/components/ui/icons';
import { MathText } from '@/components/MathText';
import { lessonPlace, type FoundLesson } from '@/lib/agent/lessonSearch';
import { formatLabel, type AgentSlots } from '@/lib/agent/flow';
import type { PendingRun } from '@/lib/agent/memory';
import type { UnderstoodChip } from '@/lib/agent/nlu';
import type { ClassProfile } from '@/lib/types';
import { GRADE_OPTIONS, SUBJECT_OPTIONS, type AnswerState, type RefineState, type ResultEntry } from './types';

/* ---------------- Mình hiểu / Chưa rõ ---------------- */

interface UnderstoodProps {
  chips: UnderstoodChip[];
  unclear: string[];
  slots: AgentSlots;
  /** Có thể sửa không (chỉ thẻ mới nhất mới cho sửa). */
  active: boolean;
  onEditStep: (step: NonNullable<UnderstoodChip['step']>) => void;
  onChange: (patch: Partial<AgentSlots>) => void;
}

export function UnderstoodCard({ chips, unclear, slots, active, onEditStep, onChange }: UnderstoodProps) {
  return (
    <div className="ag-ask-card" role="group" aria-label="Mình hiểu yêu cầu như sau">
      <p className="ag-ask-h">Mình hiểu:</p>
      {chips.length === 0 ? (
        <p className="ag-ask-none">Mình chưa nhận ra thông tin nào trong câu vừa rồi.</p>
      ) : (
        <ul className="ag-ask-chips">
          {chips.map((c) => (
            <li key={c.key} className="ag-ask-chip">
              <span className="ag-ask-chip-k">{c.label}</span>
              {active && c.key === 'subject' ? (
                <select
                  className="ag-ask-sel"
                  aria-label="Đổi môn"
                  value={slots.subject}
                  onChange={(e) => onChange({ subject: e.target.value, baiDayId: undefined, baiTitle: undefined })}
                >
                  {SUBJECT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : active && c.key === 'grade' ? (
                <select
                  className="ag-ask-sel"
                  aria-label="Đổi khối"
                  value={slots.grade}
                  onChange={(e) => onChange({ grade: e.target.value, baiDayId: undefined, baiTitle: undefined })}
                >
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      Lớp {g}
                    </option>
                  ))}
                </select>
              ) : active && c.key === 'soTiet' ? (
                <select
                  className="ag-ask-sel"
                  aria-label="Đổi số tiết"
                  value={slots.soTiet ?? 1}
                  onChange={(e) => onChange({ soTiet: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} tiết
                    </option>
                  ))}
                </select>
              ) : (
                <span className="ag-ask-chip-v">{c.value}</span>
              )}
              {active && c.step && (
                <button type="button" className="ag-ask-fix" onClick={() => onEditStep(c.step!)} aria-label={`Sửa ${c.label}`}>
                  Sửa
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {unclear.length > 0 && (
        <p className="ag-ask-unclear">
          <strong>Chưa rõ:</strong> {unclear.join(', ')}. Mình hỏi từng mục ngay bên dưới.
        </p>
      )}
    </div>
  );
}

/* ---------------- Soạn hay hỏi? ---------------- */

export function ModeCard({
  note,
  canRefine,
  active,
  onCompose,
  onAsk,
  onRefine,
}: {
  note?: string;
  canRefine: boolean;
  active: boolean;
  onCompose: () => void;
  onAsk: () => void;
  onRefine: () => void;
}) {
  return (
    <div className="ag-ask-card" role="group" aria-label="Chọn cách mình giúp">
      <p className="ag-ask-h">{note ?? 'Cô/thầy muốn mình làm gì với câu này?'}</p>
      {active && (
        <div className="ag-ask-btns">
          <button type="button" className="ag-btn primary" onClick={onCompose}>
            <Icon name="sparkles" size={18} />
            Soạn bài này
          </button>
          <button type="button" className="ag-btn" onClick={onAsk}>
            <Icon name="quiz" size={18} />
            Chỉ hỏi đáp
          </button>
          {canRefine && (
            <button type="button" className="ag-btn" onClick={onRefine}>
              <Icon name="edit" size={18} />
              Chỉnh bản đang mở
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Hỏi đáp ---------------- */

export function AnswerCard({
  state,
  active,
  onRetry,
  onSuggest,
}: {
  state: AnswerState;
  active: boolean;
  onRetry: () => void;
  onSuggest: (q: string) => void;
}) {
  if (state.status === 'loading') {
    return (
      <div className="ag-ask-loading" role="status">
        <span className="ag-spin" aria-hidden="true" />
        Đang trả lời câu hỏi của cô/thầy…
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="ag-alert bad" role="alert">
        <Icon name="alert" size={18} />
        <div>
          <div>{state.error}</div>
          <button type="button" className="ag-btn small ag-ask-retry" onClick={onRetry}>
            <Icon name="refresh" size={16} />
            Thử lại
          </button>
        </div>
      </div>
    );
  }
  const paras = (state.text ?? '').split(/\n{2,}/).filter((p) => p.trim());
  return (
    <>
      <div className="ag-ask-answer">
        {paras.map((p, i) => (
          <p key={i} className="ag-text">
            {p.split('\n').map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <MathText text={line} />
              </Fragment>
            ))}
          </p>
        ))}
      </div>
      {active && state.suggestions && state.suggestions.length > 0 && (
        <div className="ag-chips" role="group" aria-label="Câu hỏi gợi ý tiếp theo">
          {state.suggestions.map((s) => (
            <button key={s} type="button" className="ag-chip" onClick={() => onSuggest(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------- Chỉnh bằng lời ---------------- */

export function RefineCard({
  state,
  entry,
  canUndo,
  onUndo,
  onRetry,
  onOpen,
}: {
  state: RefineState;
  entry?: ResultEntry;
  canUndo: boolean;
  onUndo: () => void;
  onRetry: () => void;
  onOpen: () => void;
}) {
  if (state.status === 'working') {
    return (
      <div className="ag-ask-loading" role="status">
        <span className="ag-spin" aria-hidden="true" />
        Đang chỉnh “{state.instruction}” trên bản soạn…
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="ag-alert bad" role="alert">
        <Icon name="alert" size={18} />
        <div>
          <div>{state.error}</div>
          <p className="ag-ask-keep">Bản soạn hiện tại của cô/thầy vẫn giữ nguyên, chưa bị thay đổi.</p>
          <button type="button" className="ag-btn small ag-ask-retry" onClick={onRetry}>
            <Icon name="refresh" size={16} />
            Thử lại
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="ag-ask-card" role="status">
      <p className="ag-ask-h">
        <Icon name="check" size={16} /> Đã chỉnh theo yêu cầu “{state.instruction}”. Cô/thầy xem ở khung bên phải.
      </p>
      <div className="ag-ask-btns">
        <button type="button" className="ag-btn small" onClick={onOpen}>
          <Icon name="panel" size={16} />
          Xem bản đã chỉnh
        </button>
        {canUndo && (
          <button type="button" className="ag-btn small" onClick={onUndo} disabled={!entry}>
            <Icon name="refresh" size={16} />
            Hoàn tác
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- Bài ở khối hoặc môn khác ---------------- */

export function CrossCard({
  lessons,
  query,
  active,
  onPick,
  onOther,
}: {
  lessons: FoundLesson[];
  query: string;
  active: boolean;
  onPick: (l: FoundLesson) => void;
  onOther: () => void;
}) {
  const one = lessons.length === 1 ? lessons[0] : null;
  return (
    <div className="ag-ask-card" role="group" aria-label="Bài tìm thấy ở khối hoặc môn khác">
      <p className="ag-ask-h">
        {one
          ? `Mình thấy “${one.title}” ở ${lessonPlace(one)}. Chọn lớp ${one.grade}?`
          : `Mình thấy bài “${query}” ở nhiều nơi khác với khối đang chọn. Cô/thầy chọn giúp mình:`}
      </p>
      {active && (
        <div className="ag-ask-list">
          {lessons.map((l) => (
            <button key={l.id} type="button" className="ag-ask-lesson" onClick={() => onPick(l)}>
              <span>
                <span className="ag-lesson-title">{l.title}</span>
                <span className="ag-lesson-code">
                  {lessonPlace(l)}
                  {l.chapter ? ` · ${l.chapter}` : ''}
                </span>
              </span>
              <span className="ag-ask-pick">{one ? `Chọn lớp ${one.grade}` : `Chọn`}</span>
            </button>
          ))}
          <button type="button" className="ag-btn small" onClick={onOther}>
            Không phải, tìm bài khác
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Soạn lại cho lớp khác ---------------- */

export function ClassPickCard({
  classes,
  active,
  onPick,
}: {
  classes: ClassProfile[];
  active: boolean;
  onPick: (c: ClassProfile) => void;
}) {
  return (
    <div className="ag-ask-card" role="group" aria-label="Chọn lớp khác">
      <p className="ag-ask-h">Cô/thầy muốn soạn lại cho lớp nào?</p>
      {classes.length === 0 ? (
        <p className="ag-ask-none">Chưa có hồ sơ lớp nào khác cùng khối để chọn.</p>
      ) : (
        active && (
          <div className="ag-ask-btns">
            {classes.map((c) => (
              <button key={c.id} type="button" className="ag-btn" onClick={() => onPick(c)}>
                Lớp {c.className}
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}

/* ---------------- Lần soạn trước bị ngắt ---------------- */

export function ResumeCard({
  pending,
  active,
  onResume,
  onDismiss,
}: {
  pending: PendingRun;
  active: boolean;
  onResume: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="ag-ask-card" role="group" aria-label="Lần soạn trước bị ngắt">
      <p className="ag-ask-h">
        Lần soạn trước ({formatLabel(pending.slots.format).toLowerCase() || 'bản soạn'}
        {pending.slots.baiTitle ? ` “${pending.slots.baiTitle}”` : ''}) bị ngắt giữa chừng, có thể do tải lại trang hoặc mất mạng. Các lựa chọn của cô/thầy vẫn còn.
      </p>
      {active && (
        <div className="ag-ask-btns">
          <button type="button" className="ag-btn primary" onClick={onResume}>
            <Icon name="refresh" size={18} />
            Soạn lại ngay
          </button>
          <button type="button" className="ag-btn" onClick={onDismiss}>
            Để sau
          </button>
        </div>
      )}
    </div>
  );
}
