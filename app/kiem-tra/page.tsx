'use client';

import { useCallback, useState } from 'react';
import { Shell } from '@/components/Shell';
import { LessonField, LessonMultiField } from '@/components/agent/LessonField';
import type { AtomLite } from '@/components/agent/types';

const NAVY = '#26275D';
const YELLOW = '#F9DD0E';
const BG = '#F5F6FA';

const BLOOMS = ['Nhớ', 'Hiểu', 'Vận dụng', 'Phân tích', 'Đánh giá', 'Sáng tạo'];
const LEVELS: [string, string][] = [
  ['nhan_biet', 'Nhận biết'],
  ['thong_hieu', 'Thông hiểu'],
  ['van_dung', 'Vận dụng'],
  ['van_dung_cao', 'Vận dụng cao'],
];
const STATUS_LABEL: Record<string, string> = {
  nhap: 'Nháp',
  cho_duyet: 'Chờ tổ chuyên môn duyệt',
  da_duyet: 'Đã duyệt',
  tu_choi: 'Bị từ chối',
};

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
  createdBy: string;
  matrix: Matrix;
  locked?: boolean;
  lockedReason?: string | null;
  sections?: { heading: string; body: string }[];
  accessLog?: { at: string; actor: string; action: string }[];
  approvals?: { reviewer: string; decision: string; note: string; at: string }[];
}
interface Section { heading: string; body: string }

const inputStyle = { fontSize: 16, padding: '10px 12px', border: '1px solid #c9ccdb', borderRadius: 8, width: '100%', background: '#fff' } as const;
const labelStyle = { fontSize: 16, fontWeight: 700, color: NAVY, display: 'block', marginBottom: 4 } as const;
const btnStyle = (primary = true) => ({
  fontSize: 16, fontWeight: 700, padding: '10px 18px', borderRadius: 8, cursor: 'pointer', minHeight: 44,
  border: `2px solid ${NAVY}`, background: primary ? NAVY : '#fff', color: primary ? '#fff' : NAVY,
}) as const;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `Lỗi HTTP ${res.status}`);
  return data as T;
}
const post = (url: string, body: unknown, actor?: string) =>
  ({ method: 'POST', headers: { 'content-type': 'application/json', ...(actor ? { 'x-actor': actor } : {}) }, body: JSON.stringify(body) }) as RequestInit;

function BloomPicker({ value, onChange, name }: { value: string[]; onChange: (v: string[]) => void; name: string }) {
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
      <legend style={labelStyle}>Bậc Bloom</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {BLOOMS.map((b) => (
          <label key={b} style={{ fontSize: 16, display: 'flex', gap: 6, alignItems: 'center', minHeight: 44 }}>
            <input
              type="checkbox"
              name={name}
              checked={value.includes(b)}
              onChange={(e) => onChange(e.target.checked ? [...value, b] : value.filter((x) => x !== b))}
              style={{ width: 20, height: 20 }}
            />
            {b}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Sections({ sections }: { sections: Section[] }) {
  return (
    <div>
      {sections.map((s) => (
        <section key={s.heading} style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 18, color: NAVY, margin: '0 0 6px' }}>{s.heading}</h3>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 16, lineHeight: 1.6 }}>{s.body}</div>
        </section>
      ))}
    </div>
  );
}

function MatrixTable({ m }: { m: Matrix }) {
  const cell = (c?: Cell) => (c && (c.target || c.selected) ? `${c.selected}/${c.target} câu · ${c.points}đ` : '–');
  const td = { padding: '8px 10px', borderBottom: '1px solid #e1e3ee', fontSize: 16 } as const;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table aria-label="Ma trận đề kiểm tra theo TT 22/2021" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640, background: '#fff' }}>
        <thead>
          <tr style={{ background: NAVY, color: '#fff', textAlign: 'left' }}>
            <th scope="col" style={td}>Chủ đề / Nguyên tử</th>
            {LEVELS.map(([k, l]) => <th key={k} scope="col" style={td}>{l}</th>)}
            <th scope="col" style={td}>Tổng</th>
          </tr>
        </thead>
        <tbody>
          {m.rows.map((r) => (
            <tr key={r.atomId}>
              <th scope="row" style={{ ...td, textAlign: 'left' }}>{r.atomCode} — {r.title}</th>
              {LEVELS.map(([k]) => <td key={k} style={td}>{cell(r.cells[k])}</td>)}
              <td style={td}>{r.totalSelected} câu · {r.points}đ</td>
            </tr>
          ))}
          <tr style={{ background: YELLOW, fontWeight: 800 }}>
            <th scope="row" style={{ ...td, textAlign: 'left' }}>Tổng</th>
            {LEVELS.map(([k]) => <td key={k} style={td}>{cell(m.totals[k])}</td>)}
            <td style={td}>{m.totalSelected}/{m.totalTarget} câu · 10đ</td>
          </tr>
        </tbody>
      </table>
      {m.shortfall.length > 0 && (
        <div role="alert" style={{ marginTop: 10, padding: 12, background: '#fff8d6', border: `1px solid ${YELLOW}`, borderRadius: 8, fontSize: 16 }}>
          <b>Ngân hàng chưa đủ câu (không tự bịa câu hỏi):</b>
          <ul style={{ margin: '6px 0 0 20px' }}>{m.shortfall.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}
    </div>
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
  const [sections, setSections] = useState<Section[]>([]);

  const run = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api<{ quiz: { sections: Section[] } }>('/api/assessment/quiz', post('/api/assessment/quiz', { atomId: lesson?.id ?? '', bloomLevels: bloom, language, style, count }));
      setSections(r.quiz.sections);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Lỗi'); setSections([]); } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p style={{ fontSize: 16, margin: 0 }}>Sinh tại chỗ từ ngân hàng câu hỏi, dùng ngay trong giờ. Không cần duyệt, không lưu lại, sinh lại không giới hạn.</p>
      <LessonField value={lesson} onChange={setLesson} />
      <BloomPicker value={bloom} onChange={setBloom} name="quiz-bloom" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <div><label htmlFor="q-count" style={labelStyle}>Số câu (tối đa 10)</label>
          <input id="q-count" type="number" min={1} max={10} style={inputStyle} value={count} onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 5)))} /></div>
        <div><label htmlFor="q-lang" style={labelStyle}>Ngôn ngữ</label>
          <select id="q-lang" style={inputStyle} value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="vi">Tiếng Việt</option><option value="en">Tiếng Anh</option><option value="song_ngu">Song ngữ</option></select></div>
        <div><label htmlFor="q-style" style={labelStyle}>Phong cách</label>
          <input id="q-style" style={inputStyle} value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Ví dụ: ngắn gọn" /></div>
      </div>
      <div><button type="button" style={btnStyle()} onClick={run} disabled={busy || !lesson}>{busy ? 'Đang sinh…' : 'Sinh quiz'}</button></div>
      {err && <div role="alert" style={{ color: '#b00020', fontSize: 16 }}>{err}</div>}
      {sections.length > 0 && <div className="card" style={{ background: '#fff', padding: 16, borderRadius: 10 }}><Sections sections={sections} /></div>}
    </div>
  );
}

function ExamTab() {
  const [actor, setActor] = useState('');
  const [lessons, setLessons] = useState<AtomLite[]>([]);
  const [bloom, setBloom] = useState<string[]>(['Nhớ', 'Hiểu', 'Vận dụng']);
  const [language, setLanguage] = useState('vi');
  const [examDate, setExamDate] = useState('');
  const [reviewers, setReviewers] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [note, setNote] = useState('');
  const [exam, setExam] = useState<Exam | null>(null);
  const [list, setList] = useState<Exam[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(''); setMsg('');
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'Lỗi'); } finally { setBusy(false); }
  };

  const load = useCallback(async (examId: string, who: string) => {
    const r = await api<{ exam: Exam }>(`/api/assessment/exam?examId=${encodeURIComponent(examId)}`, { headers: who ? { 'x-actor': who } : {} });
    setExam(r.exam);
  }, []);

  const refreshList = () => guard(async () => {
    const r = await api<{ exams: Exam[] }>('/api/assessment/exams');
    setList(r.exams);
  });

  const create = () => guard(async () => {
    const ids = lessons.map((l) => l.id);
    const body = { atomIds: ids, bloomLevels: bloom, language, createdBy: actor.trim(), ...(examDate ? { examDate } : {}) };
    const r = await api<{ exam: { examId: string } }>('/api/assessment/exam', post('/api/assessment/exam', body));
    await load(r.exam.examId, actor.trim());
    setMsg(`Đã tạo đề ${r.exam.examId} ở trạng thái nháp.`);
  });

  const submit = () => guard(async () => {
    if (!exam) return;
    const rv = reviewers.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
    await api('/api/assessment/exam/submit', post('/api/assessment/exam/submit', { examId: exam.examId, actor: actor.trim(), ...(rv.length ? { reviewers: rv } : {}) }, actor.trim()));
    await load(exam.examId, actor.trim());
    setMsg('Đã gửi tổ chuyên môn duyệt.');
  });

  const review = (decision: 'duyet' | 'tu_choi') => guard(async () => {
    if (!exam) return;
    await api('/api/assessment/exam/review', post('/api/assessment/exam/review', { examId: exam.examId, reviewer: reviewer.trim(), decision, note }, reviewer.trim()));
    await load(exam.examId, reviewer.trim());
    setMsg(decision === 'duyet' ? 'Đã duyệt đề.' : 'Đã từ chối đề.');
  });

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div role="note" style={{ padding: 14, background: '#fff', borderLeft: `6px solid ${YELLOW}`, borderRadius: 8, fontSize: 16, lineHeight: 1.55 }}>
        <b>Bảo mật đề:</b> nội dung câu hỏi và đáp án chỉ người soạn và tổ chuyên môn được xem trước ngày thi. Mọi lần xem đều ghi <b>nhật ký truy cập</b>.
        {' '}<b>Chống trùng 3 năm:</b> câu đã dùng trong đề được duyệt sẽ không được rút lại trong vòng 3 năm.
        {' '}Tên người thao tác hiện chỉ là khai báo, chưa phải đăng nhập thật (sẽ bổ sung sau).
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        <div><label htmlFor="e-actor" style={labelStyle}>Tên người soạn / thao tác</label>
          <input id="e-actor" style={inputStyle} value={actor} onChange={(e) => setActor(e.target.value)} /></div>
        <div><label htmlFor="e-date" style={labelStyle}>Ngày thi (tuỳ chọn)</label>
          <input id="e-date" type="date" style={inputStyle} value={examDate} onChange={(e) => setExamDate(e.target.value)} /></div>
        <div><label htmlFor="e-lang" style={labelStyle}>Ngôn ngữ</label>
          <select id="e-lang" style={inputStyle} value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="vi">Tiếng Việt</option><option value="en">Tiếng Anh</option><option value="song_ngu">Song ngữ</option></select></div>
      </div>
      <LessonMultiField value={lessons} onChange={setLessons} />
      <BloomPicker value={bloom} onChange={setBloom} name="exam-bloom" />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" style={btnStyle()} onClick={create} disabled={busy || !actor.trim() || lessons.length === 0}>Lập ma trận &amp; sinh đề nháp</button>
        <button type="button" style={btnStyle(false)} onClick={refreshList} disabled={busy}>Tải danh sách đề</button>
      </div>
      {err && <div role="alert" style={{ color: '#b00020', fontSize: 16 }}>{err}</div>}
      {msg && <div role="status" style={{ color: '#1b6e3a', fontSize: 16 }}>{msg}</div>}

      {list.length > 0 && (
        <ul aria-label="Danh sách đề" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {list.map((e) => (
            <li key={e.examId}>
              <button type="button" style={{ ...btnStyle(false), width: '100%', textAlign: 'left' }} onClick={() => guard(() => load(e.examId, actor.trim()))}>
                {e.examId} · {STATUS_LABEL[e.status] ?? e.status} · {e.createdBy}{e.examDate ? ` · thi ${e.examDate}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}

      {exam && (
        <div style={{ background: BG, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 20, color: NAVY, margin: 0 }}>{exam.examId}</h2>
            <span style={{ background: YELLOW, color: NAVY, fontWeight: 800, padding: '4px 12px', borderRadius: 999, fontSize: 16 }}>{STATUS_LABEL[exam.status] ?? exam.status}</span>
            {exam.examDate && <span style={{ fontSize: 16 }}>Ngày thi: {exam.examDate}</span>}
          </div>
          <MatrixTable m={exam.matrix} />

          {(exam.status === 'nhap' || exam.status === 'tu_choi') && (
            <div style={{ display: 'grid', gap: 8 }}>
              <label htmlFor="e-rv" style={labelStyle}>Tổ chuyên môn được giao duyệt (tuỳ chọn, cách nhau bằng dấu phẩy)</label>
              <input id="e-rv" style={inputStyle} value={reviewers} onChange={(e) => setReviewers(e.target.value)} />
              <div><button type="button" style={btnStyle()} onClick={submit} disabled={busy || !actor.trim()}>Gửi tổ chuyên môn duyệt</button></div>
            </div>
          )}
          {exam.status === 'cho_duyet' && (
            <div style={{ display: 'grid', gap: 8 }}>
              <label htmlFor="e-reviewer" style={labelStyle}>Người duyệt (tổ chuyên môn)</label>
              <input id="e-reviewer" style={inputStyle} value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
              <label htmlFor="e-note" style={labelStyle}>Ý kiến / lý do (bắt buộc khi từ chối)</label>
              <textarea id="e-note" rows={3} style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" style={btnStyle()} onClick={() => review('duyet')} disabled={busy || !reviewer.trim()}>Duyệt đề</button>
                <button type="button" style={btnStyle(false)} onClick={() => review('tu_choi')} disabled={busy || !reviewer.trim()}>Từ chối</button>
              </div>
            </div>
          )}

          {exam.approvals && exam.approvals.length > 0 && (
            <div style={{ fontSize: 16 }}><b>Lịch sử duyệt:</b>
              <ul style={{ margin: '4px 0 0 20px' }}>{exam.approvals.map((a, i) => <li key={i}>{a.at} · {a.reviewer} · {a.decision === 'duyet' ? 'duyệt' : 'từ chối'}{a.note ? ` · ${a.note}` : ''}</li>)}</ul></div>
          )}

          {exam.locked ? (
            <div role="alert" style={{ padding: 12, background: '#fff', border: '1px solid #c9ccdb', borderRadius: 8, fontSize: 16 }}>
              Nội dung đề đang được khoá. {exam.lockedReason}
            </div>
          ) : exam.sections ? (
            <div style={{ background: '#fff', padding: 16, borderRadius: 10 }}><Sections sections={exam.sections} /></div>
          ) : null}

          {exam.accessLog && (
            <details open>
              <summary style={{ fontSize: 16, fontWeight: 700, color: NAVY, cursor: 'pointer' }}>Nhật ký truy cập ({exam.accessLog.length})</summary>
              <ul style={{ margin: '6px 0 0 20px', fontSize: 16 }}>
                {exam.accessLog.map((l, i) => <li key={i}>{l.at} · {l.actor} · {l.action}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export default function KiemTraPage() {
  const [tab, setTab] = useState<'A' | 'B'>('A');
  const tabBtn = (id: 'A' | 'B', label: string) => (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={tab === id}
      aria-controls={`panel-${id}`}
      onClick={() => setTab(id)}
      style={{
        fontSize: 16, fontWeight: 800, padding: '12px 16px', minHeight: 44, cursor: 'pointer', borderRadius: 8,
        border: `2px solid ${NAVY}`, background: tab === id ? NAVY : '#fff', color: tab === id ? '#fff' : NAVY,
      }}
    >
      {label}
    </button>
  );
  return (
    <Shell
      title="Kiểm tra & Đánh giá"
      subtitle="Hai nhánh đánh giá dùng chung ngân hàng câu hỏi nhưng khác quy trình duyệt."
    >
      <div style={{ display: 'grid', gap: 16, background: BG }}>
        <div role="tablist" aria-label="Nhánh đánh giá" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {tabBtn('A', 'A · Quiz củng cố (không cần duyệt)')}
          {tabBtn('B', 'B · Đề kiểm tra định kỳ (cần tổ chuyên môn duyệt)')}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'A' ? <QuizTab /> : <ExamTab />}
        </div>
      </div>
    </Shell>
  );
}
