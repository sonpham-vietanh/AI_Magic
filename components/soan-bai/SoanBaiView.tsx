'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CLASS_PROFILES } from '@/lib/classes/profiles';
import { buildDocxBlob, downloadBlob } from '@/lib/export/docx';
import {
  BLOOM_CHOICES,
  FORMAT_OPTIONS,
  NGON_NGU_OPTIONS,
  PHONG_CACH_OPTIONS,
  bloomPreview,
  buildFinalText,
  buildParams,
  formatApiError,
  formatGuardrail,
  textToSections,
  validateForm,
  type NgonNgu,
  type SoanBaiForm,
} from '@/lib/ui/soanBai';

interface Atom {
  id: string;
  code?: string;
  title: string;
  chapter?: string;
  lesson?: string;
  hasFactoryPackage?: boolean;
  factoryAssetCount?: number;
}
interface RunResult {
  runId: string;
  workflow?: string;
  bloomLevels: string[];
  standard: { status: 'approved' | 'chua_duyet' | 'khong_co'; atomId?: string; title?: string; reviewedBy?: string };
  warnings: string[];
  content: { sections: { heading: string; body: string }[]; markdown: string };
  reflection: {
    scores: { id: string; name: string; score: number; note: string }[];
    average: number;
    issues: string[];
    skipped?: boolean;
  };
  guardrail?: { ok: boolean; reasons: string[] };
  requiresApproval: boolean;
}

const LS_KEY = 'soanBai.params.v1';
const NAVY = '#26275D';
const YELLOW = '#F9DD0E';
const RED = '#DF2526';

const todayStr = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const initialForm = (): SoanBaiForm => ({
  ngayDay: todayStr(),
  baiDayId: '',
  bloomThapNhat: '',
  ngonNgu: 'vi',
  phongCach: 'truyen_thong',
  formatDauRa: 'ke_hoach',
  classId: '',
  suKien: { bat: false, tieuDe: '', url: '', ngayDang: '', noiDung: '' },
});

export function SoanBaiView() {
  const [form, setForm] = useState<SoanBaiForm>(initialForm);
  const [atoms, setAtoms] = useState<Atom[]>([]);
  const [atomsErr, setAtomsErr] = useState('');
  const [q, setQ] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stdStatus, setStdStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [apiError, setApiError] = useState('');
  const [result, setResult] = useState<RunResult | null>(null);
  const [text, setText] = useState('');
  const [approved, setApproved] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Khôi phục tham số lần trước
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<SoanBaiForm>;
        setForm((f) => ({ ...f, ...saved, ngayDay: f.ngayDay, suKien: { ...f.suKien, ...(saved.suKien || {}) } }));
      }
    } catch {
      /* bỏ qua */
    }
  }, []);

  // Tải danh sách bài (Toán 10)
  useEffect(() => {
    const c = new AbortController();
    const qs = new URLSearchParams({ subject: 'toan', grade: '10', limit: '200' });
    if (q.trim()) qs.set('q', q.trim());
    const t = setTimeout(() => {
      fetch(`/api/supabase/knowledge?${qs}`, { signal: c.signal })
        .then((r) => r.json())
        .then((d: { ok?: boolean; atoms?: Atom[]; error?: string }) => {
          if (!d.ok) throw new Error(d.error || 'Không tải được danh sách bài');
          const list = [...(d.atoms || [])].sort(
            (a, b) => Number(!!b.hasFactoryPackage) - Number(!!a.hasFactoryPackage),
          );
          setAtoms(list);
          setAtomsErr('');
        })
        .catch((e: unknown) => {
          if (c.signal.aborted) return;
          setAtomsErr(e instanceof Error ? e.message : 'Không tải được danh sách bài');
        });
    }, q ? 300 : 0);
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [q]);

  // Trạng thái bản chuẩn khi chọn bài (best effort)
  useEffect(() => {
    setStdStatus('');
    if (!form.baiDayId) return;
    const c = new AbortController();
    fetch(`/api/kho/standard?atomId=${encodeURIComponent(form.baiDayId)}`, { signal: c.signal })
      .then((r) => r.json())
      .then((d: { ok?: boolean; lesson?: { status?: string } }) => {
        if (d.ok && d.lesson?.status) setStdStatus(d.lesson.status);
      })
      .catch(() => {});
    return () => c.abort();
  }, [form.baiDayId]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const set = <K extends keyof SoanBaiForm>(k: K, v: SoanBaiForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setSk = (k: keyof SoanBaiForm['suKien'], v: string | boolean) =>
    setForm((f) => ({ ...f, suKien: { ...f.suKien, [k]: v } }));

  const selectedAtom = atoms.find((a) => a.id === form.baiDayId);
  const gradeClasses = useMemo(() => CLASS_PROFILES.filter((c) => String(c.grade) === '10'), []);
  const preview = bloomPreview(form.bloomThapNhat);

  async function run(regenerationOf?: string) {
    const errs = validateForm(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ ...form, baiDayId: form.baiDayId }));
    } catch {
      /* bỏ qua */
    }
    const cls = CLASS_PROFILES.find((c) => c.id === form.classId);
    const params = buildParams(form, {
      regenerationOf,
      teacher: cls ? { name: cls.homeroomTeacher.name, email: cls.homeroomTeacher.email } : undefined,
    });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setElapsed(0);
    setApiError('');
    setApproved('');
    if (!regenerationOf) setResult(null);
    const started = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    try {
      const res = await fetch('/api/workflows/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params }),
        signal: ctrl.signal,
      });
      let data: { ok?: boolean; result?: RunResult; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        /* không phải JSON */
      }
      if (!res.ok || !data.ok || !data.result) {
        setApiError(formatApiError(res.status, data.error));
      } else {
        setResult(data.result);
        setText(buildFinalText(data.result.content.sections, data.result.content.markdown));
      }
    } catch (e) {
      if (ctrl.signal.aborted) setApiError('Đã hủy yêu cầu.');
      else setApiError('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
      void e;
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setLoading(false);
    }
  }

  async function approve() {
    if (!result) return;
    setApproved('Đã ghi nhận: bạn duyệt bản này để dạy.');
    try {
      const r = await fetch('/api/signals/final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: result.runId, finalText: text, accepted: true }),
      });
      const d = (await r.json()) as { ok?: boolean; diffRatio?: number };
      if (d.ok && typeof d.diffRatio === 'number') {
        setApproved(
          `Đã duyệt. Bạn đã chỉnh khoảng ${Math.round(d.diffRatio * 100)}% so với bản AI (tín hiệu đã được ghi lại).`,
        );
      }
    } catch {
      /* best effort */
    }
  }

  async function exportDocx() {
    if (!result) return;
    const secs = textToSections(text, result.content.sections.map((s) => s.heading));
    const blob = await buildDocxBlob({
      title: (selectedAtom?.title || 'Học liệu bài dạy').toUpperCase(),
      subtitle: [`Ngày dạy: ${form.ngayDay}`, `Bậc Bloom: ${result.bloomLevels.join(' → ')}`],
      sections: secs,
    });
    downloadBlob(blob, `soan-bai-${form.ngayDay}.docx`);
  }

  const std = result?.standard.status ?? (stdStatus as 'approved' | 'chua_duyet' | 'khong_co' | '');

  return (
    <div className="sb-root">
      <style>{CSS}</style>
      <form
        className="sb-form"
        noValidate
        aria-label="Biểu mẫu soạn bài từ Kho"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <h2 className="sb-h2">Thông số bài dạy</h2>

        <label className="sb-label" htmlFor="sb-date">1. Ngày dạy *</label>
        <input id="sb-date" type="date" className="sb-input" value={form.ngayDay} onChange={(e) => set('ngayDay', e.target.value)} aria-invalid={!!errors.ngayDay} />
        {errors.ngayDay && <p className="sb-err" role="alert">{errors.ngayDay}</p>}

        <label className="sb-label" htmlFor="sb-search">2. Bài dạy (theo PPCT) * — Toán lớp 10</label>
        <input id="sb-search" className="sb-input" placeholder="Tìm bài…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm bài dạy" />
        <select
          id="sb-bai"
          className="sb-input"
          size={6}
          value={form.baiDayId}
          onChange={(e) => set('baiDayId', e.target.value)}
          aria-label="Chọn bài dạy"
          aria-invalid={!!errors.baiDayId}
        >
          {atoms.map((a) => (
            <option key={a.id} value={a.id}>
              {a.hasFactoryPackage ? '★ Có bản chuẩn · ' : ''}
              {[a.chapter, a.title].filter(Boolean).join(' › ')}
            </option>
          ))}
        </select>
        {atomsErr && <p className="sb-err" role="alert">{atomsErr}</p>}
        {errors.baiDayId && <p className="sb-err" role="alert">{errors.baiDayId}</p>}
        {selectedAtom && (
          <p className="sb-note">
            Đã chọn: <strong>{selectedAtom.title}</strong>{' '}
            {selectedAtom.hasFactoryPackage && <span className="sb-badge ok">Có bản chuẩn</span>}{' '}
            {stdStatus === 'approved' && <span className="sb-badge ok">Chuẩn đã duyệt</span>}
            {stdStatus === 'chua_duyet' && <span className="sb-badge warn">Chuẩn chưa duyệt</span>}
            {stdStatus === 'khong_co' && <span className="sb-badge bad">Chưa có bản chuẩn</span>}
          </p>
        )}

        <fieldset className="sb-fs">
          <legend className="sb-label">3. Bậc Bloom thấp nhất *</legend>
          <div className="sb-cards">
            {BLOOM_CHOICES.map((b) => (
              <label key={b.value} className={`sb-card${form.bloomThapNhat === b.value ? ' on' : ''}`}>
                <input type="radio" name="bloom" value={b.value} checked={form.bloomThapNhat === b.value} onChange={() => set('bloomThapNhat', b.value)} />
                <strong>{b.label}</strong>
                <span>{b.hint}</span>
              </label>
            ))}
          </div>
          {errors.bloomThapNhat && <p className="sb-err" role="alert">{errors.bloomThapNhat}</p>}
          {preview.length > 0 && (
            <div className="sb-preview" aria-live="polite">
              <span>Bạn sẽ dạy ở các bậc:</span>
              {preview.map((p, i) => (
                <span key={p} className={`sb-chip${p === 'Phân tích' ? ' key' : ''}`}>
                  {p}
                  {i < preview.length - 1 && <em aria-hidden="true"> →</em>}
                </span>
              ))}
            </div>
          )}
        </fieldset>

        <label className="sb-label" htmlFor="sb-lang">4. Ngôn ngữ</label>
        <select id="sb-lang" className="sb-input" value={form.ngonNgu} onChange={(e) => set('ngonNgu', e.target.value as NgonNgu)}>
          {NGON_NGU_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <fieldset className="sb-fs">
          <legend className="sb-label">5. Phong cách dạy *</legend>
          <div className="sb-cards">
            {PHONG_CACH_OPTIONS.map((p) => (
              <label key={p.value} className={`sb-card${form.phongCach === p.value ? ' on' : ''}`}>
                <input type="radio" name="phongCach" value={p.value} checked={form.phongCach === p.value} onChange={() => set('phongCach', p.value)} />
                <strong>{p.label}</strong>
                <span>{p.hint}</span>
              </label>
            ))}
          </div>
          {errors.phongCach && <p className="sb-err" role="alert">{errors.phongCach}</p>}
        </fieldset>

        <details className="sb-details" open={form.suKien.bat} onToggle={(e) => setSk('bat', (e.currentTarget as HTMLDetailsElement).open)}>
          <summary>6. Sự kiện thời sự (tuỳ chọn)</summary>
          <p className="sb-note warnbox">
            Chỉ nguồn trong danh sách trắng (VnExpress, Tuổi Trẻ, Thanh Niên, VTV, Reuters/AP); không dùng sự kiện &lt;48 giờ; tiết gắn thời sự bắt buộc người duyệt.
          </p>
          <label className="sb-label" htmlFor="sk-t">Tiêu đề bài báo</label>
          <input id="sk-t" className="sb-input" value={form.suKien.tieuDe} onChange={(e) => setSk('tieuDe', e.target.value)} />
          {errors.suKienTieuDe && <p className="sb-err" role="alert">{errors.suKienTieuDe}</p>}
          <label className="sb-label" htmlFor="sk-u">Đường dẫn (URL)</label>
          <input id="sk-u" type="url" className="sb-input" placeholder="https://…" value={form.suKien.url} onChange={(e) => setSk('url', e.target.value)} />
          {errors.suKienUrl && <p className="sb-err" role="alert">{errors.suKienUrl}</p>}
          <label className="sb-label" htmlFor="sk-d">Ngày đăng</label>
          <input id="sk-d" type="date" className="sb-input" value={form.suKien.ngayDang} onChange={(e) => setSk('ngayDang', e.target.value)} />
          {errors.suKienNgay && <p className="sb-err" role="alert">{errors.suKienNgay}</p>}
          <label className="sb-label" htmlFor="sk-n">Tóm tắt nội dung (tuỳ chọn)</label>
          <textarea id="sk-n" className="sb-input" rows={3} value={form.suKien.noiDung} onChange={(e) => setSk('noiDung', e.target.value)} />
        </details>

        <label className="sb-label" htmlFor="sb-fmt">7. Định dạng đầu ra *</label>
        <select id="sb-fmt" className="sb-input" value={form.formatDauRa} onChange={(e) => set('formatDauRa', e.target.value)}>
          {FORMAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {errors.formatDauRa && <p className="sb-err" role="alert">{errors.formatDauRa}</p>}

        <label className="sb-label" htmlFor="sb-class">Lớp (tuỳ chọn)</label>
        <select id="sb-class" className="sb-input" value={form.classId} onChange={(e) => set('classId', e.target.value)}>
          <option value="">— Không chọn lớp —</option>
          {gradeClasses.map((c) => (
            <option key={c.id} value={c.id}>{c.className} · {c.campus}</option>
          ))}
        </select>

        {loading ? (
          <div className="sb-loading" role="status" aria-live="polite">
            <span>Đang soạn… {elapsed} giây</span>
            <button type="button" className="sb-btn ghost" onClick={() => abortRef.current?.abort()} aria-label="Hủy yêu cầu đang chạy">Hủy</button>
          </div>
        ) : (
          <button type="submit" className="sb-btn cta" aria-label="Soạn bài từ Kho">Soạn bài từ Kho</button>
        )}
        {apiError && (
          <div className="sb-banner bad" role="alert">
            {apiError.split('\n').map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}
      </form>

      <section className="sb-result" aria-label="Kết quả soạn bài" aria-live="polite">
        <h2 className="sb-h2">Kết quả</h2>
        {!result && !loading && <p className="sb-note">Điền biểu mẫu và bấm “Soạn bài từ Kho”. Bạn sẽ xem, chỉnh, duyệt rồi mới dạy.</p>}
        {std === 'approved' && result && (
          <div className="sb-banner ok">Bản chuẩn đã duyệt{result.standard.reviewedBy ? ` bởi ${result.standard.reviewedBy}` : ''}.</div>
        )}
        {std === 'chua_duyet' && <div className="sb-banner warn">Bản chuẩn chưa duyệt — chỉ là bản nháp, cần thẩm định trước khi dạy.</div>}
        {std === 'khong_co' && <div className="sb-banner bad">Không có bản chuẩn trong Kho cho bài này — nội dung do AI tự sinh, cần kiểm tra kỹ.</div>}

        {result && (
          <>
            {result.requiresApproval && (
              <div className="sb-banner warn"><strong>Cần người duyệt trước khi dùng</strong> (tiết có gắn thời sự).</div>
            )}
            {result.guardrail && !result.guardrail.ok && (
              <div className="sb-banner bad">{formatGuardrail(result.guardrail.reasons).map((l, i) => <div key={i}>{l}</div>)}</div>
            )}
            {result.warnings.length > 0 && (
              <ul className="sb-warnlist" aria-label="Cảnh báo">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            <p className="sb-note">Bậc Bloom: {result.bloomLevels.join(' → ')}</p>

            <h3 className="sb-h3">Nội dung (xem trước)</h3>
            <div className="sb-sections">
              {result.content.sections.map((s, i) => (
                <article key={i} className="sb-sec">
                  <h4>{s.heading}</h4>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{s.body}</p>
                </article>
              ))}
            </div>

            <label className="sb-label" htmlFor="sb-edit">Chỉnh sửa toàn văn trước khi duyệt</label>
            <textarea id="sb-edit" className="sb-input sb-edit" rows={16} value={text} onChange={(e) => setText(e.target.value)} />

            <div className="sb-actions">
              <button type="button" className="sb-btn" onClick={() => void run(result.runId)} disabled={loading} aria-label="Sinh lại">Sinh lại</button>
              <button type="button" className="sb-btn cta" onClick={() => void approve()} aria-label="Duyệt và dùng">Duyệt &amp; dùng</button>
              <button type="button" className="sb-btn" onClick={() => void exportDocx()} aria-label="Tải file docx">Tải .docx</button>
              <button type="button" className="sb-btn" onClick={() => window.print()} aria-label="In">In</button>
            </div>
            {approved && <div className="sb-banner ok" role="status">{approved}</div>}

            <h3 className="sb-h3">AI tự soi (6 tiêu chí)</h3>
            {result.reflection.skipped ? (
              <p className="sb-note">AI chưa tự soi được — hãy đọc kỹ trước khi duyệt.</p>
            ) : (
              <div className="sb-refl">
                {result.reflection.scores.map((s) => (
                  <div key={s.id} className="sb-bar">
                    <div className="sb-bar-top"><span>{s.name}</span><strong>{s.score}/10</strong></div>
                    <div className="sb-track" role="img" aria-label={`${s.name}: ${s.score} trên 10`}>
                      <div className="sb-fill" style={{ width: `${Math.max(0, Math.min(10, s.score)) * 10}%`, background: s.score >= 7 ? NAVY : s.score >= 5 ? '#b58900' : RED }} />
                    </div>
                    {s.note && <small>{s.note}</small>}
                  </div>
                ))}
                <p><strong>Điểm trung bình: {result.reflection.average}</strong></p>
                {result.reflection.issues.length > 0 && (
                  <ul className="sb-warnlist">{result.reflection.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

const CSS = `
.sb-root{display:grid;gap:20px;grid-template-columns:1fr;font-size:16px;color:#1c1d3a}
@media(min-width:1000px){.sb-root{grid-template-columns:minmax(340px,440px) 1fr;align-items:start}}
.sb-form,.sb-result{background:#fff;border:1px solid #dfe1ee;border-radius:12px;padding:16px;min-width:0}
.sb-h2{color:${NAVY};font-size:20px;margin:0 0 8px}
.sb-h3{color:${NAVY};font-size:17px;margin:16px 0 6px}
.sb-label{display:block;font-weight:700;margin:14px 0 6px;color:${NAVY};font-size:16px}
.sb-input{width:100%;font-size:16px;padding:10px 12px;border:1px solid #b9bcd6;border-radius:8px;background:#fff;font-family:inherit;box-sizing:border-box}
.sb-edit{line-height:1.5}
.sb-fs{border:0;padding:0;margin:0;min-width:0}
.sb-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}
.sb-card{position:relative;display:flex;flex-direction:column;gap:2px;padding:10px 12px;border:2px solid #dfe1ee;border-radius:10px;cursor:pointer;background:#F5F6FA}
.sb-card input{position:absolute;opacity:0;inset:0;cursor:pointer}
.sb-card span{font-size:14px;color:#555873}
.sb-card.on{border-color:${NAVY};background:#fff;box-shadow:0 0 0 2px ${YELLOW}}
.sb-card:focus-within{outline:3px solid ${NAVY};outline-offset:2px}
.sb-preview{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px}
.sb-chip{background:${NAVY};color:#fff;border-radius:999px;padding:4px 12px;font-weight:600}
.sb-chip.key{background:${YELLOW};color:${NAVY}}
.sb-chip em{font-style:normal;margin-left:6px;opacity:.7}
.sb-details{margin-top:14px;border:1px solid #dfe1ee;border-radius:10px;padding:8px 12px;background:#F5F6FA}
.sb-details summary{cursor:pointer;font-weight:700;color:${NAVY}}
.sb-note{font-size:15px;color:#40425f;margin:8px 0}
.warnbox{background:#fff8d6;border-left:4px solid ${YELLOW};padding:8px 10px;border-radius:6px}
.sb-err{color:${RED};font-size:15px;margin:4px 0}
.sb-badge{font-size:14px;font-weight:700;padding:2px 8px;border-radius:999px}
.sb-badge.ok{background:#dff5e3;color:#14612a}.sb-badge.warn{background:#fff0c2;color:#7a5600}.sb-badge.bad{background:#fde0e0;color:${RED}}
.sb-btn{font-size:16px;font-weight:700;padding:10px 18px;min-height:44px;border-radius:8px;border:2px solid ${NAVY};background:#fff;color:${NAVY};cursor:pointer}
.sb-btn.cta{background:${YELLOW};border-color:${YELLOW};color:${NAVY}}
.sb-btn.ghost{background:transparent}
.sb-btn:disabled{opacity:.5;cursor:not-allowed}
.sb-form>.sb-btn.cta{width:100%;margin-top:18px}
.sb-btn:focus-visible,.sb-input:focus-visible,.sb-details summary:focus-visible{outline:3px solid ${NAVY};outline-offset:2px}
.sb-loading{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:18px;padding:10px 12px;background:#F5F6FA;border-radius:8px;font-weight:600}
.sb-banner{padding:10px 14px;border-radius:8px;margin:10px 0;font-size:16px;border-left:5px solid}
.sb-banner.ok{background:#e6f7ea;border-color:#1f8a3b;color:#14612a}
.sb-banner.warn{background:#fff4d1;border-color:#d99a00;color:#6b4a00}
.sb-banner.bad{background:#fde8e8;border-color:${RED};color:#8f1516}
.sb-warnlist{margin:8px 0;padding-left:20px;color:#6b4a00}
.sb-sections{display:grid;gap:10px}
.sb-sec{background:#F5F6FA;border-radius:8px;padding:10px 14px}
.sb-sec h4{margin:0 0 4px;color:${NAVY};font-size:16px}
.sb-sec p{margin:0}
.sb-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.sb-refl{display:grid;gap:10px}
.sb-bar-top{display:flex;justify-content:space-between;gap:8px}
.sb-track{height:10px;background:#e4e6f2;border-radius:6px;overflow:hidden}
.sb-fill{height:100%}
.sb-bar small{color:#555873;font-size:14px}
@media print{.sb-form,.sb-actions{display:none}.sb-root{display:block}}
`;
