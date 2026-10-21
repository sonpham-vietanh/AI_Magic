'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CLASS_PROFILES } from '@/lib/classes/profiles';
import { Icon } from '@/components/ui/icons';
import { LessonField } from '@/components/agent/LessonField';
import { ResultPanel } from '@/components/agent/ResultPanel';
import { ResourceChecklist } from '@/components/agent/ResourcePicker';
import { TeacherName, useActor } from '@/components/agent/TeacherName';
import { ALL_RESOURCES, FORMAT_GROUPS, attachResources, formatDesc, formatLabel, needsResourceChoice } from '@/lib/agent/flow';
import { acceptResult } from '@/lib/agent/accept';
import { resultText, type AgentResult } from '@/lib/agent/result';
import type { ResourceKind } from '@/lib/resources/types';
import type { AtomLite } from '@/components/agent/types';
import {
  BLOOM_CHOICES,
  NGON_NGU_OPTIONS,
  PHONG_CACH_OPTIONS,
  bloomPreview,
  buildParams,
  formatApiError,
  formatGuardrail,
  validateForm,
  type NgonNgu,
  type SoanBaiForm,
} from '@/lib/ui/soanBai';
import '@/app/ui-sb.css';

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

export function SoanBaiView() {
  const [form, setForm] = useState<SoanBaiForm>(initialForm);
  const [lesson, setLesson] = useState<AtomLite | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [stdStatus, setStdStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [apiError, setApiError] = useState('');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [dang, setDang] = useState<ResourceKind[]>(ALL_RESOURCES);
  const [actor, saveActor, actorReady] = useActor();
  const [outcome, setOutcome] = useState<{ accepted: boolean; diffRatio?: number; version?: { id: string; number: number }; versionFailed?: boolean }>({ accepted: false });
  const [text, setText] = useState('');
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
    const teacher = actor.trim()
      ? { name: actor.trim() }
      : cls
        ? { name: cls.homeroomTeacher.name, email: cls.homeroomTeacher.email }
        : undefined;
    const base = buildParams(form, { regenerationOf, teacher });
    const withRes = attachResources(base, form.formatDauRa, dang);
    if (!withRes.ok) {
      setApiError('Cần chọn ít nhất 1 dạng tài nguyên.');
      return;
    }
    const params = withRes.params;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setElapsed(0);
    setApiError('');
    setOutcome({ accepted: false });
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
      let data: { ok?: boolean; result?: AgentResult; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        /* không phải JSON */
      }
      if (!res.ok || !data.ok || !data.result) {
        setApiError(formatApiError(res.status, data.error));
      } else {
        setResult(data.result);
        setText(resultText(data.result));
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
    const out = await acceptResult({
      runId: result.runId,
      title: `${formatLabel(form.formatDauRa)}: ${lesson?.title ?? result.standard?.title ?? ''}`.trim(),
      format: form.formatDauRa,
      workflow: result.workflow,
      lessonKey: form.baiDayId || result.standard?.atomId || '',
      lessonTitle: lesson?.title,
      text,
      artifacts: result.artifacts,
      actor,
    });
    setOutcome({ accepted: true, diffRatio: out.diffRatio, version: out.version, versionFailed: out.versionFailed });
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
        <TeacherName value={actor} onSave={saveActor} ready={actorReady} />
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
              <select id="sb-fmt" className="ag-field" value={form.formatDauRa} onChange={(e) => set('formatDauRa', e.target.value)} aria-describedby="sb-fmt-desc">
                {FORMAT_GROUPS.map((g) => (
                  <optgroup key={g.title} label={g.title}>
                    {g.items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </optgroup>
                ))}
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
          <p className="ag-note" id="sb-fmt-desc">Đầu ra: {formatDesc(form.formatDauRa)}</p>
          {needsResourceChoice(form.formatDauRa) && <ResourceChecklist value={dang} onChange={setDang} idPrefix="sb-res" />}
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
            {result.guardrail && !result.guardrail.ok && (
              <div className="ag-alert bad" role="alert"><Icon name="alert" size={18} /><div>{formatGuardrail(result.guardrail.reasons).map((l, i) => <div key={i}>{l}</div>)}</div></div>
            )}
            <ResultPanel
              key={result.runId}
              title={lesson?.title || 'Bản soạn'}
              formatText={formatLabel(form.formatDauRa)}
              result={result}
              text={text}
              onText={setText}
              busy={loading}
              accepted={outcome.accepted}
              diffRatio={outcome.diffRatio}
              version={outcome.version}
              versionFailed={outcome.versionFailed}
              lessonTitle={lesson?.title}
              onRegenerate={() => void run(result.runId)}
              onAccept={approve}
            />
          </div>
        )}
      </section>
    </div>
  );
}
