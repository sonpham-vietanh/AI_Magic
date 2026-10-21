'use client';

import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { GRADES, SUBJECTS } from '@/lib/catalog';
import { RUBRIC_6 } from '@/lib/eval/rubric';

type KhoStatus = 'approved' | 'chua_duyet' | 'khong_co';

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

const NAVY = '#26275D';
const YELLOW = '#F9DD0E';
const BG = '#F5F6FA';

const STATUS_META: Record<KhoStatus, { label: string; bg: string; fg: string }> = {
  approved: { label: 'Đã duyệt', bg: '#DCF5E3', fg: '#14532D' },
  chua_duyet: { label: 'Chưa duyệt', bg: YELLOW, fg: NAVY },
  khong_co: { label: 'Không có gói', bg: '#E5E7EB', fg: '#374151' },
};

const FIELD_LABELS: Record<string, string> = {
  objective: 'Mục tiêu',
  explanation: 'Giải thích',
  example: 'Ví dụ',
  counterExample: 'Phản ví dụ',
  commonMistake: 'Lỗi thường gặp',
  strategy: 'Chiến lược dạy',
  questions: 'Câu hỏi',
};

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #DDE0EC',
  borderRadius: 12,
  padding: 16,
};
const control: React.CSSProperties = {
  fontSize: 16,
  padding: '10px 12px',
  border: '1px solid #9CA3C0',
  borderRadius: 8,
  background: '#fff',
  color: NAVY,
  minHeight: 44,
};

function StatusChip({ status }: { status: KhoStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      style={{ background: m.bg, color: m.fg, borderRadius: 999, padding: '4px 12px', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}
    >
      {m.label}
    </span>
  );
}

export default function DuyetPage() {
  const [subject, setSubject] = useState('toan');
  const [grade, setGrade] = useState('10');
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [reviewer, setReviewer] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadQueue = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ subject, grade, limit: '100' });
      const res = await fetch(`/api/kho/queue?${qs.toString()}`, { signal });
      const data = (await res.json()) as { ok?: boolean; items?: QueueItem[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setItems(data.items || []);
    } catch (e) {
      if (signal?.aborted) return;
      setError(e instanceof Error ? e.message : 'Không tải được hàng chờ duyệt.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [subject, grade]);

  useEffect(() => {
    const c = new AbortController();
    void loadQueue(c.signal);
    return () => c.abort();
  }, [loadQueue]);

  const openItem = async (atomId: string) => {
    setSelectedId(atomId);
    setLesson(null);
    setMessage(null);
    setScores({});
    setNote('');
    setLessonLoading(true);
    try {
      const res = await fetch(`/api/kho/standard?atomId=${encodeURIComponent(atomId)}`);
      const data = (await res.json()) as { ok?: boolean; lesson?: Lesson; error?: string };
      if (!res.ok || !data.ok || !data.lesson) throw new Error(data.error || `HTTP ${res.status}`);
      setLesson(data.lesson);
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Không tải được bản chuẩn.' });
    } finally {
      setLessonLoading(false);
    }
  };

  const complete = RUBRIC_6.every((c) => scores[c.id] >= 1);
  const filled = RUBRIC_6.filter((c) => scores[c.id] >= 1).map((c) => scores[c.id]);
  const average = filled.length ? filled.reduce((a, b) => a + b, 0) / filled.length : 0;

  const submit = async (decision: 'approve' | 'reject') => {
    if (!selectedId) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/kho/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ atomId: selectedId, reviewer, scores, decision, note: note || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; review?: Review; error?: string };
      if (!res.ok || !data.ok) {
        setMessage({ kind: 'err', text: data.error || `Lỗi HTTP ${res.status}` });
        return;
      }
      setMessage({
        kind: 'ok',
        text: decision === 'approve' ? 'Đã duyệt: bài này đã vào Kho học liệu chuẩn.' : 'Đã ghi nhận từ chối: bài chưa vào Kho.',
      });
      await Promise.all([loadQueue(), openItem(selectedId).then(() => undefined)]);
      setMessage({
        kind: 'ok',
        text: decision === 'approve' ? 'Đã duyệt: bài này đã vào Kho học liệu chuẩn.' : 'Đã ghi nhận từ chối: bài chưa vào Kho.',
      });
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Không gửi được kết quả duyệt.' });
    } finally {
      setSubmitting(false);
    }
  };

  const btn = (bg: string, fg: string, disabled: boolean): React.CSSProperties => ({
    fontSize: 16,
    fontWeight: 700,
    minHeight: 48,
    padding: '10px 20px',
    borderRadius: 10,
    border: 'none',
    background: disabled ? '#C9CCDA' : bg,
    color: disabled ? '#55587A' : fg,
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <Shell
      title="Trang duyệt: Pha A"
      subtitle="Người duyệt chấm rubric 6 tiêu chí trước khi bài vào Kho học liệu chuẩn."
    >
      <div style={{ background: BG, color: NAVY, fontSize: 16, display: 'grid', gap: 16, padding: 4 }}>
        <div
          role="note"
          style={{ ...card, borderLeft: `6px solid ${YELLOW}`, background: '#FFFBE0', fontWeight: 600 }}
        >
          Không qua cổng thì không vào Kho. Duyệt cần điểm trung bình từ 4.0 trở lên và không tiêu chí nào dưới 3.
        </div>

        <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label style={{ display: 'grid', gap: 4, fontWeight: 600 }}>
            Môn
            <select aria-label="Chọn môn" value={subject} onChange={(e) => setSubject(e.target.value)} style={control}>
              {SUBJECTS.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.shortName}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontWeight: 600 }}>
            Khối
            <select aria-label="Chọn khối" value={grade} onChange={(e) => setGrade(e.target.value)} style={control}>
              {GRADES.map((g) => (
                <option key={g.grade} value={g.grade}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void loadQueue()} style={btn(NAVY, '#fff', loading)} disabled={loading} aria-label="Tải lại hàng chờ">
            {loading ? 'Đang tải...' : 'Tải lại'}
          </button>
        </div>

        {error && (
          <div role="alert" style={{ ...card, borderColor: '#B91C1C', color: '#B91C1C', fontWeight: 600 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
          <section aria-label="Hàng chờ duyệt" style={card}>
            <h2 style={{ fontSize: 20, margin: '0 0 12px' }}>{loading && items.length === 0 ? 'Hàng chờ (đang tải…)' : `Hàng chờ (${items.length} bài)`}</h2>
            {!loading && items.length === 0 && !error && <p>Không có bài nào cho bộ lọc này.</p>}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, maxHeight: 640, overflowY: 'auto' }}>
              {items.map((it) => (
                <li key={it.atomId}>
                  <button
                    type="button"
                    onClick={() => void openItem(it.atomId)}
                    aria-label={`Mở bài ${it.code} ${it.title}`}
                    aria-pressed={selectedId === it.atomId}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      fontSize: 16,
                      padding: 12,
                      minHeight: 48,
                      borderRadius: 10,
                      cursor: 'pointer',
                      color: NAVY,
                      background: selectedId === it.atomId ? '#EEF0FB' : '#fff',
                      border: selectedId === it.atomId ? `2px solid ${NAVY}` : '1px solid #DDE0EC',
                      display: 'flex',
                      gap: 8,
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>
                      <strong>{it.code}</strong> {it.title}
                      {it.assetCount > 0 && <span style={{ color: '#55587A' }}> · {it.assetCount} tài nguyên</span>}
                    </span>
                    <StatusChip status={it.status} />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Chi tiết bài và chấm rubric" style={card} aria-live="polite">
            {!selectedId && <p>Chọn một bài ở danh sách để xem gói Factory và chấm điểm.</p>}
            {lessonLoading && <p>Đang tải bản chuẩn...</p>}
            {lesson && (
              <div style={{ display: 'grid', gap: 16 }}>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
                  <h2 style={{ fontSize: 20, margin: 0 }}>
                    {lesson.atomCode} {lesson.title}
                  </h2>
                  <StatusChip status={lesson.status} />
                </div>

                {lesson.review && (
                  <p style={{ margin: 0 }}>
                    Lần duyệt gần nhất: <strong>{lesson.review.decision === 'approve' ? 'Duyệt' : 'Từ chối'}</strong> bởi {lesson.review.reviewer}, điểm trung bình{' '}
                    {lesson.review.average.toFixed(2)} ({new Date(lesson.review.reviewedAt).toLocaleString('vi-VN')}).
                  </p>
                )}

                {lesson.packages.length === 0 ? (
                  <p>Bài này chưa có gói Factory nên chưa thể duyệt vào Kho.</p>
                ) : (
                  lesson.packages.map((p, i) => (
                    <article key={p.id || i} style={{ background: BG, borderRadius: 10, padding: 12 }}>
                      <h3 style={{ fontSize: 17, margin: '0 0 8px' }}>
                        Gói Factory cấp {p.level ?? '?'} · {p.bloom || ''} · trạng thái Factory: {p.status || '?'}
                      </h3>
                      {Object.entries(p.fields || {})
                        .filter(([, v]) => !!v)
                        .map(([k, v]) => (
                          <div key={k} style={{ marginBottom: 8 }}>
                            <strong>{FIELD_LABELS[k] || k}:</strong>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{v}</div>
                          </div>
                        ))}
                    </article>
                  ))
                )}

                {lesson.packages.length > 0 && (
                  <form
                    aria-label="Phiếu chấm rubric 6 tiêu chí"
                    onSubmit={(e) => e.preventDefault()}
                    style={{ display: 'grid', gap: 12 }}
                  >
                    <h3 style={{ fontSize: 18, margin: 0 }}>Rubric 6 tiêu chí (thang 1 đến 5)</h3>
                    {RUBRIC_6.map((c) => (
                      <label key={c.id} style={{ display: 'grid', gap: 4 }}>
                        <span>
                          <strong>{c.name}</strong>
                          <span style={{ display: 'block', color: '#55587A', fontSize: 15 }}>{c.description}</span>
                        </span>
                        <select
                          aria-label={`Điểm ${c.name}`}
                          value={scores[c.id] ?? ''}
                          onChange={(e) => setScores((s) => ({ ...s, [c.id]: Number(e.target.value) }))}
                          style={control}
                        >
                          <option value="" disabled>
                            Chọn điểm
                          </option>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <p style={{ margin: 0, fontWeight: 700 }}>
                      Điểm trung bình: {complete ? average.toFixed(2) : `${average.toFixed(2)} (chưa chấm đủ)`}
                    </p>
                    <label style={{ display: 'grid', gap: 4, fontWeight: 600 }}>
                      Tên người duyệt
                      <input aria-label="Tên người duyệt" value={reviewer} onChange={(e) => setReviewer(e.target.value)} maxLength={200} style={control} />
                    </label>
                    <label style={{ display: 'grid', gap: 4, fontWeight: 600 }}>
                      Ghi chú
                      <textarea aria-label="Ghi chú duyệt" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={5000} style={control} />
                    </label>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        aria-label="Duyệt bài vào Kho"
                        disabled={submitting || !complete || !reviewer.trim()}
                        onClick={() => void submit('approve')}
                        style={btn(NAVY, '#fff', submitting || !complete || !reviewer.trim())}
                      >
                        Duyệt vào Kho
                      </button>
                      <button
                        type="button"
                        aria-label="Từ chối bài"
                        disabled={submitting || !complete || !reviewer.trim()}
                        onClick={() => void submit('reject')}
                        style={btn(YELLOW, NAVY, submitting || !complete || !reviewer.trim())}
                      >
                        Từ chối
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
            {message && (
              <p
                role={message.kind === 'err' ? 'alert' : 'status'}
                style={{ marginTop: 12, fontWeight: 700, color: message.kind === 'err' ? '#B91C1C' : '#14532D' }}
              >
                {message.text}
              </p>
            )}
          </section>
        </div>
      </div>
    </Shell>
  );
}
