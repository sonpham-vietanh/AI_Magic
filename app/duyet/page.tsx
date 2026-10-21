'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/Shell';
import { Icon } from '@/components/ui/icons';
import { GRADES, SUBJECTS } from '@/lib/catalog';
import { RUBRIC_6 } from '@/lib/eval/rubric';
import { approveHint, evaluateReview, formatScore, MIN_CRITERION } from '@/lib/ui/review';
import '../ui-du.css';

type KhoStatus = 'approved' | 'chua_duyet' | 'khong_co';
type Filter = 'chua_duyet' | 'approved' | 'khong_co';

interface Review {
  reviewer: string;
  reviewedAt: string;
  scores: Record<string, number>;
  average: number;
  note?: string;
  decision: 'approve' | 'reject';
}

interface QueueItem {
  atomId: string;
  code: string;
  title: string;
  status: KhoStatus;
  hasPackage: boolean;
  assetCount: number;
  review?: Review;
}

interface PackageView {
  id?: string;
  level?: number;
  bloom?: string;
  status?: string;
  fields?: Record<string, string | undefined>;
}

interface Lesson {
  status: KhoStatus;
  atomId: string;
  atomCode?: string;
  title?: string;
  packages: PackageView[];
  assets: unknown[];
  review?: Review;
}

const STATUS_META: Record<KhoStatus, { label: string; cls: string }> = {
  approved: { label: 'Đã duyệt', cls: 'ok' },
  chua_duyet: { label: 'Chưa duyệt', cls: 'draft' },
  khong_co: { label: 'Không có gói', cls: 'none' },
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'chua_duyet', label: 'Chưa duyệt' },
  { id: 'approved', label: 'Đã duyệt' },
  { id: 'khong_co', label: 'Không có gói' },
];

const FIELD_ORDER = ['objective', 'explanation', 'example', 'counterExample', 'commonMistake', 'strategy', 'questions'];
const FIELD_LABELS: Record<string, string> = {
  objective: 'Mục tiêu',
  explanation: 'Giải thích',
  example: 'Ví dụ',
  counterExample: 'Phản ví dụ',
  commonMistake: 'Lỗi thường gặp',
  strategy: 'Chiến lược dạy',
  questions: 'Câu hỏi',
};

const NAME_KEY = 'va-reviewer-name';

function StatusPill({ status }: { status: KhoStatus }) {
  const m = STATUS_META[status];
  return <span className={`ag-status ${m.cls}`}>{m.label}</span>;
}

function whenText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN');
}

export default function DuyetPage() {
  const [subject, setSubject] = useState('toan');
  const [grade, setGrade] = useState('10');
  const [filter, setFilter] = useState<Filter>('chua_duyet');
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [reviewer, setReviewer] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAME_KEY);
      if (saved) setReviewer(saved);
    } catch {
      /* bỏ qua */
    }
  }, []);

  const loadQueue = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      try {
        const qs = new URLSearchParams({ subject, grade, limit: '100' });
        const res = await fetch(`/api/kho/queue?${qs.toString()}`, { signal });
        const data = (await res.json()) as { ok?: boolean; items?: QueueItem[]; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setItems(data.items || []);
        setLoaded(true);
      } catch (e) {
        if (signal?.aborted) return;
        setError(e instanceof Error ? e.message : 'Không tải được hàng chờ duyệt.');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [subject, grade],
  );

  useEffect(() => {
    setLoaded(false);
    setItems([]);
    const c = new AbortController();
    void loadQueue(c.signal);
    return () => c.abort();
  }, [loadQueue]);

  const openItem = async (atomId: string, keepMessage = false) => {
    setSelectedId(atomId);
    setLesson(null);
    if (!keepMessage) setMessage(null);
    setScores({});
    setNote('');
    setLessonLoading(true);
    try {
      const res = await fetch(`/api/kho/standard?atomId=${encodeURIComponent(atomId)}`);
      const data = (await res.json()) as { ok?: boolean; lesson?: Lesson; error?: string };
      if (!res.ok || !data.ok || !data.lesson) throw new Error(data.error || `HTTP ${res.status}`);
      setLesson(data.lesson);
    } catch (e) {
      setMessage({ kind: 'bad', text: e instanceof Error ? e.message : 'Không tải được bản chuẩn.' });
    } finally {
      setLessonLoading(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { chua_duyet: 0, approved: 0, khong_co: 0 };
    for (const it of items) c[it.status] += 1;
    return c;
  }, [items]);
  const visible = items.filter((it) => it.status === filter);

  const ev = useMemo(() => evaluateReview(scores), [scores]);
  const nameOk = reviewer.trim().length > 0;
  const canApprove = ev.canApprove && nameOk && !submitting;
  const canReject = ev.complete && nameOk && note.trim().length > 0 && !submitting;

  const submit = async (decision: 'approve' | 'reject') => {
    if (!selectedId) return;
    setSubmitting(true);
    setMessage(null);
    try {
      try {
        localStorage.setItem(NAME_KEY, reviewer.trim());
      } catch {
        /* bỏ qua */
      }
      const res = await fetch('/api/kho/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ atomId: selectedId, reviewer, scores, decision, note: note.trim() || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; review?: Review; error?: string };
      if (!res.ok || !data.ok) {
        setMessage({ kind: 'bad', text: data.error || `Lỗi HTTP ${res.status}` });
        return;
      }
      const text =
        decision === 'approve' ? 'Đã duyệt. Bài này đã vào Kho học liệu chuẩn.' : 'Đã ghi nhận từ chối. Bài chưa vào Kho.';
      await Promise.all([loadQueue(), openItem(selectedId, true)]);
      setMessage({ kind: 'ok', text });
    } catch (e) {
      setMessage({ kind: 'bad', text: e instanceof Error ? e.message : 'Không gửi được kết quả duyệt.' });
    } finally {
      setSubmitting(false);
    }
  };

  const showSkeleton = loading && !loaded;

  return (
    <Shell title="Duyệt bản chuẩn" subtitle="Không qua cổng thì không vào Kho.">
      <div className="ag-alert info du-rule" role="note">
        <Icon name="shield" size={20} />
        <div>
          <strong>Quy tắc duyệt.</strong> Chấm 6 tiêu chí, điểm nguyên từ 1 đến 5. Chỉ duyệt khi trung bình từ 4,0 trở lên
          và không tiêu chí nào dưới {MIN_CRITERION}.
        </div>
      </div>

      <div className={`du-layout${selectedId ? ' has-sel' : ''}`}>
        <section className="du-panel du-queue" aria-label="Hàng chờ duyệt">
          <div className="du-queue-head">
            <div className="du-filters">
              <div>
                <label className="ag-field-label" htmlFor="du-subject">
                  Môn
                </label>
                <select id="du-subject" className="ag-field" value={subject} onChange={(e) => setSubject(e.target.value)}>
                  {SUBJECTS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.shortName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="ag-field-label" htmlFor="du-grade">
                  Khối
                </label>
                <select id="du-grade" className="ag-field" value={grade} onChange={(e) => setGrade(e.target.value)}>
                  {GRADES.map((g) => (
                    <option key={g.grade} value={g.grade}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="du-chips" role="group" aria-label="Lọc theo trạng thái">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="du-chip"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  {loaded && <b>{counts[f.id]}</b>}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="ag-alert bad" role="alert" style={{ margin: 10 }}>
              <Icon name="alert" size={18} />
              <div>
                {error}{' '}
                <button type="button" className="ag-link" onClick={() => void loadQueue()}>
                  Thử lại
                </button>
              </div>
            </div>
          )}

          {showSkeleton ? (
            <div aria-busy="true" aria-label="Đang tải hàng chờ">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="du-skel" />
              ))}
            </div>
          ) : (
            <ul className="du-list">
              {visible.map((it) => (
                <li key={it.atomId}>
                  <button
                    type="button"
                    className="du-item"
                    aria-current={selectedId === it.atomId}
                    onClick={() => void openItem(it.atomId)}
                  >
                    <span>
                      <span className="du-item-title">{it.title}</span>
                      <span className="du-item-code">{it.code}</span>
                    </span>
                    {filter === 'chua_duyet' && it.review?.decision === 'reject' ? (
                      <span className="ag-status bad">Đã từ chối</span>
                    ) : null}
                  </button>
                </li>
              ))}
              {loaded && !error && visible.length === 0 && (
                <li className="du-empty">
                  <strong>
                    {filter === 'chua_duyet' ? 'Không còn bài chờ duyệt' : filter === 'approved' ? 'Chưa có bài đã duyệt' : 'Mọi bài đều có gói'}
                  </strong>
                  Thử đổi môn hoặc khối khác.
                </li>
              )}
            </ul>
          )}
        </section>

        <div className="du-sheet-wrap">
          <section className="du-panel du-sheet" aria-label="Phiếu duyệt" aria-live="polite">
            <button
              type="button"
              className="ag-btn small ghost du-back"
              onClick={() => {
                setSelectedId(null);
                setLesson(null);
                setMessage(null);
              }}
            >
              <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
                <Icon name="chevron" size={16} />
              </span>
              Về danh sách
            </button>

            {!selectedId && (
              <div className="du-empty">
                <strong>Chọn một bài ở bên trái</strong>
                Cô/thầy sẽ xem nội dung gói kiến thức và chấm điểm tại đây.
              </div>
            )}

            {lessonLoading && (
              <div aria-busy="true" aria-label="Đang tải bản chuẩn">
                <div className="du-skel" style={{ margin: '0 0 10px', height: 40 }} />
                <div className="du-skel" style={{ margin: '0 0 10px' }} />
                <div className="du-skel" style={{ margin: 0 }} />
              </div>
            )}

            {lesson && (
              <>
                <div className="du-sheet-head">
                  <div>
                    <h2>{lesson.title || lesson.atomCode}</h2>
                    {lesson.atomCode && <p>{lesson.atomCode}</p>}
                  </div>
                  <StatusPill status={lesson.status} />
                </div>

                {lesson.review && (
                  <div className="du-history">
                    <strong>Lần duyệt gần nhất: {lesson.review.decision === 'approve' ? 'Duyệt' : 'Từ chối'}</strong>
                    <div>
                      {lesson.review.reviewer}, trung bình {formatScore(lesson.review.average)}
                      {whenText(lesson.review.reviewedAt) ? `, ${whenText(lesson.review.reviewedAt)}` : ''}
                    </div>
                    {lesson.review.note && <ul><li>{lesson.review.note}</li></ul>}
                  </div>
                )}

                {lesson.packages.length === 0 ? (
                  <div className="ag-alert warn">
                    <Icon name="alert" size={18} />
                    <div>Bài này chưa có gói kiến thức nên chưa thể duyệt vào Kho.</div>
                  </div>
                ) : (
                  <>
                    <h3 className="du-h3">Nội dung cần duyệt</h3>
                    {lesson.packages.map((p, i) => {
                      const entries = Object.entries(p.fields || {})
                        .filter(([, v]) => !!v)
                        .sort(([a], [b]) => {
                          const ia = FIELD_ORDER.indexOf(a);
                          const ib = FIELD_ORDER.indexOf(b);
                          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
                        });
                      return (
                        <div key={p.id || i} className="du-pkg">
                          {lesson.packages.length > 1 && (
                            <div className="du-pkg-title">Gói {i + 1}{p.level ? `, cấp ${p.level}` : ''}</div>
                          )}
                          {entries.map(([k, v], j) => (
                            <details key={k} className="du-fold" open={i === 0 && j < 2}>
                              <summary>
                                {FIELD_LABELS[k] || k}
                                <Icon name="chevronDown" size={18} />
                              </summary>
                              <div className="du-fold-body">{v}</div>
                            </details>
                          ))}
                          {entries.length === 0 && <p className="ag-note">Gói này chưa có nội dung hiển thị.</p>}
                        </div>
                      );
                    })}

                    <form aria-label="Phiếu chấm 6 tiêu chí" onSubmit={(e) => e.preventDefault()}>
                      <h3 className="du-h3">Chấm 6 tiêu chí</h3>
                      {RUBRIC_6.map((c) => {
                        const v = scores[c.id];
                        return (
                          <fieldset key={c.id} className="du-crit">
                            <legend>{c.name}</legend>
                            <p className="du-crit-desc">{c.description}</p>
                            <div className="du-scale" role="radiogroup" aria-label={`Điểm: ${c.name}`}>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <label key={n} className={v === n ? `on${n < MIN_CRITERION ? ' lowv' : ''}` : ''}>
                                  <input
                                    type="radio"
                                    name={`sc-${c.id}`}
                                    value={n}
                                    checked={v === n}
                                    onChange={() => setScores((s) => ({ ...s, [c.id]: n }))}
                                    aria-label={`${n} điểm`}
                                  />
                                  {n}
                                </label>
                              ))}
                            </div>
                            <div className="du-scale-hint" aria-hidden="true">
                              <span>Yếu</span>
                              <span>Tốt</span>
                            </div>
                          </fieldset>
                        );
                      })}

                      <div className="du-ident">
                        <div>
                          <label className="ag-field-label" htmlFor="du-reviewer">
                            Tên người duyệt
                          </label>
                          <input
                            id="du-reviewer"
                            className="ag-field"
                            value={reviewer}
                            onChange={(e) => setReviewer(e.target.value)}
                            maxLength={200}
                            autoComplete="name"
                          />
                        </div>
                        <div>
                          <label className="ag-field-label" htmlFor="du-note">
                            Ghi chú (bắt buộc nếu từ chối)
                          </label>
                          <textarea
                            id="du-note"
                            className="ag-field"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={2}
                            maxLength={5000}
                          />
                        </div>
                      </div>

                      <div className="du-summary">
                        <div className="du-avg">
                          <span className={`du-avg-num${ev.canApprove ? ' good' : ev.complete ? ' bad' : ''}`}>
                            {formatScore(ev.average)}
                          </span>
                          <span className="du-avg-label">
                            điểm trung bình, đã chấm {ev.filledCount}/{ev.total} tiêu chí
                          </span>
                        </div>
                        <div className={`ag-alert ${ev.canApprove ? 'ok' : 'warn'}`} aria-live="polite">
                          <Icon name={ev.canApprove ? 'check' : 'info'} size={18} />
                          <div>
                            {approveHint(ev)}
                            {ev.canApprove && !nameOk ? ' Cô/thầy nhập tên người duyệt để tiếp tục.' : ''}
                          </div>
                        </div>
                        <div className="ag-actions" style={{ marginTop: 12 }}>
                          <button type="button" className="ag-btn primary" disabled={!canApprove} onClick={() => void submit('approve')}>
                            {submitting ? <span className="ag-spin" aria-hidden="true" /> : <Icon name="check" size={18} />}
                            Duyệt vào Kho
                          </button>
                          <button type="button" className="ag-btn" disabled={!canReject} onClick={() => void submit('reject')}>
                            Từ chối
                          </button>
                        </div>
                      </div>
                    </form>
                  </>
                )}
              </>
            )}

            {message && (
              <div className={`ag-alert ${message.kind}`} role={message.kind === 'bad' ? 'alert' : 'status'}>
                <Icon name={message.kind === 'ok' ? 'check' : 'alert'} size={18} />
                <div>{message.text}</div>
              </div>
            )}
          </section>
        </div>
      </div>
    </Shell>
  );
}
