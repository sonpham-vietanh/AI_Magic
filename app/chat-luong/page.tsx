'use client';

import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { RUBRIC_6 } from '@/lib/eval/rubric';

interface Summary {
  totalRuns: number;
  accepted: number;
  acceptedUnchanged: number;
  unchangedPct: number | null;
  avgDiffRatio: number | null;
  flaggedLessons: number;
}
interface Lesson {
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

const NAVY = '#26275D';
const YELLOW = '#F9DD0E';
const BG = '#F5F6FA';

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 14,
  padding: 16,
  border: '1px solid #E3E5F0',
  fontSize: 16,
};
const input: React.CSSProperties = {
  fontSize: 16,
  padding: '10px 12px',
  border: '1px solid #C9CCE0',
  borderRadius: 10,
  width: '100%',
  boxSizing: 'border-box',
};
const button: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  background: NAVY,
  color: '#fff',
  border: 0,
  borderRadius: 10,
  padding: '10px 18px',
  cursor: 'pointer',
  minHeight: 44,
};

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ ...card, borderTop: `4px solid ${accent ? YELLOW : NAVY}` }}>
      <div style={{ color: '#5A5C80' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: NAVY }}>{value}</div>
    </div>
  );
}

export default function ChatLuongPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [baseline, setBaseline] = useState<{ b: string; t: string; w: string }>({ b: '', t: '', w: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [label, setLabel] = useState('');
  const [rater, setRater] = useState('');
  const [caseId, setCaseId] = useState('');
  const [points, setPoints] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, c, b] = await Promise.all([
        getJson<{ summary: Summary; lessons: Lesson[] }>('/api/signals/summary'),
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
      setError(`Không tải được dữ liệu chất lượng (${e instanceof Error ? e.message : 'lỗi'}).`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toNum = (s: string) => (s.trim() === '' ? null : Number(s));

  async function saveBaseline() {
    setMsg('');
    const b = toNum(baseline.b);
    const t = toNum(baseline.t);
    if ((b !== null && !Number.isFinite(b)) || (t !== null && !Number.isFinite(t))) {
      setMsg('Số phút không hợp lệ.');
      return;
    }
    const r = await fetch('/api/eval/baseline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baselineMinutes: b, targetMinutes: t, measuredWith: baseline.w || undefined }),
    });
    setMsg(r.ok ? 'Đã lưu mốc thời gian.' : 'Không lưu được mốc thời gian.');
  }

  async function submitScore() {
    setMsg('');
    if (!label.trim() || !rater.trim() || RUBRIC_6.some((c) => !points[c.id])) {
      setMsg('Nhập nhãn mờ, tên người chấm và đủ 6 điểm (1-5).');
      return;
    }
    const r = await fetch('/api/eval/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blindLabel: label.trim(), caseId: caseId.trim() || label.trim(), rater: rater.trim(), scores: points }),
    });
    if (r.ok) {
      setMsg('Đã ghi điểm.');
      setPoints({});
      setLabel('');
    } else {
      setMsg(r.status === 404 ? 'Nhãn mờ không tồn tại.' : 'Không ghi được điểm.');
    }
  }

  const pct = summary?.unchangedPct;
  const grid: React.CSSProperties = { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' };

  return (
    <Shell title="Chất lượng & Tín hiệu" subtitle="Cái phanh của cả hệ thống">
      <div style={{ background: BG, padding: 16, display: 'grid', gap: 16, fontSize: 16, color: '#1B1C3A' }}>
        {loading && <div style={card}>Đang tải...</div>}
        {error && (
          <div role="alert" style={{ ...card, borderColor: '#D33', color: '#A11' }}>
            {error} <button style={button} onClick={() => void load()}>Thử lại</button>
          </div>
        )}

        <section style={{ ...card, borderLeft: `6px solid ${YELLOW}` }}>
          <h2 style={{ margin: 0, color: NAVY, fontSize: 20 }}>Chỉ số Bắc Đẩu: % sản phẩm được duyệt mà không sửa gì</h2>
          <div style={{ fontSize: 40, fontWeight: 800, color: NAVY }}>
            {typeof pct === 'number' ? `${pct.toFixed(1)}%` : 'Chưa có dữ liệu'}
          </div>
          {summary && (
            <div>
              {summary.acceptedUnchanged}/{summary.accepted} bài được duyệt giữ nguyên.
            </div>
          )}
          <h3 style={{ color: NAVY, fontSize: 17, marginBottom: 6 }}>Thời gian soạn bài (đo trước khi code)</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <input aria-label="Baseline phút/bài" placeholder="___" inputMode="decimal" style={{ ...input, width: 90 }} value={baseline.b} onChange={(e) => setBaseline({ ...baseline, b: e.target.value })} />
            <span>phút/bài →</span>
            <input aria-label="Mục tiêu phút" placeholder="___" inputMode="decimal" style={{ ...input, width: 90 }} value={baseline.t} onChange={(e) => setBaseline({ ...baseline, t: e.target.value })} />
            <span>phút</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <input aria-label="Cách đo" placeholder="Đo bằng cách nào (tuỳ chọn)" style={input} value={baseline.w} onChange={(e) => setBaseline({ ...baseline, w: e.target.value })} />
          </div>
          <div style={{ marginTop: 8 }}>
            <button style={button} onClick={() => void saveBaseline()}>Lưu mốc thời gian</button>
          </div>
        </section>

        {summary && (
          <section style={grid}>
            <Tile label="Tổng lượt sinh" value={String(summary.totalRuns)} />
            <Tile label="Được duyệt" value={String(summary.accepted)} />
            <Tile
              label="Mức sửa trung bình (diff)"
              value={summary.avgDiffRatio === null ? '—' : `${(summary.avgDiffRatio * 100).toFixed(0)}%`}
            />
            <Tile label="Tiết bị cờ (sinh lại > 40%)" value={String(summary.flaggedLessons)} accent />
          </section>
        )}

        <section style={card}>
          <h2 style={{ margin: 0, color: NAVY, fontSize: 20 }}>Tỷ lệ sinh lại theo tiết</h2>
          {lessons.length === 0 ? (
            <p>Chưa có dữ liệu sinh lại.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: NAVY }}>
                    <th>Tiết</th><th>Lượt sinh</th><th>Sinh lại</th><th>Tỷ lệ</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {lessons.map((l) => (
                    <tr key={l.lessonKey} style={{ background: l.flagged ? '#FFF8C2' : undefined }}>
                      <td>{l.lessonKey}</td>
                      <td>{l.generations}</td>
                      <td>{l.regenerations}</td>
                      <td>{(l.regenRate * 100).toFixed(0)}%</td>
                      <td>{l.flagged ? 'Cần người vào sửa' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={card}>
          <h2 style={{ margin: 0, color: NAVY, fontSize: 20 }}>
            Bộ đề đánh giá: {coverage?.total ?? 0}/{coverage?.target ?? 100}
          </h2>
          <p style={{ fontWeight: 700 }}>Chỉ nhập đề thật của giáo viên, không tự soạn.</p>
          {coverage && coverage.total > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              <div>
                <strong>Theo môn</strong>
                <ul>{Object.entries(coverage.bySubject).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>
              </div>
              <div>
                <strong>Theo khối</strong>
                <ul>{Object.entries(coverage.byGrade).map(([k, v]) => <li key={k}>Khối {k}: {v}</li>)}</ul>
              </div>
              {coverage.thin.length > 0 && <div>Môn còn thiếu đề: {coverage.thin.join(', ')}</div>}
            </div>
          ) : (
            <p>Chưa có đề nào.</p>
          )}
        </section>

        <section style={card}>
          <h2 style={{ margin: 0, color: NAVY, fontSize: 20 }}>Chấm mù (thang 1-5)</h2>
          <p>Bạn không biết bản nào của phiên bản prompt nào. Chỉ nhập nhãn mờ được giao.</p>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <input aria-label="Nhãn mờ" placeholder="Nhãn mờ (vd B-0a3f1)" style={input} value={label} onChange={(e) => setLabel(e.target.value)} />
            <input aria-label="Mã đề" placeholder="Mã đề (tuỳ chọn)" style={input} value={caseId} onChange={(e) => setCaseId(e.target.value)} />
            <input aria-label="Người chấm" placeholder="Người chấm" style={input} value={rater} onChange={(e) => setRater(e.target.value)} />
          </div>
          {RUBRIC_6.map((c) => (
            <div key={c.id} style={{ margin: '10px 0' }}>
              <div><strong>{c.name}</strong></div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={points[c.id] === n}
                    onClick={() => setPoints({ ...points, [c.id]: n })}
                    style={{ ...button, minWidth: 44, background: points[c.id] === n ? NAVY : '#fff', color: points[c.id] === n ? '#fff' : NAVY, border: `1px solid ${NAVY}` }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button style={button} onClick={() => void submitScore()}>Ghi điểm</button>
        </section>

        {msg && <div role="status" style={{ ...card, background: YELLOW, color: NAVY, fontWeight: 700 }}>{msg}</div>}
      </div>
    </Shell>
  );
}
