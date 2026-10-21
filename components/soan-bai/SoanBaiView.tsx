'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CLASS_PROFILES } from '@/lib/classes/profiles';
import { buildDocxBlob, downloadBlob } from '@/lib/export/docx';
import { Icon } from '@/components/ui/icons';
import { LessonField } from '@/components/agent/LessonField';
import { classifyLine } from '@/components/agent/Canvas';
import type { AtomLite } from '@/components/agent/types';
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
import '@/app/ui-sb.css';

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

function Group({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="sb-group" aria-label={`${n}. ${title}`}>
      <h3 className="sb-gh"><span className="sb-num" aria-hidden="true">{n}</span>{title}</h3>
      {children}
    </section>
  );
}

function Err({ msg }: { msg?: string }) {
  return msg ? <p className="sb-err" role="alert">{msg}</p> : null;
}

function DocText({ text }: { text: string }) {
  return (
    <>
      {text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((l, i) => (l.trim() === '' ? null : <p key={i} className={`ag-line ${classifyLine(l)}`}>{l.trim()}</p>))}
    </>
  );
}

export function SoanBaiView() {
  const [form, setForm] = useState<SoanBaiForm>(initialForm);
  const [lesson, setLesson] = useState<AtomLite | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stdStatus, setStdStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [apiError, setApiError] = useState('');
  const [result, setResult] = useState<RunResult | null>(null);
  const [text, setText] = useState('');
  const [approved, setApproved] = useState('');
  const [tab, setTab] = useState<'doc' | 'edit' | 'soi'>('doc');
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Khôi phục tham số lần trước (bài dạy luôn chọn lại)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<SoanBaiForm>;
        setForm((f) => ({ ...f, ...saved, baiDayId: '', ngayDay: f.ngayDay, suKien: { ...f.suKien, ...(saved.suKien || {}) } }));
      }
    } catch {
      /* bỏ qua */
    }
  }, []);

  const pickLesson = (a: AtomLite | null) => {
    setLesson(a);
    setForm((f) => ({ ...f, baiDayId: a?.id ?? '' }));
  };

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
        setTab('doc');
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
      title: (lesson?.title || 'Học liệu bài dạy').toUpperCase(),
      subtitle: [`Ngày dạy: ${form.ngayDay}`, `Bậc Bloom: ${result.bloomLevels.join(' → ')}`],
      sections: secs,
    });
    downloadBlob(blob, `soan-bai-${form.ngayDay}.docx`);
  }

  const std = result?.standard.status ?? (stdStatus as 'approved' | 'chua_duyet' | 'khong_co' | '');
  const stdBadge =
    stdStatus === 'approved' ? <span className="ag-status ok">Chuẩn đã duyệt</span>
    : stdStatus === 'chua_duyet' ? <span className="ag-status draft">Chuẩn chưa duyệt</span>
    : stdStatus === 'khong_co' ? <span className="ag-status bad">Chưa có bản chuẩn</span>
    : null;

  return (
    <div className="sb-root">
      <form
        className="sb-form ag-card"
        noValidate
        aria-label="Biểu mẫu soạn bài"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <p className="sb-try">
          <Link href="/" className="ag-link">Thử trợ lý trò chuyện</Link>
          <span> để soạn bằng cách hỏi đáp.</span>
        </p>

        <Group n={1} title="Bài và ngày dạy">
          <LessonField value={lesson} onChange={pickLesson} label="Bài dạy theo PPCT *" />
          <Err msg={errors.baiDayId} />
          {lesson && (
            <p className="sb-meta">
              {lesson.hasFactoryPackage && <span className="ag-status ok">Có bản chuẩn</span>}
              {stdBadge}
            </p>
          )}
          <label className="ag-field-label" htmlFor="sb-date">Ngày dạy *</label>
          <input id="sb-date" type="date" className="ag-field" value={form.ngayDay} onChange={(e) => set('ngayDay', e.target.value)} aria-invalid={!!errors.ngayDay} />
          <Err msg={errors.ngayDay} />
        </Group>

        <Group n={2} title="Mức tư duy thấp nhất">
          <fieldset className="sb-fs">
            <legend className="sb-sr">Bậc Bloom thấp nhất</legend>
            <div className="sb-opts sb-opts3">
              {BLOOM_CHOICES.map((b) => (
                <label key={b.value} className={`sb-opt${form.bloomThapNhat === b.value ? ' on' : ''}`}>
                  <input type="radio" name="bloom" value={b.value} checked={form.bloomThapNhat === b.value} onChange={() => set('bloomThapNhat', b.value)} />
                  <strong>{b.label}</strong>
                  <span>{b.hint}</span>
                </label>
              ))}
            </div>
            <Err msg={errors.bloomThapNhat} />
            {preview.length > 0 && (
              <div className="sb-preview" aria-live="polite">
                <span>Các bậc sẽ dạy:</span>
                {preview.map((p) => (
                  <span key={p} className={`sb-chip${p === 'Phân tích' ? ' key' : ''}`}>{p}</span>
                ))}
              </div>
            )}
          </fieldset>
        </Group>

        <Group n={3} title="Phong cách dạy">
          <fieldset className="sb-fs">
            <legend className="sb-sr">Phong cách dạy</legend>
            <div className="sb-opts">
              {PHONG_CACH_OPTIONS.map((p) => (
                <label key={p.value} className={`sb-opt${form.phongCach === p.value ? ' on' : ''}`}>
                  <input type="radio" name="phongCach" value={p.value} checked={form.phongCach === p.value} onChange={() => set('phongCach', p.value)} />
                  <strong>{p.label}</strong>
                  <span>{p.hint}</span>
                </label>
              ))}
            </div>
            <Err msg={errors.phongCach} />
          </fieldset>
        </Group>

        <Group n={4} title="Ngôn ngữ và sản phẩm">
          <div className="ag-field-row sb-row">
            <div>
              <label className="ag-field-label" htmlFor="sb-lang">Ngôn ngữ</label>
              <select id="sb-lang" className="ag-field" value={form.ngonNgu} onChange={(e) => set('ngonNgu', e.target.value as NgonNgu)}>
                {NGON_NGU_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="ag-field-label" htmlFor="sb-fmt">Sản phẩm *</label>
              <select id="sb-fmt" className="ag-field" value={form.formatDauRa} onChange={(e) => set('formatDauRa', e.target.value)}>
                {FORMAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="ag-field-label" htmlFor="sb-class">Lớp (tuỳ chọn)</label>
              <select id="sb-class" className="ag-field" value={form.classId} onChange={(e) => set('classId', e.target.value)}>
                <option value="">Không chọn lớp</option>
                {gradeClasses.map((c) => <option key={c.id} value={c.id}>{c.className} · {c.campus}</option>)}
              </select>
            </div>
          </div>
          <Err msg={errors.formatDauRa} />
        </Group>

        <Group n={5} title="Thời sự (tuỳ chọn)">
          <details className="ag-more sb-more" open={form.suKien.bat} onToggle={(e) => setSk('bat', (e.currentTarget as HTMLDetailsElement).open)}>
            <summary>Gắn một bài báo vào tiết dạy</summary>
            <p className="ag-note">Chỉ nhận nguồn VnExpress, Tuổi Trẻ, Thanh Niên, VTV, Reuters/AP. Không dùng tin dưới 48 giờ. Tiết gắn thời sự cần người duyệt.</p>
            <label className="ag-field-label" htmlFor="sk-t">Tiêu đề bài báo</label>
            <input id="sk-t" className="ag-field" value={form.suKien.tieuDe} onChange={(e) => setSk('tieuDe', e.target.value)} />
            <Err msg={errors.suKienTieuDe} />
            <label className="ag-field-label" htmlFor="sk-u">Đường dẫn (URL)</label>
            <input id="sk-u" type="url" className="ag-field" placeholder="https://…" value={form.suKien.url} onChange={(e) => setSk('url', e.target.value)} />
            <Err msg={errors.suKienUrl} />
            <label className="ag-field-label" htmlFor="sk-d">Ngày đăng</label>
            <input id="sk-d" type="date" className="ag-field" value={form.suKien.ngayDang} onChange={(e) => setSk('ngayDang', e.target.value)} />
            <Err msg={errors.suKienNgay} />
            <label className="ag-field-label" htmlFor="sk-n">Tóm tắt (tuỳ chọn)</label>
            <textarea id="sk-n" className="ag-field" rows={3} value={form.suKien.noiDung} onChange={(e) => setSk('noiDung', e.target.value)} />
          </details>
        </Group>

        {loading ? (
          <div className="sb-loading" role="status" aria-live="polite">
            <span className="ag-run-title"><span className="ag-spin" aria-hidden="true" /> Đang soạn… <span className="ag-timer">{elapsed} giây</span></span>
            <button type="button" className="ag-btn small" onClick={() => abortRef.current?.abort()} aria-label="Hủy yêu cầu đang chạy">Hủy</button>
          </div>
        ) : (
          <button type="submit" className="ag-btn primary sb-go">
            <Icon name="sparkles" size={18} /> Soạn bài
          </button>
        )}
        {apiError && (
          <div className="ag-alert bad" role="alert">
            <Icon name="alert" size={18} />
            <div>{apiError.split('\n').map((l, i) => <div key={i}>{l}</div>)}</div>
          </div>
        )}
      </form>

      <section className="sb-result" aria-label="Kết quả soạn bài" aria-live="polite">
        {!result && !loading && (
          <div className="sb-empty">
            <Icon name="file" size={28} />
            <p>Điền biểu mẫu và bấm “Soạn bài”. Cô/thầy xem, chỉnh, duyệt rồi mới dạy.</p>
          </div>
        )}
        {!result && loading && (
          <div className="sb-empty">
            <span className="ag-spin" aria-hidden="true" />
            <p>Đang lấy bản chuẩn từ Kho và soạn nội dung. Thường mất khoảng một phút.</p>
          </div>
        )}

        {result && (
          <div className="ag-card sb-doc">
            <div className="sb-doc-head">
              <div>
                <h2>{lesson?.title || 'Bản soạn'}</h2>
                <p className="ag-note">Bậc: {result.bloomLevels.join(' → ')}</p>
              </div>
              {std === 'approved' && <span className="ag-status ok">Chuẩn đã duyệt</span>}
              {std === 'chua_duyet' && <span className="ag-status draft">Chuẩn chưa duyệt</span>}
              {std === 'khong_co' && <span className="ag-status bad">Chưa có bản chuẩn</span>}
            </div>

            {std === 'approved' && result.standard.reviewedBy && (
              <div className="ag-alert ok"><Icon name="check" size={18} /><div>Bản chuẩn đã duyệt bởi {result.standard.reviewedBy}.</div></div>
            )}
            {std === 'chua_duyet' && (
              <div className="ag-alert warn"><Icon name="alert" size={18} /><div>Bản chuẩn chưa duyệt, đây chỉ là bản nháp. Cần thẩm định trước khi dạy.</div></div>
            )}
            {std === 'khong_co' && (
              <div className="ag-alert bad"><Icon name="alert" size={18} /><div>Kho chưa có bản chuẩn cho bài này. Nội dung do AI tự sinh, cần kiểm tra kỹ.</div></div>
            )}
            {result.requiresApproval && (
              <div className="ag-alert warn"><Icon name="alert" size={18} /><div><strong>Cần người duyệt trước khi dùng</strong> (tiết có gắn thời sự).</div></div>
            )}
            {result.guardrail && !result.guardrail.ok && (
              <div className="ag-alert bad" role="alert"><Icon name="alert" size={18} /><div>{formatGuardrail(result.guardrail.reasons).map((l, i) => <div key={i}>{l}</div>)}</div></div>
            )}
            {result.warnings.length > 0 && (
              <div className="ag-alert warn" aria-label="Cảnh báo">
                <Icon name="alert" size={18} />
                <ul>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}

            <div role="tablist" aria-label="Cách xem bản soạn" className="ag-tabs sb-tabs">
              {([['doc', 'Bản soạn'], ['edit', 'Chỉnh sửa'], ['soi', 'AI tự soi']] as const).map(([k, l]) => (
                <button key={k} type="button" role="tab" id={`sb-tab-${k}`} aria-selected={tab === k} aria-controls="sb-panel" className="ag-tab" onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
            <div role="tabpanel" id="sb-panel" aria-labelledby={`sb-tab-${tab}`} className="sb-panel">
              {tab === 'doc' && <DocText text={text} />}
              {tab === 'edit' && (
                <>
                  <label className="ag-field-label" htmlFor="sb-edit">Chỉnh toàn văn trước khi duyệt</label>
                  <textarea id="sb-edit" className="ag-field sb-edit" rows={18} value={text} onChange={(e) => setText(e.target.value)} />
                </>
              )}
              {tab === 'soi' &&
                (result.reflection.skipped ? (
                  <p className="ag-note">AI chưa tự soi được. Cô/thầy hãy đọc kỹ trước khi duyệt.</p>
                ) : (
                  <div>
                    {result.reflection.scores.map((s) => (
                      <div key={s.id} className="ag-score">
                        <span className="ag-score-name">{s.name}</span>
                        <span className="ag-score-val">{s.score}/10</span>
                        <div className="ag-bar" role="img" aria-label={`${s.name}: ${s.score} trên 10`}>
                          <i style={{ width: `${Math.max(0, Math.min(10, s.score)) * 10}%` }} />
                        </div>
                        {s.note && <span className="ag-score-note">{s.note}</span>}
                      </div>
                    ))}
                    <p><strong>Điểm trung bình: {result.reflection.average}</strong></p>
                    {result.reflection.issues.length > 0 && (
                      <div className="ag-alert warn"><Icon name="alert" size={18} /><ul>{result.reflection.issues.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                    )}
                  </div>
                ))}
            </div>

            <div className="sb-actions">
              <button type="button" className="ag-btn primary" onClick={() => void approve()}><Icon name="check" size={18} /> Duyệt và dùng</button>
              <button type="button" className="ag-btn" onClick={() => void run(result.runId)} disabled={loading}><Icon name="refresh" size={18} /> Sinh lại</button>
              <button type="button" className="ag-btn" onClick={() => void exportDocx()}><Icon name="download" size={18} /> Tải .docx</button>
              <button type="button" className="ag-btn" onClick={() => window.print()}><Icon name="print" size={18} /> In</button>
            </div>
            {approved && <div className="ag-alert ok" role="status"><Icon name="check" size={18} /><div>{approved}</div></div>}
          </div>
        )}
      </section>
    </div>
  );
}
