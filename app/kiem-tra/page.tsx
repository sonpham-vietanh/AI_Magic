'use client';

import { loadReviewerKey, reviewerErrorText, reviewerHeaders, saveReviewerKey } from '@/components/kho/reviewerKey';
import { readActor, writeActor } from '@/lib/agent/actor';
import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { Icon } from '@/components/ui/icons';
import { LessonField, LessonMultiField } from '@/components/agent/LessonField';
import { AriaTabs, panelProps } from '@/components/kho/AriaTabs';
import { useMe } from '@/components/kho/useMe';
import { formatApiError } from '@/lib/ui/soanBai';
import { QuestionSet, type Section } from '@/components/kiem-tra/QuestionSet';
import { QuizView } from '@/components/kiem-tra/QuizView';
import { ExamExport } from '@/components/kiem-tra/ExamExport';
import { BankTab } from '@/components/kiem-tra/BankTab';
import type { QuizItem } from '@/lib/assessment/examDoc';
import type { ExamItemSnapshot } from '@/lib/assessment/types';
import type { AtomLite } from '@/components/agent/types';
import '@/app/ui-kt.css';

const BLOOMS = ['Nhớ', 'Hiểu', 'Vận dụng', 'Phân tích', 'Đánh giá', 'Sáng tạo'];
const LEVELS: [string, string][] = [
  ['nhan_biet', 'Nhận biết'],
  ['thong_hieu', 'Thông hiểu'],
  ['van_dung', 'Vận dụng'],
  ['van_dung_cao', 'Vận dụng cao'],
];
const STATUS_LABEL: Record<string, string> = {
  nhap: 'Nháp',
  cho_duyet: 'Chờ duyệt',
  da_duyet: 'Đã duyệt',
  tu_choi: 'Bị từ chối',
};
const STATUS_CLASS: Record<string, string> = { nhap: 'none', cho_duyet: 'draft', da_duyet: 'ok', tu_choi: 'bad' };
const STEPS = ['Lập đề nháp', 'Gửi tổ chuyên môn duyệt', 'Đã duyệt'];

interface Cell { target: number; selected: number; points: number }
interface Matrix {
  totalSelected: number;
  totalTarget: number;
  pointsPerQuestion: number;
  shortfall: string[];
  rows: { atomId: string; atomCode: string; title: string; cells: Record<string, Cell>; totalSelected: number; points: number }[];
  totals: Record<string, Cell>;
}
interface Exam {
  examId: string;
  status: string;
  examDate: string | null;
  createdBy?: string;
  matrix: Matrix;
  locked?: boolean;
  lockedReason?: string | null;
  sections?: Section[];
  items?: ExamItemSnapshot[];
  accessLog?: { at: string; actor: string; action: string }[];
  approvals?: { reviewer?: string; decision: string; note: string; at: string }[];
}

/** Lỗi đã việt hoá, an toàn để hiện cho giáo viên (không lộ chi tiết kỹ thuật). */
class UiError extends Error {}
const friendly = (e: unknown, fallback: string) => (e instanceof UiError ? e.message : fallback);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new UiError('Không kết nối được máy chủ. Cô/thầy kiểm tra mạng rồi thử lại nhé.');
  }
  const data = (await res.json().catch(() => null)) as ({ ok?: boolean; error?: string } & Record<string, unknown>) | null;
  if (!res.ok || !data || data.ok === false) {
    const serverMsg = typeof data?.error === 'string' ? data.error : undefined;
    const isReviewerGate = res.status === 503 || (res.status === 403 && /mã người duyệt/i.test(serverMsg ?? ''));
    throw new UiError(isReviewerGate ? reviewerErrorText(res.status, serverMsg) : formatApiError(res.status, serverMsg));
  }
  return data as T;
}
const post = (url: string, body: unknown, actor?: string, reviewerKey?: string) =>
  ({ method: 'POST', headers: { 'content-type': 'application/json', ...(actor ? { 'x-actor': actor } : {}), ...reviewerHeaders(reviewerKey ?? '') }, body: JSON.stringify(body) }) as RequestInit;

function BloomChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="kt-fs">
      <legend className="ag-field-label">Bậc tư duy (chọn nhiều)</legend>
      <div className="ag-chips kt-chips">
        {BLOOMS.map((b) => {
          const on = value.includes(b);
          return (
            <button
              key={b}
              type="button"
              className={`ag-chip kt-toggle${on ? ' kt-toggle-on' : ''}`}
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== b) : [...value, b])}
            >
              {on && <Icon name="check" size={16} />}
              {b}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function LangSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="ag-field-label">Ngôn ngữ</label>
      <select id={id} className="ag-field" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="vi">Tiếng Việt</option>
        <option value="en">Tiếng Anh</option>
        <option value="song_ngu">Song ngữ</option>
      </select>
    </div>
  );
}

function MatrixTable({ m }: { m: Matrix }) {
  const cell = (c?: Cell) => (c && (c.target || c.selected) ? `${c.selected}/${c.target} câu · ${c.points}đ` : '–');
  const short = (c?: Cell) => !!c && c.selected < c.target;
  const cellProps = (c?: Cell) => (short(c) ? { className: 'kt-cell-short' } : {});
  return (
    <div>
      <div className="kt-scroll" tabIndex={0} role="region" aria-label="Ma trận đề, cuộn ngang để xem đủ cột">
        <table className="kt-table">
          <caption className="kt-cap">Ma trận theo Thông tư 22/2021</caption>
          <thead>
            <tr>
              <th scope="col">Bài</th>
              {LEVELS.map(([k, l]) => <th key={k} scope="col">{l}</th>)}
              <th scope="col">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r) => (
              <tr key={r.atomId}>
                <th scope="row">{r.title}<small>{r.atomCode}</small></th>
                {LEVELS.map(([k]) => <td key={k} {...cellProps(r.cells[k])}>{cell(r.cells[k])}{short(r.cells[k]) ? ' (thiếu)' : ''}</td>)}
                <td>{r.totalSelected} câu · {r.points}đ</td>
              </tr>
            ))}
            <tr className="kt-total">
              <th scope="row">Tổng</th>
              {LEVELS.map(([k]) => <td key={k} {...cellProps(m.totals[k])}>{cell(m.totals[k])}{short(m.totals[k]) ? ' (thiếu)' : ''}</td>)}
              <td>{m.totalSelected}/{m.totalTarget} câu · 10đ</td>
            </tr>
          </tbody>
        </table>
      </div>
      {m.shortfall.length > 0 && (
        <div className="ag-alert warn" role="alert">
          <Icon name="alert" size={18} />
          <div>
            <b>Ngân hàng chưa đủ câu. Hệ thống không tự bịa câu hỏi.</b>
            <ul>{m.shortfall.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ status }: { status: string | null }) {
  // vị trí hiện tại: 0 nháp, 1 chờ duyệt, 2 đã duyệt
  const cur = status === 'da_duyet' ? 2 : status === 'cho_duyet' || status === 'tu_choi' ? 1 : 0;
  const rejected = status === 'tu_choi';
  return (
    <ol className="kt-steps" aria-label="Quy trình duyệt đề">
      {STEPS.map((s, i) => {
        const state = i < cur || (i === cur && status === 'da_duyet') ? 'done' : i === cur ? (rejected ? 'bad' : 'cur') : 'todo';
        return (
          <li key={s} className={`kt-step kt-step-${state}`} aria-current={i === cur ? 'step' : undefined}>
            <span className="kt-step-dot">{state === 'done' ? <Icon name="check" size={16} /> : i + 1}</span>
            <span className="kt-step-name">
              {s}
              {i === cur && rejected && <small>Bị từ chối, sửa và gửi lại</small>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function QuizTab() {
  const [lesson, setLesson] = useState<AtomLite | null>(null);
  const [bloom, setBloom] = useState<string[]>(['Nhớ', 'Hiểu']);
  const [language, setLanguage] = useState('vi');
  const [style, setStyle] = useState('');
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [quiz, setQuiz] = useState<{ items: QuizItem[]; notes: string[] } | null>(null);

  const run = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api<{ quiz: { items: QuizItem[]; notes: string[] } }>('/api/assessment/quiz', post('/api/assessment/quiz', { atomId: lesson?.id ?? '', bloomLevels: bloom, language, style, count }));
      setQuiz({ items: r.quiz.items, notes: r.quiz.notes });
    } catch (e) { setErr(friendly(e, 'Chưa sinh được quiz. Cô/thầy thử lại nhé.')); setQuiz(null); } finally { setBusy(false); }
  };

  return (
    <div className="kt-split">
      <form className="ag-card kt-form" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <p className="ag-note kt-lead">Sinh nhanh từ ngân hàng câu hỏi để dùng ngay trong giờ. Không cần duyệt, không lưu lại.</p>
        <LessonField value={lesson} onChange={setLesson} />
        <BloomChips value={bloom} onChange={setBloom} />
        <div className="ag-field-row kt-row">
          <div>
            <label htmlFor="q-count" className="ag-field-label">Số câu (1 đến 10)</label>
            <input id="q-count" type="number" min={1} max={10} className="ag-field" value={count} onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 5)))} />
          </div>
          <LangSelect id="q-lang" value={language} onChange={setLanguage} />
        </div>
        <div>
          <label htmlFor="q-style" className="ag-field-label">Phong cách (tuỳ chọn)</label>
          <input id="q-style" className="ag-field" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Ví dụ: ngắn gọn" />
        </div>
        <button type="submit" className="ag-btn primary kt-go" disabled={busy || !lesson}>
          {busy ? (<><span className="ag-spin" aria-hidden="true" /> Đang sinh…</>) : (<><Icon name="quiz" size={18} /> Sinh quiz</>)}
        </button>
        {!lesson && <p className="ag-note">Chọn một bài để bắt đầu.</p>}
        {err && <div className="ag-alert bad" role="alert"><Icon name="alert" size={18} /><div>{err}</div></div>}
      </form>
      <section className="kt-out" aria-label="Kết quả quiz" aria-live="polite">
        {quiz ? (
          <QuizView items={quiz.items} notes={quiz.notes} title={`Quiz ${lesson?.title ?? ''}`.trim()} />
        ) : (
          <div className="kt-empty">
            <Icon name="quiz" size={28} />
            <p>Câu hỏi sẽ hiện ở đây. Đáp án được gấp lại, bấm “Xem đáp án” khi cần.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function ExamTab() {
  const me = useMe();
  const sessionMode = !me.useKey;
  const [actor, setActor] = useState('');
  const [lessons, setLessons] = useState<AtomLite[]>([]);
  const [bloom, setBloom] = useState<string[]>(['Nhớ', 'Hiểu', 'Vận dụng']);
  const [language, setLanguage] = useState('vi');
  const [examDate, setExamDate] = useState('');
  const [perCell, setPerCell] = useState(2);
  const [reviewers, setReviewers] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [reviewerKey, setReviewerKey] = useState('');
  const [note, setNote] = useState('');
  const [exam, setExam] = useState<Exam | null>(null);
  const [list, setList] = useState<Exam[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(''); setMsg('');
    try { await fn(); } catch (e) { setErr(friendly(e, 'Có lỗi xảy ra. Cô/thầy thử lại nhé.')); } finally { setBusy(false); }
  };

  const load = useCallback(async (examId: string, who: string) => {
    const r = await api<{ exam: Exam }>(`/api/assessment/exam?examId=${encodeURIComponent(examId)}`, { headers: who ? { 'x-actor': who } : {} });
    setExam(r.exam);
  }, []);

  useEffect(() => {
    setReviewerKey(loadReviewerKey());
    const savedActor = readActor();
    if (savedActor) setActor((cur) => cur || savedActor);
  }, []);

  // Đăng nhập thật: tên người soạn và người duyệt lấy từ tài khoản.
  useEffect(() => {
    if (sessionMode && me.user?.name) {
      setActor(me.user.name);
      setReviewer(me.user.name);
    }
  }, [sessionMode, me.user?.name]);

  const fetchList = useCallback(async () => {
    const r = await api<{ exams: Exam[] }>('/api/assessment/exams', { headers: reviewerHeaders(reviewerKey) });
    setList(r.exams);
  }, [reviewerKey]);
  const refreshList = () => guard(fetchList);

  useEffect(() => {
    fetchList().catch(() => { /* danh sách tự tải là phụ; lỗi hiện khi bấm Làm mới */ });
  }, [fetchList]);

  const create = () => guard(async () => {
    const ids = lessons.map((l) => l.id);
    const body = { atomIds: ids, bloomLevels: bloom, language, createdBy: actor.trim(), perCell, ...(examDate ? { examDate } : {}) };
    const r = await api<{ exam: { examId: string } }>('/api/assessment/exam', post('/api/assessment/exam', body));
    await load(r.exam.examId, actor.trim());
    setMsg(`Đã tạo đề ${r.exam.examId} ở trạng thái nháp.`);
    fetchList().catch(() => {});
  });

  const submit = () => guard(async () => {
    if (!exam) return;
    const rv = reviewers.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
    await api('/api/assessment/exam/submit', post('/api/assessment/exam/submit', { examId: exam.examId, actor: actor.trim(), ...(rv.length ? { reviewers: rv } : {}) }, actor.trim()));
    await load(exam.examId, actor.trim());
    setMsg('Đã gửi tổ chuyên môn duyệt.');
    fetchList().catch(() => {});
  });

  const review = (decision: 'duyet' | 'tu_choi') => guard(async () => {
    if (!exam) return;
    if (!sessionMode) saveReviewerKey(reviewerKey.trim());
    await api('/api/assessment/exam/review', post('/api/assessment/exam/review', { examId: exam.examId, reviewer: reviewer.trim(), decision, note }, reviewer.trim(), sessionMode ? '' : reviewerKey));
    await load(exam.examId, reviewer.trim());
    setMsg(decision === 'duyet' ? 'Đã duyệt đề.' : 'Đã từ chối đề.');
    fetchList().catch(() => {});
  });

  return (
    <div className="kt-split">
      <div className="kt-side">
        <form className="ag-card kt-form" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <div className="ag-alert info kt-secure" role="note">
            <Icon name="shield" size={18} />
            <div>
              Đề chỉ người soạn và tổ chuyên môn được xem, mọi lần xem đều được ghi lại.
              Câu đã dùng trong đề được duyệt không bị rút lại trong 3 năm.
              {sessionMode
                ? 'Tên người soạn và người duyệt lấy từ tài khoản trường của cô/thầy nên không thể khai báo thay người khác.'
                : 'Lưu ý trung thực: chế độ đăng nhập thật chưa bật, tên người soạn chỉ là tên khai báo nên chưa chống được người cố tình mạo danh.'}
            </div>
          </div>
          <div className="ag-field-row kt-row">
            <div>
              <label htmlFor="e-actor" className="ag-field-label">Tên người soạn</label>
              <input
                id="e-actor"
                className="ag-field"
                value={actor}
                readOnly={sessionMode}
                onChange={(e) => {
                  setActor(e.target.value);
                  writeActor(e.target.value);
                }}
                placeholder="Ví dụ: Cô Nguyễn Thị Lan"
                autoComplete="name"
              />
            </div>
            <div>
              <label htmlFor="e-date" className="ag-field-label">Ngày thi (tuỳ chọn)</label>
              <input id="e-date" type="date" className="ag-field" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </div>
          </div>
          <LessonMultiField value={lessons} onChange={setLessons} />
          <BloomChips value={bloom} onChange={setBloom} />
          <div className="ag-field-row kt-row">
            <LangSelect id="e-lang" value={language} onChange={setLanguage} />
            <div>
              <label htmlFor="e-per" className="ag-field-label">Số câu mỗi ô ma trận (1 đến 10)</label>
              <input id="e-per" type="number" min={1} max={10} className="ag-field" value={perCell} onChange={(e) => setPerCell(Math.max(1, Math.min(10, Number(e.target.value) || 2)))} />
            </div>
          </div>
          <button type="submit" className="ag-btn primary kt-go" disabled={busy || !actor.trim() || lessons.length === 0}>
            {busy ? (<><span className="ag-spin" aria-hidden="true" /> Đang xử lý…</>) : (<><Icon name="exam" size={18} /> Lập ma trận và sinh đề nháp</>)}
          </button>
          {(!actor.trim() || lessons.length === 0) && <p className="ag-note">Nhập tên và chọn ít nhất một bài.</p>}
        </form>

        <section className="ag-card kt-list" aria-label="Đề đã tạo">
          <div className="kt-list-head">
            <h3>Đề đã tạo</h3>
            <button type="button" className="ag-btn small" onClick={() => void refreshList()} disabled={busy}>
              <Icon name="refresh" size={16} /> Làm mới
            </button>
          </div>
          {list.length === 0 ? (
            <p className="ag-note">Chưa có đề nào.</p>
          ) : (
            <ul className="kt-exams">
              {list.map((e) => (
                <li key={e.examId}>
                  <button type="button" className={`kt-exam${exam?.examId === e.examId ? ' kt-exam-on' : ''}`} onClick={() => void guard(() => load(e.examId, actor.trim()))}>
                    <span className="kt-exam-main">
                      <b>{e.examId}</b>
                      <small>{e.createdBy ?? ''}{e.examDate ? ` · thi ${e.examDate}` : ''}</small>
                    </span>
                    <span className={`ag-status ${STATUS_CLASS[e.status] ?? 'none'}`}>{STATUS_LABEL[e.status] ?? e.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="kt-out" aria-label="Đề đang xem" aria-live="polite">
        <div className="ag-card">
          <Stepper status={exam?.status ?? null} />
        </div>
        {err && <div className="ag-alert bad" role="alert"><Icon name="alert" size={18} /><div>{err}</div></div>}
        {msg && <div className="ag-alert ok" role="status"><Icon name="check" size={18} /><div>{msg}</div></div>}

        {!exam && (
          <div className="kt-empty">
            <Icon name="exam" size={28} />
            <p>Lập đề nháp hoặc chọn một đề trong danh sách để xem ma trận, nội dung và duyệt.</p>
          </div>
        )}

        {exam && (
          <>
            <div className="ag-card kt-exam-head">
              <div>
                <h2>{exam.examId}</h2>
                <p className="ag-note">{exam.createdBy ?? ''}{exam.examDate ? ` · Thi ngày ${exam.examDate}` : ''}</p>
              </div>
              <span className={`ag-status ${STATUS_CLASS[exam.status] ?? 'none'}`}>{STATUS_LABEL[exam.status] ?? exam.status}</span>
            </div>

            <div className="ag-card">
              <MatrixTable m={exam.matrix} />
            </div>

            {(exam.status === 'nhap' || exam.status === 'tu_choi') && (
              <div className="ag-card kt-act">
                <h3>Bước 2. Gửi tổ chuyên môn duyệt</h3>
                <label htmlFor="e-rv" className="ag-field-label">Người được giao duyệt (tuỳ chọn, cách nhau bằng dấu phẩy)</label>
                <input id="e-rv" className="ag-field" value={reviewers} onChange={(e) => setReviewers(e.target.value)} />
                <div><button type="button" className="ag-btn dark" onClick={() => void submit()} disabled={busy || !actor.trim()}>Gửi duyệt</button></div>
              </div>
            )}
            {exam.status === 'cho_duyet' && (
              <div className="ag-card kt-act">
                <h3>Bước 3. Tổ chuyên môn duyệt</h3>
                <p className="ag-note">Người soạn không tự duyệt đề của mình.</p>
                {sessionMode && me.ready && !me.canReview ? (
                  <div className="ag-alert info" role="note">
                    <Icon name="info" size={18} />
                    <div>Chỉ người duyệt hoặc quản trị viên mới duyệt được đề. Cô/thầy nhờ tổ trưởng chuyên môn xem đề này, hoặc báo quản trị viên cấp vai trò người duyệt.</div>
                  </div>
                ) : (
                  <>
                    {sessionMode ? (
                      <div className="kt-whoami" role="note">
                        <Icon name="shield" size={18} />
                        <span>Duyệt với tư cách <b>{me.user?.name}</b></span>
                      </div>
                    ) : (
                      <>
                        <label htmlFor="e-reviewer" className="ag-field-label">Người duyệt</label>
                        <input id="e-reviewer" className="ag-field" value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
                        <label htmlFor="e-key" className="ag-field-label">Mã người duyệt</label>
                        <input id="e-key" type="password" className="ag-field" value={reviewerKey} onChange={(e) => setReviewerKey(e.target.value)} autoComplete="off" />
                      </>
                    )}
                    <label htmlFor="e-note" className="ag-field-label">Ý kiến (bắt buộc khi từ chối)</label>
                    <textarea id="e-note" rows={3} className="ag-field" value={note} onChange={(e) => setNote(e.target.value)} />
                    <div className="ag-actions">
                      <button type="button" className="ag-btn dark" onClick={() => void review('duyet')} disabled={busy || !reviewer.trim() || (!sessionMode && !reviewerKey.trim())}>Duyệt đề</button>
                      <button type="button" className="ag-btn" onClick={() => void review('tu_choi')} disabled={busy || !reviewer.trim() || (!sessionMode && !reviewerKey.trim()) || !note.trim()}>Từ chối</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {exam.approvals && exam.approvals.length > 0 && (
              <div className="ag-card">
                <h3 className="kt-h">Lịch sử duyệt</h3>
                <ul className="kt-tl">
                  {exam.approvals.map((a, i) => (
                    <li key={i}>
                      <b>{a.reviewer}</b> {a.decision === 'duyet' ? 'đã duyệt' : 'đã từ chối'}
                      <small>{a.at}</small>
                      {a.note && <span className="kt-tl-note">{a.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {exam.locked ? (
              <div className="ag-alert warn" role="alert">
                <Icon name="shield" size={18} />
                <div>Nội dung đề đang được khoá. {exam.lockedReason}</div>
              </div>
            ) : exam.sections ? (
              <>
                {exam.items && (
                  <ExamExport
                    key={exam.examId}
                    examId={exam.examId}
                    examDate={exam.examDate}
                    items={exam.items}
                    rows={exam.matrix.rows}
                    shortfall={exam.matrix.shortfall}
                  />
                )}
                <QuestionSet sections={exam.sections} docTitle={`De ${exam.examId}`} showTools={false} />
              </>
            ) : null}

            {exam.accessLog && (
              <details className="ag-card kt-log">
                <summary>Nhật ký truy cập ({exam.accessLog.length})</summary>
                <ul className="kt-tl">
                  {exam.accessLog.map((l, i) => (
                    <li key={i}><b>{l.actor}</b> {l.action}<small>{l.at}</small></li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>
    </div>
  );
}

type KtTab = 'A' | 'B' | 'C';
const KT_TABS = [
  { id: 'A' as const, label: 'Quiz củng cố', sub: 'Không cần duyệt' },
  { id: 'B' as const, label: 'Đề định kỳ', sub: 'Cần tổ chuyên môn duyệt' },
  { id: 'C' as const, label: 'Ngân hàng câu hỏi', sub: 'Xem và lọc câu' },
];

export default function KiemTraPage() {
  const [tab, setTab] = useState<KtTab>('A');
  return (
    <Shell title="Kiểm tra và đề thi" subtitle="Quiz nhanh trong giờ, đề định kỳ có tổ chuyên môn duyệt, và ngân hàng câu hỏi.">
      <div className="kt-page">
        <AriaTabs tabs={KT_TABS} value={tab} onChange={setTab} label="Loại bài kiểm tra" prefix="kt" className="ag-tabs kt-tabs" tabClassName="ag-tab kt-tab" />
        <div {...panelProps('kt', tab)} className="kt-panel">
          {tab === 'A' ? <QuizTab /> : tab === 'B' ? <ExamTab /> : <BankTab />}
        </div>
      </div>
    </Shell>
  );
}
