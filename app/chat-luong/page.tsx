'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, fetchJson, friendlyError } from '@/lib/ui/fetchJson';
import { Shell } from '@/components/Shell';
import { Icon } from '@/components/ui/icons';
import { SUBJECTS } from '@/lib/catalog';
import { RUBRIC_6 } from '@/lib/eval/rubric';
import { diffSignal, minutesSaved, regenSignal, unchangedSignal, vnPct, type Signal } from './signals';
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

const subjectName = (k: string) => SUBJECTS.find((s) => s.code === k)?.shortName ?? k;
const toNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

function SignalBadge({ s }: { s: Signal }) {
  return <span className={`cl-sig ${s.tone}`}>{s.label}</span>;
}

/** Vòng tròn thể hiện phần trăm, kèm chữ thay thế cho trình đọc màn hình. */
function Gauge({ value, tone }: { value: number | null; tone: Signal['tone'] }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <svg
      className={`cl-gauge ${tone}`}
      viewBox="0 0 128 128"
      width="128"
      height="128"
      role="img"
      aria-label={value === null ? 'Chưa có số liệu' : `${vnPct(v, 0)} bài được duyệt mà không sửa`}
    >
      <circle cx="64" cy="64" r={r} fill="none" strokeWidth="12" className="cl-gauge-bg" />
      {v > 0 && (
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          className="cl-gauge-fg"
          strokeDasharray={`${(v / 100) * c} ${c}`}
          transform="rotate(-90 64 64)"
        />
      )}
      <text x="64" y="73" textAnchor="middle" className="cl-gauge-txt">
        {value === null ? '--' : vnPct(v, 0)}
      </text>
    </svg>
  );
}

function Metric({ label, value, hint, tone, sub }: { label: string; value: string; hint: string; tone?: Signal['tone']; sub?: string }) {
  return (
    <div className={`cl-tile${tone === 'low' ? ' warnt' : ''}`}>
      <div className="cl-tile-label">{label}</div>
      <div className="cl-tile-num">{value}</div>
      {sub && <div className={`cl-tile-sub ${tone ?? ''}`}>{sub}</div>}
      <p className="cl-tile-hint">{hint}</p>
    </div>
  );
}

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
  const [saving, setSaving] = useState(false);

  const [label, setLabel] = useState('');
  const [rater, setRater] = useState('');
  const [caseId, setCaseId] = useState('');
  const [points, setPoints] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, c, b] = await Promise.all([
        fetchJson<{ summary: Summary; lessons: LessonStat[] }>('/api/signals/summary'),
        fetchJson<{ coverage: Coverage }>('/api/eval/cases'),
        fetchJson<{ baseline: Baseline }>('/api/eval/baseline'),
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
      setError(friendlyError(e, 'Không tải được số liệu chất lượng. Cô/thầy thử lại nhé.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveBaseline() {
    setMsg(null);
    const b = toNum(baseline.b);
    const t = toNum(baseline.t);
    if ((b !== null && !Number.isFinite(b)) || (t !== null && !Number.isFinite(t))) {
      setMsg({ kind: 'bad', text: 'Số phút chưa hợp lệ. Cô/thầy nhập số, ví dụ 45 hoặc 12,5.' });
      return;
    }
    setSaving(true);
    try {
      await fetchJson('/api/eval/baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baselineMinutes: b, targetMinutes: t, measuredWith: baseline.w || undefined }),
      });
      setMsg({ kind: 'ok', text: 'Đã lưu mốc thời gian.' });
    } catch (e) {
      setMsg({ kind: 'bad', text: friendlyError(e, 'Không lưu được mốc thời gian. Cô/thầy thử lại nhé.') });
    } finally {
      setSaving(false);
    }
  }

  async function submitScore() {
    setMsg(null);
    if (!label.trim() || !rater.trim() || RUBRIC_6.some((c) => !points[c.id])) {
      setMsg({ kind: 'bad', text: 'Cần nhập nhãn mờ, tên người chấm và đủ 6 điểm (từ 1 đến 5).' });
      return;
    }
    try {
      await fetchJson('/api/eval/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blindLabel: label.trim(), caseId: caseId.trim() || label.trim(), rater: rater.trim(), scores: points }),
      });
      setMsg({ kind: 'ok', text: 'Đã ghi điểm.' });
      setPoints({});
      setLabel('');
    } catch (e) {
      const notFound = e instanceof ApiError && e.status === 404;
      setMsg({ kind: 'bad', text: notFound ? 'Nhãn mờ này không tồn tại. Cô/thầy kiểm tra lại nhãn được giao.' : friendlyError(e, 'Không ghi được điểm. Cô/thầy thử lại nhé.') });
    }
  }

  const regenTotal = useMemo(() => lessons.reduce((a, l) => a + l.regenerations, 0), [lessons]);
  const pct = summary?.unchangedPct;
  const total = coverage?.total ?? 0;
  const target = coverage?.target ?? 100;
  const sig = unchangedSignal(summary?.unchangedPct, summary?.accepted ?? 0);
  const diffSig = diffSignal(summary?.avgDiffRatio);
  const saved = minutesSaved(toNum(baseline.b), toNum(baseline.t));

  return (
    <Shell title="Chất lượng bài soạn" subtitle="Theo dõi bài AI soạn có dùng được ngay hay không, và tiết nào cần người vào sửa.">
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
              <button type="button" className="ag-link cl-tap" onClick={() => void load()}>
                Thử lại
              </button>
            </div>
          </div>
        )}

        {summary && (
          <>
            <section className="cl-hero" aria-labelledby="cl-hero-t">
              <Gauge value={typeof pct === 'number' ? pct : null} tone={sig.tone} />
              <div className="cl-hero-body">
                <h2 id="cl-hero-t">Bài duyệt mà không phải sửa gì</h2>
                <p className="cl-hero-line">
                  <SignalBadge s={sig} />
                  <span>
                    {summary.accepted > 0
                      ? `${summary.acceptedUnchanged} trên ${summary.accepted} bài được duyệt giữ nguyên hoàn toàn`
                      : 'Chưa có bài nào được duyệt'}
                  </span>
                </p>
                <p className="cl-hero-hint">{sig.hint}</p>
                <p className="cl-hero-def">Đây là chỉ số chính: bài càng ít bị sửa thì cô/thầy càng tiết kiệm thời gian soạn.</p>
              </div>
            </section>

            <div className="cl-tiles">
              <Metric label="Tổng lượt soạn" value={String(summary.totalRuns)} hint="Số lần cô/thầy nhờ AI soạn bài, tính cả các lần sinh lại." />
              <Metric label="Lượt sinh lại" value={String(regenTotal)} hint="Số lần bấm sinh lại vì chưa hài lòng. Càng ít càng tốt." />
              <Metric
                label="Mức chỉnh sửa trung bình"
                value={typeof summary.avgDiffRatio === 'number' ? vnPct(summary.avgDiffRatio * 100) : '--'}
                hint="Phần nội dung cô/thầy đổi so với bản AI soạn. Càng thấp càng tốt."
                sub={diffSig.label}
                tone={diffSig.tone}
              />
              <Metric
                label="Tiết cần xem lại"
                value={String(summary.flaggedLessons)}
                hint="Tiết bị sinh lại quá 40% số lượt. Nên có người vào sửa mẫu."
                sub={summary.flaggedLessons > 0 ? 'Cần người vào sửa' : 'Chưa có tiết nào'}
                tone={summary.flaggedLessons > 0 ? 'low' : 'good'}
              />
            </div>

          </>
        )}

        {summary && (
          <section className="cl-sec" aria-labelledby="cl-time">
            <h2 id="cl-time">Thời gian soạn bài</h2>
            <p className="cl-sec-sub">Nhập số phút một bài soạn tay hiện nay và mục tiêu của trường. Để trống nếu chưa đo.</p>
            <div className="cl-minutes">
              <div>
                <label className="ag-field-label" htmlFor="cl-b">
                  Hiện tại (phút)
                </label>
                <input id="cl-b" className="ag-field cl-num" inputMode="decimal" value={baseline.b} onChange={(e) => setBaseline({ ...baseline, b: e.target.value })} />
              </div>
              <span className="cl-arrow" aria-hidden="true">
                <Icon name="send" size={20} />
              </span>
              <div>
                <label className="ag-field-label" htmlFor="cl-t">
                  Mục tiêu (phút)
                </label>
                <input id="cl-t" className="ag-field cl-num" inputMode="decimal" value={baseline.t} onChange={(e) => setBaseline({ ...baseline, t: e.target.value })} />
              </div>
              <div className="cl-wide">
                <label className="ag-field-label" htmlFor="cl-w">
                  Đo bằng cách nào (không bắt buộc)
                </label>
                <input id="cl-w" className="ag-field" value={baseline.w} onChange={(e) => setBaseline({ ...baseline, w: e.target.value })} />
              </div>
              <button type="button" className="ag-btn dark" onClick={() => void saveBaseline()} disabled={saving}>
                {saving && <span className="ag-spin" aria-hidden="true" />}
                Lưu
              </button>
            </div>
            {saved && saved.minutes > 0 && (
              <p className="cl-saved">
                <Icon name="clock" size={18} />
                <span>
                  Mục tiêu tiết kiệm <b>{saved.minutes.toFixed(saved.minutes % 1 ? 1 : 0).replace('.', ',')} phút</b> mỗi bài ({vnPct(saved.pct)} so với soạn tay).
                </span>
              </p>
            )}
          </section>
        )}

        {summary && (
          <section className="cl-sec" aria-labelledby="cl-regen">
            <h2 id="cl-regen">Tỷ lệ sinh lại theo tiết</h2>
            <p className="cl-sec-sub">Tiết nào cô/thầy phải bấm sinh lại nhiều thì cần người vào sửa mẫu. Thanh càng dài là sinh lại càng nhiều.</p>
            {lessons.length === 0 ? (
              <div className="cl-empty">
                <Icon name="refresh" size={28} />
                <p>Chưa có tiết nào được sinh lại. Đó là tín hiệu tốt.</p>
              </div>
            ) : (
              <div className="cl-rows">
                {lessons.map((l) => {
                  const rs = regenSignal(l.regenRate, l.flagged);
                  return (
                    <div key={l.lessonKey} className={`cl-row${l.flagged ? ' flag' : ''}`}>
                      <span className="cl-row-name">
                        {l.lessonKey}
                        <small>
                          {l.generations} lượt sinh, {l.regenerations} lần sinh lại
                        </small>
                      </span>
                      <span className={`cl-bar ${rs.tone}`} aria-hidden="true">
                        <i style={{ width: `${Math.min(100, l.regenRate * 100)}%` }} />
                      </span>
                      <span className="cl-pct">{vnPct(l.regenRate * 100)}</span>
                      <SignalBadge s={rs} />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {coverage && (
          <section className="cl-sec" aria-labelledby="cl-cases">
            <h2 id="cl-cases">Bộ đề thật để đánh giá</h2>
            <p className="cl-sec-sub">
              <strong>Chỉ nhập đề thật của giáo viên</strong>, không tự soạn. Bộ đề này dùng để so AI với bài do người soạn.
            </p>
            <div className="cl-progress-head">
              <span className="cl-progress-num">
                {total}/{target}
              </span>
              <span className="ag-note" style={{ margin: 0 }}>
                đề đã có
              </span>
            </div>
            <div className="cl-bar big" role="progressbar" aria-label="Tiến độ bộ đề" aria-valuemin={0} aria-valuemax={target} aria-valuenow={total}>
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
              <div className="cl-empty">
                <Icon name="file" size={28} />
                <p>Chưa có đề nào. Đề thật do giáo viên cung cấp sẽ hiện ở đây.</p>
              </div>
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
              <p className="cl-sec-sub">Người chấm không biết bản nào của phiên bản nào. Chỉ nhập nhãn mờ được giao, chấm từ 1 đến 5 điểm.</p>
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
