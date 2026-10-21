'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import '@/app/ui.css';
import '@/app/ui-tv.css';
import { fetchJson, friendlyError } from '@/lib/ui/fetchJson';
import { Shell } from '@/components/Shell';
import { classifyLine } from '@/components/agent/Canvas';
import { Icon, type IconName } from '@/components/ui/icons';
import { GRADES, SUBJECTS, TOOL_CATEGORIES } from '@/lib/catalog';
import { cleanPedagogicalText } from '@/lib/text/clean';
import { keepSelection } from '@/lib/ui/notes';
import type { GeneratedResource, MajorOsUsageEvent } from '@/lib/types';

type View = 'library' | 'log';

const FEATURE_LABELS: Record<MajorOsUsageEvent['tinh_nang'], { verb: string; icon: IconName }> = {
  sinh_hoc_lieu: { verb: 'soạn học liệu', icon: 'sparkles' },
  tinh_chinh_hau_ky: { verb: 'chỉnh sửa học liệu', icon: 'edit' },
  ket_noi_lien_mon: { verb: 'tạo kết nối liên môn', icon: 'graph' },
  phan_hoa_lop_hoc: { verb: 'phân hóa theo nhóm học sinh', icon: 'users' },
  xuat_hoc_lieu: { verb: 'tải học liệu về máy', icon: 'download' },
  luu_thu_vien: { verb: 'lưu vào thư viện', icon: 'folder' },
  hoi_tro_ly_su_pham: { verb: 'hỏi trợ lý chuyên môn', icon: 'book' },
};

const subjectName = (code: string) => SUBJECTS.find((s) => s.code === code)?.shortName ?? '';
const categoryName = (code: string) => TOOL_CATEGORIES.find((c) => c.code === code)?.shortName ?? '';

/** Tên tài liệu trong dữ liệu có thể mang tiền tố mã "[R-...]": bỏ đi cho gọn. */
const cleanTitle = (t: string) => t.replace(/^\s*\[R-[^\]]*\]\s*/, '').trim() || t;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

const norm = (s: string) => s.toLowerCase();

function Detail({
  res,
  onClose,
}: {
  res: GeneratedResource;
  onClose: () => void;
}) {
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const title = cleanTitle(res.title);
  const sections =
    res.structuredSections && res.structuredSections.length > 0
      ? res.structuredSections
      : [{ heading: '', body: res.markdownContent }];

  const safeName = (title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || res.id);

  const downloadDocx = async () => {
    setError('');
    setNotice('');
    try {
      const { buildDocxBlob, downloadBlob } = await import('@/lib/export/docx');
      const blob = await buildDocxBlob({
        title: title.toUpperCase(),
        subtitle: [
          `${res.className || `Khối ${res.grade}`} · Giáo viên: ${res.teacher.name}`,
          'Trường Tiểu học, THCS & THPT Việt Anh',
        ],
        sections: sections.map((s) => ({
          heading: cleanPedagogicalText(s.heading),
          body: cleanPedagogicalText(s.body),
        })),
      });
      downloadBlob(blob, `${safeName}.docx`);
      setNotice('Đã tải file Word.');
    } catch {
      setError('Không tạo được file Word. Cô/thầy thử lại hoặc dùng nút In.');
    }
  };

  const downloadMd = () => {
    const blob = new Blob([res.markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setError('');
    setNotice('Đã tải file Markdown.');
  };

  const meta = [categoryName(res.category) || res.toolName, subjectName(res.subject), `Khối ${res.grade}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <aside className="ag-canvas tv-detail" aria-label="Chi tiết học liệu">
      <div className="ag-canvas-head">
        <div className="ag-canvas-title">
          <h2>{title}</h2>
          <p>{meta}</p>
          <p>
            {res.teacher.name} · {formatDate(res.createdAt)}
            {res.className ? ` · Lớp ${res.className}` : ''}
          </p>
        </div>
        <button type="button" className="ag-iconbtn" onClick={onClose} aria-label="Đóng chi tiết">
          <Icon name="x" />
        </button>
      </div>

      <div className="ag-canvas-body">
        {sections.map((s, i) => {
          const heading = cleanPedagogicalText(s.heading || '');
          const body = cleanPedagogicalText(s.body || '');
          return (
            <section className="ag-doc-sec" key={`${heading}-${i}`}>
              {heading && !/^Nội dung( học liệu biên soạn)?$/i.test(heading.trim()) && <h3>{heading}</h3>}
              {body
                .replace(/\r\n?/g, '\n')
                .split('\n')
                .map((line, j) =>
                  line.trim() === '' ? null : (
                    <p key={j} className={`ag-line ${classifyLine(line)}`}>
                      {line.trim()}
                    </p>
                  ),
                )}
            </section>
          );
        })}
      </div>

      {error && (
        <div className="ag-alert bad" role="alert" style={{ margin: '0 16px 12px' }}>
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="ag-alert ok" role="status" style={{ margin: '0 16px 12px' }}>
          <Icon name="check" size={18} />
          <span>{notice}</span>
        </div>
      )}

      <div className="ag-canvas-foot">
        <button type="button" className="ag-btn primary" onClick={downloadDocx}>
          <Icon name="download" />
          Tải .docx
        </button>
        <button type="button" className="ag-btn" onClick={downloadMd}>
          <Icon name="file" />
          Tải .md
        </button>
        <button type="button" className="ag-btn" onClick={() => window.print()}>
          <Icon name="print" />
          In
        </button>
      </div>
    </aside>
  );
}

export default function ResourceLibraryPage() {
  const [view, setView] = useState<View>('library');
  const [resources, setResources] = useState<GeneratedResource[]>([]);
  const [events, setEvents] = useState<MajorOsUsageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRaw, setSelectedRaw] = useState<GeneratedResource | null>(null);
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [featureFilter, setFeatureFilter] = useState('all');
  const [personQuery, setPersonQuery] = useState('');
  const [loadError, setLoadError] = useState('');
  const detailWrapRef = useRef<HTMLDivElement>(null);
  const lastOpener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const errors: string[] = [];
    const report = () => setLoadError(errors.join(' '));

    fetchJson<{ resources?: GeneratedResource[] }>('/api/resources', { signal })
      .then((data: { resources?: GeneratedResource[] }) => {
        const list = data.resources || [];
        setResources(list);
        if (list[0] && window.matchMedia('(min-width: 901px)').matches) setSelectedRaw(list[0]);
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        errors.push(`Không tải được danh sách học liệu (${friendlyError(err, 'lỗi kết nối')}).`);
        report();
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });

    fetchJson<{ du_lieu?: MajorOsUsageEvent[] }>('/api/usage', { signal })
      .then((data: { du_lieu?: MajorOsUsageEvent[] }) => {
        setEvents(data.du_lieu || []);
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        errors.push(`Không tải được nhật ký hoạt động (${friendlyError(err, 'lỗi kết nối')}).`);
        report();
      });

    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => {
    const q = norm(searchQuery.trim());
    return resources.filter((r) => {
      if (subjectFilter !== 'all' && r.subject !== subjectFilter) return false;
      if (gradeFilter !== 'all' && r.grade !== gradeFilter) return false;
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (q) {
        return (
          norm(r.title).includes(q) ||
          norm(r.toolName).includes(q) ||
          norm(r.className || '').includes(q) ||
          norm(r.teacher.name).includes(q)
        );
      }
      return true;
    });
  }, [resources, subjectFilter, gradeFilter, categoryFilter, searchQuery]);

  const selected = keepSelection(filtered, selectedRaw?.id) ? selectedRaw : null;

  const categoriesInUse = useMemo(() => {
    const used = new Set(resources.map((r) => r.category));
    return TOOL_CATEGORIES.filter((c) => used.has(c.code));
  }, [resources]);

  const closeDetail = () => {
    setSelectedRaw(null);
    lastOpener.current?.focus();
  };

  // ESC đóng tấm chi tiết
  useEffect(() => {
    if (!selected || view !== 'library') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedRaw(null);
        lastOpener.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected, view]);

  const filteredEvents = useMemo(() => {
    const q = norm(personQuery.trim());
    return events
      .filter((e) => {
        if (featureFilter !== 'all' && e.tinh_nang !== featureFilter) return false;
        if (q && !norm(e.nguoi?.ten || '').includes(q)) return false;
        return true;
      })
      .slice()
      .sort((a, b) => (a.luc < b.luc ? 1 : -1));
  }, [events, featureFilter, personQuery]);

  const eventsByDay = useMemo(() => {
    const groups: { day: string; items: MajorOsUsageEvent[] }[] = [];
    for (const e of filteredEvents) {
      const day = formatDate(e.luc) || 'Không rõ ngày';
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(e);
      else groups.push({ day, items: [e] });
    }
    return groups;
  }, [filteredEvents]);

  const hasFilter =
    subjectFilter !== 'all' || gradeFilter !== 'all' || categoryFilter !== 'all' || searchQuery.trim() !== '';
  const resetFilters = () => {
    setSubjectFilter('all');
    setGradeFilter('all');
    setCategoryFilter('all');
    setSearchQuery('');
  };

  const showDetail = view === 'library' && !!selected;

  return (
    <Shell
      title="Thư viện học liệu"
      subtitle="Học liệu cô/thầy đã lưu và nhật ký hoạt động."
      rightActions={
        <Link href="/" className="ag-btn primary">
          <Icon name="plus" />
          Soạn học liệu mới
        </Link>
      }
    >
      {loadError && (
        <div className="ag-alert bad" role="alert" style={{ marginTop: 0, marginBottom: 12 }}>
          <Icon name="alert" size={18} />
          <span>{loadError}</span>
        </div>
      )}

      <div className="tv-tabs" role="tablist" aria-label="Thư viện">
        <button
          type="button"
          role="tab"
          id="tv-tab-library"
          aria-selected={view === 'library'}
          aria-controls="tv-panel"
          className="ag-tab"
          onClick={() => setView('library')}
        >
          Học liệu đã lưu
        </button>
        <button
          type="button"
          role="tab"
          id="tv-tab-log"
          aria-selected={view === 'log'}
          aria-controls="tv-panel"
          className="ag-tab"
          onClick={() => setView('log')}
        >
          Nhật ký hoạt động
        </button>
      </div>

      <div className={`tv-wrap${showDetail ? ' has-detail' : ''}`} ref={detailWrapRef}>
        <div className="tv-main" id="tv-panel" role="tabpanel" aria-labelledby={view === 'library' ? 'tv-tab-library' : 'tv-tab-log'}>
          {view === 'library' ? (
            <>
              <div className="tv-toolbar">
                <div>
                  <label className="ag-field-label" htmlFor="tv-search">
                    Tìm học liệu
                  </label>
                  <div className="tv-search">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                      <path d="M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4" />
                    </svg>
                    <input
                      id="tv-search"
                      type="search"
                      className="ag-field"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tên bài, lớp hoặc giáo viên"
                    />
                  </div>
                </div>
                <div>
                  <label className="ag-field-label" htmlFor="tv-category">
                    Loại
                  </label>
                  <select id="tv-category" className="ag-field" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                    <option value="all">Tất cả loại</option>
                    {categoriesInUse.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.shortName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="ag-field-label" htmlFor="tv-subject">
                    Môn
                  </label>
                  <select id="tv-subject" className="ag-field" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
                    <option value="all">Tất cả môn</option>
                    {SUBJECTS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="ag-field-label" htmlFor="tv-grade">
                    Khối
                  </label>
                  <select id="tv-grade" className="ag-field" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
                    <option value="all">Tất cả khối</option>
                    {GRADES.map((g) => (
                      <option key={g.grade} value={g.grade}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="tv-count" aria-live="polite">
                <span>{loading ? 'Đang tải...' : `${filtered.length} học liệu`}</span>
                {hasFilter && (
                  <button type="button" className="ag-link" onClick={resetFilters}>
                    Xóa bộ lọc
                  </button>
                )}
              </div>

              {loading ? (
                <div className="tv-empty" role="status">
                  <span className="ag-spin" />
                  <span>Đang tải thư viện...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="tv-empty">
                  <Icon name="folder" size={32} />
                  {resources.length === 0 ? (
                    <>
                      <strong>Thư viện còn trống</strong>
                      <span>Học liệu cô/thầy duyệt và lưu sẽ hiện ở đây.</span>
                      <Link href="/" className="ag-btn primary">
                        Soạn học liệu đầu tiên
                      </Link>
                    </>
                  ) : (
                    <>
                      <strong>Không có học liệu nào khớp</strong>
                      <span>Cô/thầy thử đổi từ khóa hoặc bỏ bớt bộ lọc.</span>
                      <button type="button" className="ag-btn" onClick={resetFilters}>
                        Xóa bộ lọc
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="tv-grid">
                  {filtered.map((res) => (
                    <button
                      key={res.id}
                      type="button"
                      className="tv-card"
                      aria-pressed={selected?.id === res.id}
                      onClick={(e) => {
                        lastOpener.current = e.currentTarget;
                        setSelectedRaw(res);
                      }}
                    >
                      <span className="tv-tag">{categoryName(res.category) || res.toolName}</span>
                      <span className="tv-card-title">{cleanTitle(res.title)}</span>
                      <span className="tv-card-sub">
                        {[subjectName(res.subject), `Khối ${res.grade}`, res.className ? `Lớp ${res.className}` : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className="tv-card-foot">
                        <span>{res.teacher.name}</span>
                        <span>{formatDate(res.createdAt)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="tv-toolbar two">
                <div>
                  <label className="ag-field-label" htmlFor="tv-person">
                    Tìm theo tên giáo viên
                  </label>
                  <input
                    id="tv-person"
                    type="search"
                    className="ag-field"
                    value={personQuery}
                    onChange={(e) => setPersonQuery(e.target.value)}
                    placeholder="Ví dụ: Lan"
                  />
                </div>
                <div>
                  <label className="ag-field-label" htmlFor="tv-feature">
                    Hoạt động
                  </label>
                  <select id="tv-feature" className="ag-field" value={featureFilter} onChange={(e) => setFeatureFilter(e.target.value)}>
                    <option value="all">Tất cả hoạt động</option>
                    {Object.entries(FEATURE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.verb.charAt(0).toUpperCase() + v.verb.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="tv-count" aria-live="polite">
                <span>{filteredEvents.length} hoạt động</span>
                {(featureFilter !== 'all' || personQuery.trim() !== '') && (
                  <button
                    type="button"
                    className="ag-link"
                    onClick={() => {
                      setFeatureFilter('all');
                      setPersonQuery('');
                    }}
                  >
                    Xóa bộ lọc
                  </button>
                )}
              </div>

              {eventsByDay.length === 0 ? (
                <div className="tv-empty">
                  <Icon name="clock" size={32} />
                  <strong>Chưa có hoạt động nào</strong>
                  <span>Khi cô/thầy soạn hoặc lưu học liệu, hoạt động sẽ hiện ở đây.</span>
                </div>
              ) : (
                eventsByDay.map((g) => (
                  <section key={g.day} aria-label={`Ngày ${g.day}`}>
                    <h2 className="tv-day">{g.day}</h2>
                    <ul className="tv-timeline">
                      {g.items.map((e) => {
                        const f = FEATURE_LABELS[e.tinh_nang] ?? { verb: 'thao tác', icon: 'file' as IconName };
                        const where = [
                          e.lop_hoc ? `Lớp ${e.lop_hoc}` : e.khoi_lop ? `Khối ${e.khoi_lop}` : '',
                          e.mon_hoc ? subjectName(e.mon_hoc) : '',
                          e.so_phut ? `tiết kiệm ${e.so_phut} phút` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ');
                        return (
                          <li className="tv-event" key={e.id}>
                            <span className="tv-event-ico">
                              <Icon name={f.icon} size={18} />
                            </span>
                            <div className="tv-event-text">
                              <b>{e.nguoi?.ten || 'Một giáo viên'}</b> {f.verb}
                              {e.hoc_sinh ? ' cho một học sinh' : ''}
                              {where && <span className="tv-event-meta">{where}</span>}
                            </div>
                            <time className="tv-event-time" dateTime={e.luc}>
                              {formatTime(e.luc)}
                            </time>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))
              )}
            </>
          )}

          <p className="tv-foot">
            Quản trị: <a href="/api/usage" target="_blank" rel="noreferrer">dữ liệu nhật ký dạng JSON</a>
          </p>
        </div>

        {showDetail && selected && <Detail key={selected.id} res={selected} onClose={closeDetail} />}
      </div>
    </Shell>
  );
}
