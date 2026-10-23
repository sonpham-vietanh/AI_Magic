'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { GRADES, SUBJECTS } from '@/lib/catalog';
import { fetchJson, friendlyError } from '@/lib/ui/fetchJson';
import {
  BADGE_EXPLAIN,
  EMPTY_SUBJECT_MESSAGE,
  codeHint,
  encodeFreeLesson,
  groupByChapter,
  packageBadge,
  pushRecent,
  readRecent,
  type RecentLesson,
} from '@/lib/ui/lessonList';
import '@/app/ui-kho.css';
import type { AtomLite } from './types';

/** Bài được chọn, kèm ngữ cảnh để hiển thị (khối, môn, chương). Tương thích AtomLite. */
export interface LessonPick extends AtomLite {
  subject?: string;
  grade?: number;
  chapterLabel?: string;
  chapter?: string;
  lesson?: string;
  /** true khi giáo viên tự nhập tên bài (không có trong Kho). */
  free?: boolean;
}

interface ApiItem {
  atomId: string;
  code: string;
  title: string;
  chapter: string;
  lesson: string;
  chapterLabel: string;
  subject: string;
  subjectName: string;
  grade: number;
  hasPackage?: boolean;
  assetCount?: number;
}
interface ApiPage {
  items?: ApiItem[];
  total?: number;
  coverage?: Record<string, Record<string, number>>;
}

const SCOPE_KEY = 'va_lesson_scope_v1';
const SUBJECT_NAME = new Map(SUBJECTS.map((s) => [s.code as string, s.shortName]));

const toPick = (i: ApiItem): LessonPick => ({
  id: i.atomId,
  code: i.code,
  title: i.title,
  hasFactoryPackage: !!i.hasPackage,
  factoryAssetCount: i.assetCount ?? 0,
  subject: i.subject,
  grade: i.grade,
  chapterLabel: i.chapterLabel,
  chapter: i.chapter,
  lesson: i.lesson,
});

function readScope(): { subject: string; grade: string } {
  try {
    const raw = localStorage.getItem(SCOPE_KEY);
    if (raw) {
      const j = JSON.parse(raw) as { subject?: string; grade?: string };
      if (typeof j.subject === 'string' && typeof j.grade === 'string') return { subject: j.subject, grade: j.grade };
    }
  } catch {
    /* bỏ qua */
  }
  return { subject: 'toan', grade: 'all' };
}

/** Phạm vi cả Kho (số bài theo môn/khối), tải một lần cho cả phiên. */
let globalCoverage: Record<string, Record<string, number>> | null = null;
let globalCoveragePromise: Promise<Record<string, Record<string, number>>> | null = null;
function loadGlobalCoverage(): Promise<Record<string, Record<string, number>>> {
  if (globalCoverage) return Promise.resolve(globalCoverage);
  globalCoveragePromise ||= fetchJson<ApiPage>('/api/kho/library?subject=all&grade=all&limit=1')
    .then((d) => (globalCoverage = d.coverage ?? {}))
    .catch(() => {
      globalCoveragePromise = null;
      return {};
    });
  return globalCoveragePromise;
}

/* ---------------- Một dòng bài ---------------- */

function LessonRowItem({
  item,
  showWhere,
  selected,
  onPick,
}: {
  item: LessonPick;
  showWhere: boolean;
  selected?: boolean;
  onPick: (a: LessonPick) => void;
}) {
  const badge = packageBadge(item);
  const where = [
    item.grade ? `Lớp ${item.grade}` : '',
    item.subject ? SUBJECT_NAME.get(item.subject) ?? '' : '',
    item.chapterLabel ?? '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <button
      type="button"
      className={`lf-row${selected ? ' lf-row-on' : ''}`}
      data-lf-item
      aria-pressed={selected === undefined ? undefined : selected}
      title={codeHint(item)}
      onClick={() => onPick(item)}
    >
      <span className="lf-row-main">
        <span className="lf-row-title">{item.title}</span>
        {showWhere && where && <span className="lf-row-where">{where}</span>}
      </span>
      <span className={`ag-status ${badge.ready ? 'ok' : 'none'} lf-row-badge`}>
        {selected ? 'Đã chọn' : badge.text}
      </span>
    </button>
  );
}

/* ---------------- Nhập tên bài tự do ---------------- */

function FreeEntry({ onPick, lead }: { onPick: (a: LessonPick) => void; lead: string }) {
  const [text, setText] = useState('');
  const id = useId();
  const clean = text.trim().replace(/\s+/g, ' ');
  const ok = clean.length >= 3 && clean.length <= 60;
  const submit = () => {
    if (!ok) return;
    onPick({ id: encodeFreeLesson(clean), code: '', title: clean, hasFactoryPackage: false, free: true });
  };
  return (
    <div className="lf-free">
      <p className="lf-free-lead">{lead}</p>
      <label className="ag-field-label" htmlFor={id}>
        Tên bài cô/thầy muốn soạn
      </label>
      <div className="lf-free-row">
        <input
          id={id}
          className="ag-field lf-free-input"
          value={text}
          maxLength={60}
          placeholder="Ví dụ: Định luật Ôm cho đoạn mạch"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="ag-btn primary lf-free-go" disabled={!ok} onClick={submit}>
          Dùng tên bài này
        </button>
      </div>
      <p className="lf-free-note">AI sẽ soạn từ dữ liệu cơ bản của chương trình, cô/thầy nên xem lại trước khi dùng.</p>
    </div>
  );
}

/* ---------------- Bộ chọn bài (dùng chung) ---------------- */

export function LessonBrowser({
  onPick,
  selectedIds,
  allowFree = true,
  idPrefix = 'lf',
}: {
  onPick: (a: LessonPick) => void;
  /** Có giá trị: chế độ chọn nhiều, dòng đã chọn hiện "Đã chọn". */
  selectedIds?: string[];
  allowFree?: boolean;
  idPrefix?: string;
}) {
  const [scope, setScope] = useState({ subject: 'toan', grade: 'all' });
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<LessonPick[]>([]);
  const [cross, setCross] = useState<LessonPick[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [coverage, setCoverage] = useState<Record<string, Record<string, number>> | null>(globalCoverage);
  const [recent, setRecent] = useState<RecentLesson[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const { subject, grade } = scope;

  useEffect(() => {
    setScope(readScope());
    setRecent(readRecent());
    let live = true;
    void loadGlobalCoverage().then((c) => live && setCoverage(c));
    return () => {
      live = false;
    };
  }, []);

  const updateScope = (next: { subject: string; grade: string }) => {
    setScope(next);
    try {
      localStorage.setItem(SCOPE_KEY, JSON.stringify(next));
    } catch {
      /* bỏ qua */
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const browsing = !debounced && grade !== 'all';
  const wantList = !!debounced || grade !== 'all';

  useEffect(() => {
    if (!wantList) {
      setItems([]);
      setCross([]);
      setTotal(0);
      setLoading(false);
      setError('');
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({ subject, grade, limit: '500' });
    if (debounced) qs.set('q', debounced);
    if (grade !== 'all') qs.set('preferGrade', grade);
    // Khi xem theo chương, lấy đủ mọi trang để bài cuối của khối vẫn có mặt (không cắt ở một số cố định).
    const scoped = (async (): Promise<ApiPage> => {
      const first = await fetchJson<ApiPage & { nextOffset?: number | null }>(`/api/kho/library?${qs}`, { signal: ctrl.signal });
      if (debounced) return first;
      const all = [...(first.items ?? [])];
      let next = first.nextOffset ?? null;
      for (let guard = 0; next != null && guard < 8; guard++) {
        const more = await fetchJson<ApiPage & { nextOffset?: number | null }>(`/api/kho/library?${qs}&offset=${next}`, { signal: ctrl.signal });
        all.push(...(more.items ?? []));
        next = more.nextOffset ?? null;
      }
      return { ...first, items: all };
    })();
    const crossReq =
      debounced && (subject !== 'all' || grade !== 'all')
        ? fetchJson<ApiPage>(`/api/kho/library?${new URLSearchParams({ subject: 'all', grade: 'all', q: debounced, limit: '8', ...(grade !== 'all' ? { preferGrade: grade } : {}) })}`, { signal: ctrl.signal }).catch(() => null)
        : Promise.resolve(null);
    Promise.all([scoped, crossReq])
      .then(([a, b]) => {
        if (ctrl.signal.aborted) return;
        const mine = (a.items ?? []).map(toPick);
        const ids = new Set(mine.map((x) => x.id));
        setItems(mine);
        setTotal(a.total ?? mine.length);
        setCross((b?.items ?? []).map(toPick).filter((x) => !ids.has(x.id)).slice(0, 6));
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setItems([]);
        setCross([]);
        setTotal(0);
        setError(friendlyError(e, 'Chưa tải được danh sách bài. Cô/thầy thử lại nhé.'));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [subject, grade, debounced, wantList, retry]);

  const choose = useCallback(
    (a: LessonPick) => {
      if (!a.free) {
        setRecent(
          pushRecent({
            id: a.id,
            code: a.code,
            title: a.title,
            subject: a.subject,
            grade: a.grade ? String(a.grade) : undefined,
            chapter: a.chapterLabel,
            hasFactoryPackage: a.hasFactoryPackage,
          }),
        );
      }
      onPick(a);
    },
    [onPick],
  );

  // Phím mũi tên đi giữa các dòng bài; Esc xoá ô tìm.
  const onKeyNav = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const root = e.currentTarget as HTMLElement;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-lf-item], .lf-search'));
    const at = nodes.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    const next = nodes[e.key === 'ArrowDown' ? Math.min(nodes.length - 1, at + 1) : Math.max(0, at - 1)];
    if (next && next !== nodes[at]) {
      e.preventDefault();
      next.focus();
    }
  };

  const subjectHasData = (code: string) => (coverage ? Object.values(coverage[code] ?? {}).some((n) => n > 0) : true);
  const gradeHasData = (g: string) => (coverage && subject !== 'all' ? (coverage[subject]?.[g] ?? 0) > 0 : true);
  const scopeEmpty = !!coverage && subject !== 'all' && (grade === 'all' ? !subjectHasData(subject) : !gradeHasData(grade));
  const subjectName = subject === 'all' ? 'mọi môn' : SUBJECT_NAME.get(subject) ?? 'môn này';
  const sel = selectedIds ? new Set(selectedIds) : null;
  const chapters = useMemo(() => (browsing ? groupByChapter(items) : []), [browsing, items]);
  const gradesWithData = useMemo(
    () => (coverage && subject !== 'all' ? GRADES.filter((g) => (coverage[subject]?.[g.grade] ?? 0) > 0).map((g) => g.grade) : []),
    [coverage, subject],
  );

  const showRecent = !debounced && recent.length > 0;

  return (
    <div className="lf-box" onKeyDown={onKeyNav}>
      <div className="lf-filters">
        <div>
          <label className="ag-field-label" htmlFor={`${idPrefix}-subject`}>
            Môn
          </label>
          <select
            id={`${idPrefix}-subject`}
            className="ag-field"
            value={subject}
            onChange={(e) => updateScope({ subject: e.target.value, grade: e.target.value === 'all' ? 'all' : grade })}
          >
            <option value="all">Mọi môn</option>
            {SUBJECTS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.shortName}
                {coverage && !subjectHasData(s.code) ? ' (chưa có)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="ag-field-label" htmlFor={`${idPrefix}-grade`}>
            Khối
          </label>
          <select id={`${idPrefix}-grade`} className="ag-field" value={grade} onChange={(e) => updateScope({ subject, grade: e.target.value })}>
            <option value="all">Mọi khối</option>
            {GRADES.map((g) => (
              <option key={g.grade} value={g.grade}>
                {g.label}
                {coverage && subject !== 'all' && !gradeHasData(g.grade) ? ' (chưa có)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="ag-field-label" htmlFor={`${idPrefix}-search`}>
        Tìm bài theo tên (gõ không dấu cũng được)
      </label>
      <div className="lf-searchwrap">
        <Icon name="search" size={18} />
        <input
          id={`${idPrefix}-search`}
          className="ag-field lf-search"
          type="search"
          value={query}
          maxLength={100}
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Ví dụ: pitago, hàm số bậc hai, định luật Ôm"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('');
          }}
        />
      </div>

      {showRecent && (
        <div className="lf-section">
          <p className="lf-head">Gần đây của tôi</p>
          <div className="lf-list" role="group" aria-label="Bài cô/thầy chọn gần đây">
            {recent.slice(0, 5).map((r) => (
              <LessonRowItem
                key={`r-${r.id}`}
                showWhere
                selected={sel ? sel.has(r.id) : undefined}
                item={{
                  id: r.id,
                  code: r.code,
                  title: r.title,
                  hasFactoryPackage: r.hasFactoryPackage,
                  subject: r.subject,
                  grade: r.grade ? Number(r.grade) : undefined,
                  chapterLabel: r.chapter,
                }}
                onPick={choose}
              />
            ))}
          </div>
        </div>
      )}

      <div className="lf-section" ref={listRef} aria-busy={loading} aria-live="polite">
        {!wantList && !scopeEmpty && (
          <p className="lf-hint">
            <Icon name="info" size={16} />
            <span>
              Chọn khối để xem bài theo từng chương, hoặc gõ tên bài ở trên để tìm ở mọi khối.
              {gradesWithData.length > 0 && ` ${subjectName} hiện có bài ở khối ${gradesWithData.join(', ')}.`}
            </span>
          </p>
        )}

        {scopeEmpty && !debounced && (
          <div className="lf-empty" role="status">
            <Icon name="book" size={22} />
            <strong>{EMPTY_SUBJECT_MESSAGE}</strong>
            {gradesWithData.length > 0 && grade !== 'all' && (
              <span>{subjectName} hiện có bài ở khối {gradesWithData.join(', ')}.</span>
            )}
          </div>
        )}

        {loading && (
          <div className="lf-skel" aria-label="Đang tải danh sách bài">
            <i />
            <i />
            <i />
          </div>
        )}

        {!loading && error && (
          <div className="lf-error" role="alert">
            <Icon name="alert" size={18} />
            <span>{error}</span>
            <button type="button" className="ag-btn small" onClick={() => setRetry((n) => n + 1)}>
              Thử lại
            </button>
          </div>
        )}

        {!loading && !error && wantList && debounced && items.length > 0 && (
          <>
            <p className="lf-head">
              {total} bài khớp “{debounced}”
              {total > items.length ? `, hiện ${items.length} bài đầu` : ''}
            </p>
            <div className="lf-list" role="group" aria-label="Kết quả tìm bài">
              {items.map((a) => (
                <LessonRowItem key={a.id} item={a} showWhere selected={sel ? sel.has(a.id) : undefined} onPick={choose} />
              ))}
            </div>
          </>
        )}

        {!loading && !error && browsing && items.length > 0 && (
          <div role="group" aria-label={`Bài theo chương, ${subjectName}`}>
            <p className="lf-head">
              {total} bài, xếp theo chương
            </p>
            {chapters.map((c, idx) => (
              <details key={c.key} className="lf-chap" open={chapters.length <= 3 || idx === 0}>
                <summary>
                  <Icon name="chevron" size={16} className="lf-chev" />
                  <span className="lf-chap-name">{c.label}</span>
                  <small>{c.count} bài</small>
                </summary>
                {c.lessons.map((l) => {
                  const showLabel = l.label && !(l.atoms.length === 1 && l.atoms[0].title.trim() === l.label.trim());
                  return (
                    <div key={l.key} className="lf-lesson">
                      {showLabel && <p className="lf-lesson-name">{l.label}</p>}
                      <div className="lf-list">
                        {l.atoms.map((a) => (
                          <LessonRowItem key={a.id} item={a} showWhere={false} selected={sel ? sel.has(a.id) : undefined} onPick={choose} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </details>
            ))}
          </div>
        )}

        {!loading && !error && wantList && items.length === 0 && !(scopeEmpty && !debounced) && (
          <div className="lf-empty" role="status">
            <Icon name="search" size={22} />
            {scopeEmpty ? (
              <strong>{EMPTY_SUBJECT_MESSAGE}</strong>
            ) : debounced ? (
              <strong>Chưa thấy bài khớp “{debounced}” trong {subjectName}{grade !== 'all' ? ` khối ${grade}` : ''}.</strong>
            ) : (
              <strong>Chưa có bài nào cho {subjectName} khối {grade}.</strong>
            )}
            {!scopeEmpty && <span>Thử gõ ít chữ hơn, bỏ dấu, hoặc đổi sang “Mọi khối”.</span>}
          </div>
        )}

        {!loading && !error && cross.length > 0 && (
          <div className="lf-cross">
            <p className="lf-head">Gợi ý ở khối hoặc môn khác</p>
            <div className="lf-list" role="group" aria-label="Gợi ý ở khối hoặc môn khác">
              {cross.map((a) => (
                <LessonRowItem key={`x-${a.id}`} item={a} showWhere selected={sel ? sel.has(a.id) : undefined} onPick={choose} />
              ))}
            </div>
          </div>
        )}
      </div>

      {allowFree && !loading && !error && (scopeEmpty || (wantList && items.length === 0) || !!debounced) && (
        <FreeEntry
          onPick={choose}
          lead={scopeEmpty ? 'Cô/thầy gõ tên bài, mình sẽ soạn từ dữ liệu cơ bản của chương trình.' : 'Không có bài cô/thầy cần? Cô/thầy vẫn soạn được bằng cách nhập tên bài.'}
        />
      )}

      <p className="lf-note">
        <b>Có gói kiến thức</b> và <b>AI soạn từ dữ liệu cơ bản</b>: {BADGE_EXPLAIN}
      </p>
    </div>
  );
}

/* ---------------- Ô chọn MỘT bài ---------------- */

export function LessonField({
  value,
  onChange,
  label = 'Bài dạy',
  allowFree = true,
}: {
  value: AtomLite | null;
  onChange: (a: AtomLite | null) => void;
  label?: string;
  allowFree?: boolean;
}) {
  if (value) {
    const v = value as LessonPick;
    const badge = packageBadge(value);
    const ctx = v.free
      ? 'Tên bài cô/thầy tự nhập'
      : [v.grade ? `Lớp ${v.grade}` : '', v.subject ? SUBJECT_NAME.get(v.subject) ?? '' : '', v.chapterLabel ?? '']
          .filter(Boolean)
          .join(' · ');
    return (
      <div>
        <span className="ag-field-label">{label}</span>
        <div className="lf-selected">
          <span className="lf-selected-main" title={codeHint(value)}>
            <span className="lf-row-title">{value.title}</span>
            {ctx && <span className="lf-row-where">{ctx}</span>}
            {!v.free && <span className={`ag-status ${badge.ready ? 'ok' : 'none'} lf-sel-badge`}>{badge.text}</span>}
          </span>
          <button type="button" className="ag-btn small lf-change" onClick={() => onChange(null)}>
            Đổi bài
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <span className="ag-field-label">{label}</span>
      <LessonBrowser onPick={(a) => onChange(a)} allowFree={allowFree} />
    </div>
  );
}

/* ---------------- Ô chọn NHIỀU bài ---------------- */

export function LessonMultiField({
  value,
  onChange,
  label = 'Các bài trong phạm vi đề',
}: {
  value: AtomLite[];
  onChange: (a: AtomLite[]) => void;
  label?: string;
}) {
  return (
    <div>
      <span className="ag-field-label">{label}</span>
      {value.length > 0 && (
        <div className="ag-chips" style={{ marginTop: 4 }} role="list" aria-label="Các bài đã chọn">
          {value.map((a) => (
            <span key={a.id} role="listitem" className="ag-chip" style={{ cursor: 'default' }} title={codeHint(a)}>
              {a.title}
              <button
                type="button"
                className="ag-link"
                style={{ textDecoration: 'none', minHeight: 24 }}
                aria-label={`Bỏ bài ${a.title}`}
                onClick={() => onChange(value.filter((x) => x.id !== a.id))}
              >
                <Icon name="x" size={16} />
              </button>
            </span>
          ))}
        </div>
      )}
      <LessonBrowser
        idPrefix="lfm"
        allowFree={false}
        selectedIds={value.map((x) => x.id)}
        onPick={(a) => {
          if (value.some((x) => x.id === a.id)) onChange(value.filter((x) => x.id !== a.id));
          else onChange([...value, a]);
        }}
      />
      <p className="ag-note">Bấm vào một bài để thêm, bấm lần nữa để bỏ. Có thể chọn nhiều bài.</p>
    </div>
  );
}
