'use client';

import { useEffect, useRef, useState } from 'react';
import { CLASS_PROFILES } from '@/lib/classes';
import {
  BLOOM_CHOICES,
  NGON_NGU_OPTIONS,
  PHONG_CACH_OPTIONS,
  bloomPreview,
  formatApiError,
  type BloomStart,
  type NgonNgu,
} from '@/lib/ui/soanBai';
import {
  ALL_RESOURCES,
  FORMAT_GROUPS,
  needsStyle,
  summaryRows,
  type AgentSlots,
  type AskStep,
  type FormatValue,
  type NewsEvent,
  type StyleValue,
} from '@/lib/agent/flow';
import { Icon } from '@/components/ui/icons';
import type { ResourceKind } from '@/lib/resources/types';
import { getFromKho, getStructure, structureSummary } from '@/lib/agent/result';
import { ResourceChecklist } from './ResourcePicker';
import {
  GRADE_OPTIONS,
  SUBJECT_OPTIONS,
  WORKFLOW_LABELS,
  formatIcon,
  type AtomLite,
  type ResultEntry,
  type RunState,
} from './types';

/* ---------------- Thẻ chọn một bước ---------------- */

export function FormatChoices({ onPick }: { onPick: (v: FormatValue) => void }) {
  return (
    <div className="ag-card" role="group" aria-label="Chọn sản phẩm cần soạn">
      {FORMAT_GROUPS.map((g) => (
        <div className="ag-fgroup" key={g.title} role="group" aria-label={g.title}>
          <h4 className="ag-fgroup-h">{g.title}</h4>
          <div className="ag-choices">
            {g.items.map((o) => (
              <button key={o.value} type="button" className="ag-choice" onClick={() => onPick(o.value)}>
                <span className="ag-choice-ico">
                  <Icon name={formatIcon(o.value)} />
                </span>
                <span>
                  <strong>{o.label}</strong>
                  <small>{o.desc}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResourceChoices({ onPick }: { onPick: (v: ResourceKind[]) => void }) {
  const [value, setValue] = useState<ResourceKind[]>(ALL_RESOURCES);
  return (
    <div className="ag-card">
      <ResourceChecklist value={value} onChange={setValue} idPrefix="ag-res" />
      <div className="ag-actions">
        <button type="button" className="ag-btn primary" onClick={() => onPick(value)} disabled={value.length < 1}>
          Tiếp tục với {value.length} dạng
        </button>
      </div>
    </div>
  );
}

export function BloomChoices({ onPick }: { onPick: (v: BloomStart) => void }) {
  return (
    <div className="ag-card" role="group" aria-label="Chọn mức tư duy thấp nhất">
      <div className="ag-choices">
        {BLOOM_CHOICES.map((o) => (
          <button key={o.value} type="button" className="ag-choice" onClick={() => onPick(o.value)}>
            <span>
              <strong>{o.label}</strong>
              <small>{o.hint}</small>
              <small style={{ marginTop: 6, color: 'var(--navy)', fontWeight: 600 }}>
                {bloomPreview(o.value).join(' → ')}
              </small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function StyleChoices({ onPick }: { onPick: (v: StyleValue) => void }) {
  return (
    <div className="ag-card" role="group" aria-label="Chọn phong cách dạy">
      <div className="ag-choices">
        {PHONG_CACH_OPTIONS.map((o) => (
          <button key={o.value} type="button" className="ag-choice" onClick={() => onPick(o.value)}>
            <span>
              <strong>{o.label}</strong>
              <small>{o.hint}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Chọn bài ---------------- */

interface PickerProps {
  subject: string;
  grade: string;
  onSubject: (v: string) => void;
  onGrade: (v: string) => void;
  suggestions: AtomLite[];
  onPick: (a: AtomLite) => void;
}

export function LessonPicker({ subject, grade, onSubject, onGrade, suggestions, onPick }: PickerProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [atoms, setAtoms] = useState<AtomLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ subject, grade, limit: '60' });
    if (debounced) params.set('q', debounced);
    fetch(`/api/supabase/knowledge?${params.toString()}`, { signal: ctrl.signal })
      .then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; atoms?: AtomLite[]; error?: string };
        if (!res.ok || !j.ok) throw new Error(formatApiError(res.status, j.error));
        setAtoms(j.atoms ?? []);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setAtoms([]);
        setError(e instanceof Error ? e.message : 'Không tải được danh sách bài.');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [subject, grade, debounced]);

  const showSuggest = suggestions.length > 0 && !debounced;

  return (
    <div className="ag-card">
      <div className="ag-field-row">
        <div>
          <label className="ag-field-label" htmlFor="ag-subject">
            Môn
          </label>
          <select id="ag-subject" className="ag-field" value={subject} onChange={(e) => onSubject(e.target.value)}>
            {SUBJECT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="ag-field-label" htmlFor="ag-grade">
            Khối
          </label>
          <select id="ag-grade" className="ag-field" value={grade} onChange={(e) => onGrade(e.target.value)}>
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={g}>
                Lớp {g}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="ag-field-label" htmlFor="ag-search">
        Tìm bài (tên bài hoặc mã như TO10-C01-A01)
      </label>
      <input
        id="ag-search"
        className="ag-field"
        type="search"
        placeholder="Ví dụ: mệnh đề, hàm số bậc hai…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />

      {showSuggest && (
        <>
          <p className="ag-field-label" style={{ marginTop: 12 }}>
            Gợi ý theo câu cô/thầy vừa gõ
          </p>
          <div className="ag-lessons" role="group" aria-label="Danh sách bài">
            {suggestions.map((a) => (
              <LessonRow key={`s-${a.id}`} atom={a} onPick={onPick} />
            ))}
          </div>
        </>
      )}

      <div className="ag-lessons" role="group" aria-label="Danh sách bài" aria-busy={loading} style={{ marginTop: showSuggest ? 12 : 10 }}>
        {loading && <p className="ag-empty-note" style={{ padding: 14 }}>Đang tải danh sách bài…</p>}
        {!loading && error && (
          <p className="ag-empty-note" style={{ padding: 14, color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        {!loading && !error && atoms.length === 0 && (
          <p className="ag-empty-note" style={{ padding: 14 }}>
            Không thấy bài phù hợp. Thử từ khoá khác hoặc đổi môn/khối.
          </p>
        )}
        {!loading && atoms.map((a) => <LessonRow key={a.id} atom={a} onPick={onPick} />)}
      </div>
      <p className="ag-note">Bài có nhãn “Có bản chuẩn” đã có gói kiến thức dựng sẵn: kết quả sẽ sát chương trình hơn.</p>
    </div>
  );
}

function LessonRow({ atom, onPick }: { atom: AtomLite; onPick: (a: AtomLite) => void }) {
  return (
    <button type="button" className="ag-lesson" onClick={() => onPick(atom)}>
      <span>
        <span className="ag-lesson-title">{atom.title}</span>
        <span className="ag-lesson-code">{atom.code}</span>
      </span>
      {atom.hasFactoryPackage ? (
        <span className="ag-status ok">Có bản chuẩn</span>
      ) : (
        <span className="ag-status none">Chưa có gói</span>
      )}
    </button>
  );
}

/* ---------------- Xác nhận ---------------- */

interface ConfirmProps {
  slots: AgentSlots;
  standardStatus?: 'approved' | 'chua_duyet' | 'khong_co';
  onEdit: (step: AskStep) => void;
  onChange: (patch: Partial<AgentSlots>) => void;
  onStart: (news?: NewsEvent) => void;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function ConfirmCard({ slots, standardStatus, onEdit, onChange, onStart }: ConfirmProps) {
  const rows = summaryRows(slots);
  const [newsOn, setNewsOn] = useState(Boolean(slots.suKien));
  const [news, setNews] = useState<NewsEvent>(
    slots.suKien ?? { tieuDe: '', url: '', ngayDang: '', noiDung: '' },
  );
  const [err, setErr] = useState('');
  const classes = CLASS_PROFILES.filter((c) => c.grade === slots.grade);

  const start = () => {
    if (newsOn) {
      if (!news.tieuDe.trim()) return setErr('Nhập tiêu đề sự kiện thời sự.');
      if (!/^https?:\/\/\S+$/i.test(news.url.trim())) return setErr('Nhập đường dẫn bài báo (bắt đầu bằng https://).');
      if (!DATE_RE.test(news.ngayDang)) return setErr('Chọn ngày đăng bài báo.');
      setErr('');
      const clean: NewsEvent = { tieuDe: news.tieuDe.trim(), url: news.url.trim(), ngayDang: news.ngayDang };
      if (news.noiDung?.trim()) clean.noiDung = news.noiDung.trim();
      onStart(clean);
    } else {
      setErr('');
      onStart(undefined);
    }
  };

  return (
    <div className="ag-card">
      <h3>Mình sẽ soạn như sau</h3>
      <div className="ag-sum">
        {rows.map((r) => (
          <div className="ag-sum-row" key={r.label}>
            <div>
              <div className="ag-sum-k">{r.label}</div>
              <div className="ag-sum-v">{r.value}</div>
            </div>
            {r.step && (
              <button type="button" className="ag-link" onClick={() => onEdit(r.step as AskStep)} aria-label={`Sửa ${r.label}`}>
                Sửa
              </button>
            )}
          </div>
        ))}
      </div>

      {standardStatus === 'chua_duyet' && (
        <div className="ag-alert warn" role="status">
          <Icon name="alert" size={18} />
          <span>Bài này chưa có bản chuẩn đã duyệt. Mình vẫn soạn được, nhưng kết quả chỉ là bản nháp cần người duyệt.</span>
        </div>
      )}
      {standardStatus === 'approved' && (
        <div className="ag-alert ok" role="status">
          <Icon name="shield" size={18} />
          <span>Bài này có bản chuẩn đã duyệt: mình sẽ nâng cấp từ đó, không soạn lại từ đầu.</span>
        </div>
      )}

      <details className="ag-more">
        <summary>Tuỳ chọn thêm (ngày dạy, ngôn ngữ, lớp, thời sự)</summary>
        <div className="ag-field-row" style={{ marginTop: 12 }}>
          <div>
            <label className="ag-field-label" htmlFor="ag-date">
              Ngày dạy
            </label>
            <input
              id="ag-date"
              className="ag-field"
              type="date"
              value={slots.ngayDay}
              onChange={(e) => onChange({ ngayDay: e.target.value })}
            />
          </div>
          <div>
            <label className="ag-field-label" htmlFor="ag-lang">
              Ngôn ngữ
            </label>
            <select
              id="ag-lang"
              className="ag-field"
              value={slots.ngonNgu}
              onChange={(e) => onChange({ ngonNgu: e.target.value as NgonNgu })}
            >
              {NGON_NGU_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="ag-field-label" htmlFor="ag-class">
              Lớp (tuỳ chọn)
            </label>
            <select
              id="ag-class"
              className="ag-field"
              value={slots.classId ?? ''}
              onChange={(e) => onChange({ classId: e.target.value || undefined })}
            >
              <option value="">Không chọn lớp</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.className} · {c.campus}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44, fontWeight: 600 }}>
          <input type="checkbox" checked={newsOn} onChange={(e) => setNewsOn(e.target.checked)} style={{ width: 20, height: 20 }} />
          Gắn một sự kiện thời sự vào tiết học
        </label>
        {newsOn && (
          <div style={{ marginTop: 8 }}>
            <div className="ag-alert info">
              <Icon name="newspaper" size={18} />
              <span>
                Chỉ nhận nguồn VnExpress, Tuổi Trẻ, Thanh Niên, VTV, Reuters, AP. Không dùng tin dưới 48 giờ. Tiết có thời sự
                bắt buộc người duyệt.
              </span>
            </div>
            <div className="ag-field-row" style={{ marginTop: 12 }}>
              <div>
                <label className="ag-field-label" htmlFor="ag-n-title">
                  Tiêu đề bài báo
                </label>
                <input id="ag-n-title" className="ag-field" value={news.tieuDe} onChange={(e) => setNews({ ...news, tieuDe: e.target.value })} />
              </div>
              <div>
                <label className="ag-field-label" htmlFor="ag-n-date">
                  Ngày đăng
                </label>
                <input id="ag-n-date" className="ag-field" type="date" value={news.ngayDang} onChange={(e) => setNews({ ...news, ngayDang: e.target.value })} />
              </div>
            </div>
            <label className="ag-field-label" htmlFor="ag-n-url">
              Đường dẫn bài báo
            </label>
            <input id="ag-n-url" className="ag-field" type="url" placeholder="https://vnexpress.net/…" value={news.url} onChange={(e) => setNews({ ...news, url: e.target.value })} />
            <label className="ag-field-label" htmlFor="ag-n-body" style={{ marginTop: 10 }}>
              Tóm tắt nội dung (tuỳ chọn)
            </label>
            <textarea id="ag-n-body" className="ag-field" rows={3} value={news.noiDung ?? ''} onChange={(e) => setNews({ ...news, noiDung: e.target.value })} />
          </div>
        )}
      </details>

      {err && (
        <div className="ag-alert bad" role="alert">
          <Icon name="alert" size={18} />
          <span>{err}</span>
        </div>
      )}

      <div className="ag-actions">
        <button type="button" className="ag-btn primary" onClick={start}>
          <Icon name="sparkles" />
          Bắt đầu soạn
        </button>
      </div>
      {needsStyle(slots.format) ? null : (
        <p className="ag-note">Sản phẩm này không phụ thuộc phong cách dạy nên mình bỏ qua câu hỏi đó.</p>
      )}
    </div>
  );
}

/* ---------------- Đang chạy / dấu vết các bước ---------------- */

export function RunCard({
  run,
  entry,
  onCancel,
  onOpen,
}: {
  run: RunState;
  entry?: ResultEntry;
  onCancel: () => void;
  onOpen: (id: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const startedRef = useRef(run.startedAt);
  useEffect(() => {
    if (run.status !== 'running') return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [run.status]);
  const secs = Math.max(0, Math.round((now - startedRef.current) / 1000));

  if (run.status === 'error') {
    return (
      <div className="ag-alert bad" role="alert">
        <Icon name="alert" size={18} />
        <div>
          <div>{run.error}</div>
          {run.details && run.details.length > 0 && (
            <ul>
              {run.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  if (run.status === 'running') {
    return (
      <div className="ag-run" role="status" aria-live="polite">
        <div className="ag-run-head">
          <div className="ag-run-title">
            <span className="ag-spin" aria-hidden="true" />
            Mình đang làm việc…
          </div>
          <span className="ag-timer">{secs} giây</span>
        </div>
        <ul className="ag-trace">
          <TraceLine state="wait" text="Tra bản chuẩn trong Kho học liệu" />
          {run.hasNews && <TraceLine state="wait" text="Kiểm tra sự kiện thời sự" />}
          <TraceLine state="wait" text="Chọn quy trình soạn phù hợp" />
          <TraceLine state="wait" text="Soạn nội dung theo các bậc tư duy" />
          <TraceLine state="wait" text="Tự soi lại theo 6 tiêu chí" />
        </ul>
        <div className="ag-actions">
          <button type="button" className="ag-btn small" onClick={onCancel}>
            <Icon name="stop" size={16} />
            Dừng lại
          </button>
        </div>
        <p className="ag-note">Thường mất khoảng một phút. Mình sẽ báo ngay khi xong.</p>
      </div>
    );
  }

  const r = entry?.result;
  if (!r) return null;
  const std = r.standard.status;
  const refl = r.reflection;
  const structure = getStructure(r);
  const ss = structureSummary(structure);
  const fromKho = getFromKho(r);
  return (
    <div className="ag-run">
      <div className="ag-run-head">
        <div className="ag-run-title">
          <span className="ag-trace-dot" aria-hidden="true">
            <Icon name="check" size={14} />
          </span>
          Các bước mình đã làm
        </div>
        {entry && (
          <button type="button" className="ag-btn small" onClick={() => onOpen(entry.id)}>
            <Icon name="panel" size={16} />
            Mở bản soạn
          </button>
        )}
      </div>
      <ul className="ag-trace">
        <TraceLine
          state={std === 'approved' ? 'ok' : 'warn'}
          text={
            std === 'approved'
              ? `Tra Kho: bản chuẩn đã duyệt${r.standard.reviewedBy ? ` (bởi ${r.standard.reviewedBy})` : ''}`
              : 'Tra Kho: chưa có bản chuẩn đã duyệt, dùng bản nháp'
          }
        />
        {r.guardrail && (
          <TraceLine state={r.guardrail.ok ? 'ok' : 'warn'} text={r.guardrail.ok ? 'Thời sự: nguồn và thời điểm hợp lệ' : 'Thời sự: không đạt kiểm tra'} />
        )}
        <TraceLine state="ok" text={`Quy trình: ${WORKFLOW_LABELS[r.workflow] ?? r.workflow}`} />
        <TraceLine state="ok" text={`Các bậc tư duy: ${r.bloomLevels.join(' → ')}`} />
        {fromKho.length > 0 && <TraceLine state="ok" text="Lấy trực tiếp từ bản chuẩn đã duyệt, không sinh lại" />}
        {structure.length > 0 && (
          <TraceLine
            state={ss.missing.length === 0 ? 'ok' : 'warn'}
            text={`Kiểm tra cấu trúc: đạt ${ss.ok}/${ss.total} mục${ss.missing.length ? ' (còn thiếu một số mục)' : ''}`}
          />
        )}
        <TraceLine
          state={refl.skipped ? 'warn' : 'ok'}
          text={
            refl.skipped
              ? 'Tự soi: chưa thực hiện được lần này'
              : `Tự soi theo rubric: ${refl.average.toFixed(1)}/5 (chỉ để tham khảo, chưa thay cho người duyệt)`
          }
        />
      </ul>
    </div>
  );
}

function TraceLine({ state, text }: { state: 'ok' | 'warn' | 'wait'; text: string }) {
  return (
    <li>
      <span className={`ag-trace-dot${state === 'warn' ? ' warn' : state === 'wait' ? ' wait' : ''}`} aria-hidden="true">
        <Icon name={state === 'ok' ? 'check' : state === 'warn' ? 'alert' : 'clock'} size={13} />
      </span>
      <span>{text}</span>
    </li>
  );
}
