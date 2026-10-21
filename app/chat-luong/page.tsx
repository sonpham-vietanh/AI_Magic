'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/Shell';
import { Icon } from '@/components/ui/icons';
import { SUBJECTS } from '@/lib/catalog';
import { RUBRIC_6 } from '@/lib/eval/rubric';
import '../ui-cl.css';

interface Summary {
  totalRuns: number;
  accepted: number;
  acceptedUnchanged: number;
  unchangedPct: number | null;
  avgDiffRatio: number | null;
  flaggedLessons: number;
}
interface LessonStat {
  lessonKey: string;
  generations: number;
  regenerations: number;
  regenRate: number;
  flagged: boolean;
}
interface Coverage {
  total: number;
  target: number;
  bySubject: Record<string, number>;
  byGrade: Record<string, number>;
  thin: string[];
}
interface Baseline {
  baselineMinutes: number | null;
  targetMinutes: number | null;
  measuredWith?: string;
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

const subjectName = (k: string) => SUBJECTS.find((s) => s.code === k)?.shortName ?? k;
const vnPct = (n: number, d = 0) => `${n.toFixed(d).replace('.', ',')}%`;

function BarRows({ data, label }: { data: Record<string, number>; label: (k: string) => string }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div className="cl-rows">
      {entries.map(([k, v]) => (
        <div key={k} className="cl-row">
          <span className="cl-row-name">{label(k)}</span>
          <span className="cl-bar" aria-hidden="true">
            <i style={{ width: `${(v / max) * 100}%` }} />
          </span>
          <span className="cl-pct">{v}</span>
        </div>
      ))}
    </div>
  );
}

export default function ChatLuongPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lessons, setLessons] = useState<LessonStat[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [baseline, setBaseline] = useState({ b: '', t: '', w: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  const [label, setLabel] = useState('');
  const [rater, setRater] = useState('');
  const [caseId, setCaseId] = useState('');
  const [points, setPoints] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, c, b] = await Promise.all([
        getJson<{ summary: Summary; lessons: LessonStat[] }>('/api/signals/summary'),
        getJson<{ coverage: Coverage }>('/api/eval/cases'),
        getJson<{ baseline: Baseline }>('/api/eval/baseline'),
      ]);
      setSummary(s.summary);
      setLessons(s.lessons);
      setCoverage(c.coverage);
      setBaseline({
        b: b.baseline.baselineMinutes === null ? '' : String(b.baseline.baselineMinutes),
        t: b.baseline.targetMinutes === null ? '' : String(b.baseline.targetMinutes),
        w: b.baseline.measuredWith ?? '',
      });
    } catch (e) {
      setError(`Không tải được số liệu (${e instanceof Error ? e.message : 'lỗi'}).`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

  async function saveBaseline() {
    setMsg(null);
    const b = toNum(baseline.b);
    const t = toNum(baseline.t);
    if ((b !== null && !Number.isFinite(b)) || (t !== null && !Number.isFinite(t))) {
      setMsg({ kind: 'bad', text: 'Số phút không hợp lệ.' });
      return;
    }
    try {
      const r = await fetch('/api/eval/baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baselineMinutes: b, targetMinutes: t, measuredWith: baseline.w || undefined }),
      });
      setMsg(r.ok ? { kind: 'ok', text: 'Đã lưu mốc thời gian.' } : { kind: 'bad', text: 'Không lưu được mốc thời gian.' });
    } catch {
      setMsg({ kind: 'bad', text: 'Không lưu được mốc thời gian.' });
    }
  }

  async function submitScore() {
    setMsg(null);
    if (!label.trim() || !rater.trim() || RUBRIC_6.some((c) => !points[c.id])) {
      setMsg({ kind: 'bad', text: 'Cần nhập nhãn mờ, tên người chấm và đủ 6 điểm (1 đến 5).' });
      return;
    }
    try {
      const r = await fetch('/api/eval/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blindLabel: label.trim(), caseId: caseId.trim() || label.trim(), rater: rater.trim(), scores: points }),
      });
      if (r.ok) {
        setMsg({ kind: 'ok', text: 'Đã ghi điểm.' });
        setPoints({});
        setLabel('');
      } else {
        setMsg({ kind: 'bad', text: r.status === 404 ? 'Nhãn mờ không tồn tại.' : 'Không ghi được điểm.' });
      }
    } catch {
      setMsg({ kind: 'bad', text: 'Không ghi được điểm.' });
    }
  }

  const regenTotal = useMemo(() => lessons.reduce((a, l) => a + l.regenerations, 0), [lessons]);
  const pct = summary?.unchangedPct;
  const empty = !!summary && summary.totalRuns === 0;
  const total = coverage?.total ?? 0;
  const target = coverage?.target ?? 100;

  return (
    <Shell title="Chất lượng & Tín hiệu" subtitle="Theo dõi bài soạn có dùng được ngay hay không.">
      <div className="cl-wrap">
        {loading && !summary && (
          <div aria-busy="true" aria-label="Đang tải số liệu" style={{ display: 'grid', gap: 12 }}>
            <div className="cl-skel" />
            <div className="cl-skel" />
          </div>
        )}
        {error && (
          <div className="ag-alert bad" role="alert">
            <Icon name="alert" size={18} />
            <div>
              {error}{' '}
              <button type="button" className="ag-link" onClick={() => void load()}>
                Thử lại
              </button>
            </div>
          </div>
        )}

        {summary && (
          <>
            <div className="cl-tiles">
              <div className="cl-tile star">
                <div className="cl-tile-label">Duyệt mà không sửa gì</div>
                <div className="cl-tile-num">{typeof pct === 'number' ? vnPct(pct, 1) : '--'}</div>
                <div className="cl-tile-sub">
                  {summary.accepted > 0
                    ? `${summary.acceptedUnchanged}/${summary.accepted} bài giữ nguyên`
                    : 'Chưa có bài nào được duyệt'}
                </div>
              </div>
              <div className="cl-tile">
                <div className="cl-tile-label">Tổng lượt soạn</div>
                <div className="cl-tile-num">{summary.totalRuns}</div>
              </div>
              <div className="cl-tile">
                <div className="cl-tile-label">Lượt sinh lại</div>
                <div className="cl-tile-num">{regenTotal}</div>
              </div>
              <div className="cl-tile warnt">
                <div className="cl-tile-label">Tiết cần xem lại</div>
                <div className="cl-tile-num">{summary.flaggedLessons}</div>
                <div className="cl-tile-sub">Sinh lại quá 40%</div>
              </div>
            </div>

            {empty && (
              <div className="ag-alert info">
                <Icon name="info" size={18} />
                <div>
                  Chưa có số liệu. Số liệu sẽ xuất hiện sau khi cô/thầy bấm &quot;Duyệt &amp; dùng&quot; ở Trợ lý soạn bài.
                </div>
              </div>
            )}
          </>
        )}

        {summary && (
          <section className="cl-sec" aria-labelledby="cl-time">
            <h2 id="cl-time">Thời gian soạn bài</h2>
            <p className="cl-sec-sub">Nhập số phút một bài soạn tay hiện nay và mục tiêu. Để trống nếu chưa đo.</p>
            <div className="cl-minutes">
              <div>
                <label className="ag-field-label" htmlFor="cl-b">
                  Hiện tại (phút)
                </label>
                <input
                  id="cl-b"
                  className="ag-field cl-num"
                  inputMode="decimal"
                  value={baseline.b}
                  onChange={(e) => setBaseline({ ...baseline, b: e.target.value })}
                />
              </div>
              <span className="cl-arrow" aria-hidden="true">
                <Icon name="send" size={20} />
              </span>
              <div>
                <label className="ag-field-label" htmlFor="cl-t">
                  Mục tiêu (phút)
                </label>
                <input
                  id="cl-t"
                  className="ag-field cl-num"
                  inputMode="decimal"
                  value={baseline.t}
                  onChange={(e) => setBaseline({ ...baseline, t: e.target.value })}
                />
              </div>
              <div className="cl-wide">
                <label className="ag-field-label" htmlFor="cl-w">
                  Đo bằng cách nào (không bắt buộc)
                </label>
                <input
                  id="cl-w"
                  className="ag-field"
                  value={baseline.w}
                  onChange={(e) => setBaseline({ ...baseline, w: e.target.value })}
                />
              </div>
              <button type="button" className="ag-btn dark" onClick={() => void saveBaseline()}>
                Lưu
              </button>
            </div>
          </section>
        )}

        {summary && (
          <section className="cl-sec" aria-labelledby="cl-regen">
            <h2 id="cl-regen">Tỷ lệ sinh lại theo tiết</h2>
            <p className="cl-sec-sub">Tiết nào cô/thầy phải bấm sinh lại nhiều thì cần người vào sửa mẫu.</p>
            {lessons.length === 0 ? (
              <p className="ag-note" style={{ marginTop: 0 }}>
                Chưa có tiết nào được sinh lại.
              </p>
            ) : (
              <div className="cl-rows">
                {lessons.map((l) => (
                  <div key={l.lessonKey} className={`cl-row${l.flagged ? ' flag' : ''}`}>
                    <span className="cl-row-name">
                      {l.lessonKey}
                      <small>
                        {l.generations} lượt sinh, {l.regenerations} lần sinh lại
                      </small>
                    </span>
                    <span className="cl-bar" aria-hidden="true">
                      <i style={{ width: `${Math.min(100, l.regenRate * 100)}%` }} />
                    </span>
                    <span className="cl-pct">{vnPct(l.regenRate * 100)}</span>
                    {l.flagged ? <span className="ag-status draft">Cần người vào sửa</span> : <span />}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {coverage && (
          <section className="cl-sec" aria-labelledby="cl-cases">
            <h2 id="cl-cases">Bộ đề thật để đánh giá</h2>
            <p className="cl-sec-sub">
              <strong>Chỉ nhập đề thật của giáo viên</strong>, không tự soạn.
            </p>
            <div className="cl-progress-head">
              <span className="cl-progress-num">
                {total}/{target}
              </span>
              <span className="ag-note" style={{ margin: 0 }}>
                đề đã có
              </span>
            </div>
            <div
              className="cl-bar"
              role="progressbar"
              aria-label="Tiến độ bộ đề"
              aria-valuemin={0}
              aria-valuemax={target}
              aria-valuenow={total}
            >
              <i style={{ width: `${Math.min(100, (total / Math.max(1, target)) * 100)}%` }} />
            </div>
            {total > 0 ? (
              <>
                <div className="cl-cover">
                  <div>
                    <h3>Theo môn</h3>
                    <BarRows data={coverage.bySubject} label={subjectName} />
                  </div>
                  <div>
                    <h3>Theo khối</h3>
                    <BarRows data={coverage.byGrade} label={(k) => `Khối ${k}`} />
                  </div>
                </div>
                {coverage.thin.length > 0 && (
                  <div className="ag-alert warn">
                    <Icon name="alert" size={18} />
                    <div>Môn còn ít đề: {coverage.thin.map(subjectName).join(', ')}.</div>
                  </div>
                )}
              </>
            ) : (
              <p className="ag-note">Chưa có đề nào. Đề thật do giáo viên cung cấp sẽ hiện ở đây.</p>
            )}
          </section>
        )}

        {summary && (
          <section className="cl-sec">
            <details className="cl-blind">
              <summary>
                Chấm mù
                <Icon name="chevronDown" size={20} />
              </summary>
              <p className="cl-sec-sub">
                Người chấm không biết bản nào của phiên bản nào. Chỉ nhập nhãn mờ được giao, chấm 1 đến 5 điểm.
              </p>
              <div className="cl-ids">
                <div>
                  <label className="ag-field-label" htmlFor="cl-label">
                    Nhãn mờ (ví dụ B-0a3f1)
                  </label>
                  <input id="cl-label" className="ag-field" value={label} onChange={(e) => setLabel(e.target.value)} />
                </div>
                <div>
                  <label className="ag-field-label" htmlFor="cl-case">
                    Mã đề (không bắt buộc)
                  </label>
                  <input id="cl-case" className="ag-field" value={caseId} onChange={(e) => setCaseId(e.target.value)} />
                </div>
                <div>
                  <label className="ag-field-label" htmlFor="cl-rater">
                    Người chấm
                  </label>
                  <input id="cl-rater" className="ag-field" value={rater} onChange={(e) => setRater(e.target.value)} />
                </div>
              </div>
              {RUBRIC_6.map((c) => (
                <fieldset key={c.id} className="cl-crit">
                  <legend>{c.name}</legend>
                  <div className="cl-scale" role="radiogroup" aria-label={`Điểm: ${c.name}`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label key={n} className={points[c.id] === n ? 'on' : ''}>
                        <input
                          type="radio"
                          name={`bl-${c.id}`}
                          value={n}
                          checked={points[c.id] === n}
                          onChange={() => setPoints({ ...points, [c.id]: n })}
                          aria-label={`${n} điểm`}
                        />
                        {n}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <button type="button" className="ag-btn dark" onClick={() => void submitScore()}>
                Ghi điểm
              </button>
            </details>
          </section>
        )}

        {msg && (
          <div className={`ag-alert ${msg.kind}`} role={msg.kind === 'bad' ? 'alert' : 'status'}>
            <Icon name={msg.kind === 'ok' ? 'check' : 'alert'} size={18} />
            <div>{msg.text}</div>
          </div>
        )}
      </div>
    </Shell>
  );
}
