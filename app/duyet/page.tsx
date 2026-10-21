'use client';

import { loadReviewerKey, reviewerErrorText, reviewerHeaders, saveReviewerKey } from '@/components/kho/reviewerKey';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { Icon } from '@/components/ui/icons';
import { GRADES, SUBJECTS } from '@/lib/catalog';
import { RUBRIC_6 } from '@/lib/eval/rubric';
import { approveHint, evaluateReview, formatScore, MIN_CRITERION } from '@/lib/ui/review';
import { PhaAStepper, type PhaAStep } from '@/components/kho/PhaAStepper';
import { ResourceGenerator } from '@/components/kho/ResourceGenerator';
import {
  FIELD_LABELS,
  FIELD_ORDER,
  whenText,
  type AssetView,
  type KhoReviewView as Review,
  type KhoStatus,
  type LessonView as Lesson,
} from '@/components/kho/types';
import '../ui-du.css';
import '../ui-kho.css';

type Filter = 'chua_duyet' | 'approved' | 'khong_co';

interface QueueItem {
  atomId: string;
  code: string;
  title: string;
  chapter?: string;
  lesson?: string;
  status: KhoStatus;
  hasPackage: boolean;
  assetCount: number;
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

const NAME_KEY = 'va-reviewer-name';

function StatusPill({ status }: { status: KhoStatus }) {
  const m = STATUS_META[status];
  return <span className={`ag-status ${m.cls}`}>{m.label}</span>;
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
  const [reviewerKey, setReviewerKey] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [message, setMessage] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAME_KEY);
      if (saved) setReviewer(saved);
    } catch {
      /* bỏ qua */
    }
    setReviewerKey(loadReviewerKey());
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
    setAssets([]);
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

  const steps = useMemo<PhaAStep[]>(() => {
    if (!lesson) return [];
    const sel = items.find((i) => i.atomId === lesson.atomId);
    const chapter = lesson.atom?.chapter || sel?.chapter || '';
    const sub = lesson.atom?.lesson || sel?.lesson || '';
    const siblings = items.filter((i) => i.chapter === chapter && i.lesson === sub && i.atomId !== lesson.atomId).length;
    const hasReq = !!lesson.atom?.yeu_cau;
    const nAssets = assets.length;
    const draftN = assets.filter((a) => a.status === 'draft').length;
    const rv = lesson.review;
    const s4: PhaAStep['state'] = rv?.decision === 'reject' ? 'bad' : rv?.decision === 'approve' && draftN === 0 ? 'done' : rv?.decision === 'approve' ? 'doing' : 'todo';
    return [
      { n: 1, title: 'Phân rã tri thức', state: hasReq ? 'done' : 'todo', detail: hasReq ? `Có yêu cầu cần đạt, ${lesson.edges.length} liên kết` : 'Thiếu yêu cầu cần đạt', target: 'kh-sec-1' },
      { n: 2, title: 'Sinh 6 dạng', state: nAssets >= 6 ? 'done' : nAssets > 0 ? 'doing' : 'todo', detail: `${nAssets}/6 dạng${draftN ? `, ${draftN} nháp` : ''}`, target: 'kh-sec-2' },
      { n: 3, title: 'Ghép theo chương', state: chapter ? 'done' : 'todo', detail: chapter ? `${siblings + 1} nguyên tử cùng mục` : 'Chưa rõ chương/bài', target: 'kh-sec-3' },
      { n: 4, title: 'Người duyệt', state: s4, detail: rv ? (rv.decision === 'approve' ? (draftN ? 'Có nháp mới, cần duyệt lại' : 'Đã duyệt') : 'Đã từ chối') : 'Chưa duyệt', target: 'kh-sec-4' },
      { n: 5, title: 'Nhập kho', state: lesson.version ? (draftN ? 'doing' : 'done') : 'todo', detail: lesson.version ? `Bản chuẩn v${lesson.version}` : 'Chưa có phiên bản', target: 'kh-sec-5' },
      { n: 6, title: 'Ngân hàng câu hỏi', state: lesson.questions.length > 0 ? 'done' : 'todo', detail: `${lesson.questions.length} câu hỏi`, target: 'kh-sec-6' },
    ];
  }, [lesson, assets, items]);

  const ev = useMemo(() => evaluateReview(scores), [scores]);
  const nameOk = reviewer.trim().length > 0 && reviewerKey.trim().length > 0;
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
      saveReviewerKey(reviewerKey.trim());
      const res = await fetch('/api/kho/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...reviewerHeaders(reviewerKey) },
        body: JSON.stringify({ atomId: selectedId, reviewer, scores, decision, note: note.trim() || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; review?: Review & { version?: number }; error?: string };
      if (!res.ok || !data.ok) {
        setMessage({ kind: 'bad', text: reviewerErrorText(res.status, data.error) });
        return;
      }
      const text =
        decision === 'approve'
          ? `Đã duyệt. Bộ tài nguyên đã đóng băng thành bản chuẩn${data.review?.version ? ` v${data.review.version}` : ''} trong Kho.` : 'Đã ghi nhận từ chối. Bài chưa vào Kho.';
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
    <Shell title="Dựng kho (Pha A)" subtitle="Phân rã, sinh 6 dạng tài nguyên, ghép, người duyệt, nhập kho, ngân hàng câu hỏi.">
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

                <PhaAStepper steps={steps} />

                <div className="kh-card" id="kh-sec-1">
                  <h3 className="du-h3" style={{ margin: 0 }}>Bước 1. Phân rã tri thức</h3>
                  <p className="ag-note" style={{ margin: '6px 0 0' }}>
                    {lesson.atom?.yeu_cau
                      ? `Yêu cầu cần đạt: ${lesson.atom.yeu_cau}`
                      : 'Bài này chưa có yêu cầu cần đạt trong đồ thị tri thức.'}
                  </p>
                  <p className="ag-note" style={{ margin: '4px 0 0' }}>
                    {lesson.edges.length} liên kết trong đồ thị tri thức, {lesson.packages.length} gói kiến thức
                    {lesson.atom?.bloom ? `, bậc Bloom: ${lesson.atom.bloom}` : ''}. Phân rã được làm ở Supabase, trang này chỉ đọc.
                  </p>
                </div>

                <ResourceGenerator
                  key={`${lesson.atomId}-${lesson.version ?? 0}`}
                  atomId={lesson.atomId}
                  canGenerate={lesson.packages.length > 0}
                  onAssets={setAssets}
                />

                <div className="kh-card" id="kh-sec-3">
                  <h3 className="du-h3" style={{ margin: 0 }}>Bước 3. Ghép theo phân phối chương trình</h3>
                  {(() => {
                    const sel = items.find((i) => i.atomId === lesson.atomId);
                    const chapter = lesson.atom?.chapter || sel?.chapter;
                    const sub = lesson.atom?.lesson || sel?.lesson;
                    const sibs = items.filter((i) => i.chapter === chapter && i.lesson === sub);
                    return (
                      <>
                        <p className="ag-note" style={{ margin: '6px 0 0' }}>
                          {chapter ? `Chương: ${chapter}. Mục: ${sub || '(chưa rõ)'}.` : 'Chưa rõ bài thuộc chương nào.'}
                        </p>
                        <p className="ag-note" style={{ margin: '4px 0 0' }}>
                          Trường chưa có phân phối chương trình chính thức, nên ghép theo chương/bài trong cây chương trình: các bài cùng mục là các
                          nguyên tử của cùng một tiết.
                        </p>
                        {sibs.length > 1 && (
                          <ul className="kh-sibs">
                            {sibs.map((x) => (
                              <li key={x.atomId} className={x.atomId === lesson.atomId ? 'cur' : ''}>
                                {x.title}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    );
                  })()}
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

                    <form id="kh-sec-4" aria-label="Phiếu chấm 6 tiêu chí" onSubmit={(e) => e.preventDefault()}>
                      <h3 className="du-h3">Bước 4. Người duyệt: chấm 6 tiêu chí</h3>
                      <p className="ag-note">
                        Duyệt là duyệt cả BỘ: gói kiến thức và {assets.length} tài nguyên đang có
                        {assets.some((a) => a.status === 'draft') ? ' (gồm bản nháp)' : ''}. Sau khi duyệt, bộ này đóng băng thành một phiên bản.
                      </p>
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
                          <label className="ag-field-label" htmlFor="du-key">
                            Mã người duyệt
                          </label>
                          <input
                            id="du-key"
                            className="ag-field"
                            type="password"
                            value={reviewerKey}
                            onChange={(e) => setReviewerKey(e.target.value)}
                            maxLength={200}
                            autoComplete="off"
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

                <div className="kh-card" id="kh-sec-5">
                  <h3 className="du-h3" style={{ margin: 0 }}>Bước 5. Nhập kho</h3>
                  <p className="ag-note" style={{ margin: '6px 0 0' }}>
                    {lesson.version
                      ? `Bản chuẩn hiện hành: v${lesson.version}. Bản đã duyệt không sửa được; sinh lại hoặc chỉnh sau đó tạo bản nháp mới và phải duyệt lại mới thành v${lesson.version + 1}.`
                      : 'Chưa có phiên bản nào. Khi người duyệt bấm "Duyệt vào Kho", bộ được đóng băng thành v1 và gắn mã tổ chức (org_id).'}
                  </p>
                </div>

                <div className="kh-card" id="kh-sec-6">
                  <h3 className="du-h3" style={{ margin: 0 }}>Bước 6. Ngân hàng câu hỏi</h3>
                  <p className="ag-note" style={{ margin: '6px 0 0' }}>
                    {lesson.questions.length} câu hỏi của bài này trong ngân hàng
                    {lesson.atom?.bloom ? `; bậc Bloom của bài: ${lesson.atom.bloom}` : ''}.
                    {(() => {
                      const by = new Map<string, number>();
                      for (const q of lesson.questions) {
                        const k = q.do_kho || q.tier;
                        if (k) by.set(k, (by.get(k) || 0) + 1);
                      }
                      return by.size ? ` Theo mức: ${[...by].map(([k, n]) => `${k} (${n})`).join(', ')}.` : '';
                    })()}
                  </p>
                  <p className="ag-note" style={{ margin: '4px 0 0' }}>
                    Chưa có ánh xạ chính thức sang các mức của TT 22/2021; thẻ hiển thị là thẻ có sẵn trong ngân hàng.
                  </p>
                  <Link className="ag-link kh-tap" href="/kiem-tra">Mở trang Kiểm tra và Đề thi</Link>
                </div>
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
