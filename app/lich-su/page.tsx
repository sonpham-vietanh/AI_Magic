'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/Shell';
import { ArtifactView } from '@/components/resources/ArtifactView';
import { Icon } from '@/components/ui/icons';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { diffLines, type DiffLine } from '@/lib/versions/diff';
import { fetchJson, friendlyError } from '@/lib/ui/fetchJson';
import type { VersionRecord, VersionSummary } from '@/lib/versions/types';
import { FORMAT_DAU_RA } from '@/lib/workflows/types';
import '../ui-ls.css';

const ACTOR_KEY = 'va.actor';
const CONTEXT = 2;

function formatLabel(id: string): string {
  return FORMAT_DAU_RA.find((f) => f.id === id)?.label ?? id;
}
function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}
function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
}

type Detail = Omit<VersionRecord, 'orgId'>;
type Row = { kind: DiffLine['kind']; text: string; a?: number; b?: number } | { kind: 'gap'; count: number };

/** Gộp các dòng giữ nguyên dài thành một dòng "n dòng không đổi" để dễ nhìn thay đổi. */
function toRows(lines: DiffLine[]): Row[] {
  const nums: { kind: DiffLine['kind']; text: string; a?: number; b?: number }[] = [];
  let a = 0;
  let b = 0;
  for (const l of lines) {
    if (l.kind === 'same') nums.push({ ...l, a: ++a, b: ++b });
    else if (l.kind === 'del') nums.push({ ...l, a: ++a });
    else nums.push({ ...l, b: ++b });
  }
  const keep = nums.map((l) => l.kind !== 'same');
  const near = keep.map((_, i) => {
    for (let k = Math.max(0, i - CONTEXT); k <= Math.min(nums.length - 1, i + CONTEXT); k++) if (keep[k]) return true;
    return false;
  });
  const rows: Row[] = [];
  let hidden = 0;
  nums.forEach((l, i) => {
    if (near[i]) {
      if (hidden) rows.push({ kind: 'gap', count: hidden });
      hidden = 0;
      rows.push(l);
    } else hidden++;
  });
  if (hidden) rows.push({ kind: 'gap', count: hidden });
  return rows;
}

export default function LichSuPage() {
  const [sso, setSso] = useState(false);
  const [actor, setActor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [ready, setReady] = useState(false);
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Detail | null>(null);
  const [previous, setPrevious] = useState<Detail | null>(null);
  const [tab, setTab] = useState('noidung');
  const [busy, setBusy] = useState('');
  const [q, setQ] = useState('');
  const [fmt, setFmt] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      let ssoName: string | null = null;
      try {
        const me = await fetchJson<{ ssoEnabled?: boolean; user?: { name?: string; email?: string } | null }>('/api/me');
        if (me.ssoEnabled && me.user) ssoName = me.user.name || me.user.email || null;
        if (alive && me.ssoEnabled) setSso(true);
      } catch {
        /* chế độ cũ */
      }
      if (!alive) return;
      if (ssoName) {
        setActor(ssoName);
      } else {
        try {
          const v = localStorage.getItem(ACTOR_KEY);
          if (v && v.trim()) setActor(v.trim());
        } catch {
          /* không có localStorage */
        }
      }
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(async (name: string) => {
    setError('');
    setVersions(null);
    try {
      const j = await fetchJson<{ versions: VersionSummary[] }>(`/api/versions?actor=${encodeURIComponent(name)}&limit=200`);
      setVersions(j.versions);
    } catch (e) {
      setError(friendlyError(e, 'Chưa tải được lịch sử. Cô/thầy thử lại sau nhé.'));
    }
  }, []);

  useEffect(() => {
    if (actor) void load(actor);
  }, [actor, load]);

  const fetchOne = async (id: string): Promise<Detail | null> => {
    try {
      const j = await fetchJson<{ version: Detail }>(`/api/versions?id=${encodeURIComponent(id)}`);
      return j.version;
    } catch {
      return null;
    }
  };

  const open = async (s: VersionSummary) => {
    setBusy(s.id);
    setTab('noidung');
    setPrevious(null);
    setError('');
    try {
      const cur = await fetchOne(s.id);
      if (!cur) {
        setError('Chưa mở được phiên bản này. Cô/thầy thử lại nhé.');
        return;
      }
      setSelected(cur);
      const prev = (versions ?? [])
        .filter((v) => v.lessonKey === s.lessonKey && v.format === s.format && v.number < s.number)
        .sort((a, b) => b.number - a.number)[0];
      if (prev) setPrevious(await fetchOne(prev.id));
    } finally {
      setBusy('');
    }
  };

  const saveActor = () => {
    const name = draft.trim().slice(0, 100);
    if (!name) return;
    try {
      localStorage.setItem(ACTOR_KEY, name);
    } catch {
      /* bỏ qua */
    }
    setActor(name);
    setSelected(null);
  };
  const changeActor = () => {
    setActor(null);
    setDraft('');
    setVersions(null);
    setSelected(null);
  };

  const formatsPresent = useMemo(
    () => [...new Set((versions ?? []).map((v) => v.format))].sort((a, b) => formatLabel(a).localeCompare(formatLabel(b), 'vi')),
    [versions],
  );

  const filtered = useMemo(() => {
    const needle = fold(q.trim());
    return (versions ?? []).filter((v) => {
      if (fmt && v.format !== fmt) return false;
      const d = dayKey(v.createdAt);
      if (from && d && d < from) return false;
      if (to && d && d > to) return false;
      if (needle && !fold(`${v.lessonTitle ?? ''} ${v.title} ${v.lessonKey} ${formatLabel(v.format)}`).includes(needle)) return false;
      return true;
    });
  }, [versions, q, fmt, from, to]);

  const groups = useMemo(() => {
    const map = new Map<string, { title: string; byFormat: Map<string, VersionSummary[]> }>();
    for (const v of filtered) {
      const g = map.get(v.lessonKey) ?? { title: v.lessonTitle || v.title || v.lessonKey, byFormat: new Map() };
      const list = g.byFormat.get(v.format) ?? [];
      list.push(v);
      g.byFormat.set(v.format, list);
      map.set(v.lessonKey, g);
    }
    for (const g of map.values()) for (const l of g.byFormat.values()) l.sort((a, b) => b.number - a.number);
    return [...map.entries()];
  }, [filtered]);

  const filtering = !!(q || fmt || from || to);
  const clearFilters = () => {
    setQ('');
    setFmt('');
    setFrom('');
    setTo('');
  };

  const diff = useMemo(
    () => (selected && previous ? diffLines(previous.text, selected.text) : null),
    [selected, previous],
  );
  const rows = useMemo(() => (diff ? toRows(diff.lines) : []), [diff]);

  const downloadDocx = async () => {
    if (!selected) return;
    const { buildDocxBlob, downloadBlob } = await import('@/lib/export/docx');
    const blob = await buildDocxBlob({
      title: selected.title,
      subtitle: [`${formatLabel(selected.format)} · Phiên bản ${selected.number}`],
      sections: [{ heading: 'Nội dung', body: selected.text }],
    });
    downloadBlob(blob, `${selected.title.slice(0, 60)}-v${selected.number}.docx`);
  };

  const detailTabs = selected
    ? [
        {
          id: 'noidung',
          label: 'Nội dung',
          panel: (
            <>
              <pre className="ls-text">{selected.text || '(Không có văn bản)'}</pre>
              {(selected.artifacts ?? []).map((a, i) => (
                <section key={i} className="ls-art" aria-label={a.title}>
                  <ArtifactView artifact={a} />
                </section>
              ))}
            </>
          ),
        },
        {
          id: 'sosanh',
          label: previous ? `So sánh với bản ${previous.number}` : 'So sánh',
          disabled: !previous,
          panel: diff ? (
            <>
              <ul className="ls-diff-stats" aria-label="Tóm tắt thay đổi">
                <li className="add"><Icon name="plus" size={14} aria-hidden="true" />Thêm {diff.added} dòng</li>
                <li className="del"><span aria-hidden="true">−</span>Xoá {diff.removed} dòng</li>
                <li>Giữ {diff.unchanged} dòng</li>
              </ul>
              {diff.added === 0 && diff.removed === 0 ? (
                <p className="ls-detail-meta">Hai phiên bản giống hệt nhau về nội dung chữ.</p>
              ) : (
                <div className="ls-diff" role="region" aria-label="So sánh theo dòng" tabIndex={0}>
                  {rows.map((r, i) =>
                    r.kind === 'gap' ? (
                      <div key={i} className="ls-diff-gap">
                        {r.count} dòng không thay đổi
                      </div>
                    ) : (
                      <div key={i} className={`ls-diff-line ${r.kind}`}>
                        <span className="ls-diff-no" aria-hidden="true">{r.a ?? ''}</span>
                        <span className="ls-diff-no" aria-hidden="true">{r.b ?? ''}</span>
                        <span className="ls-diff-sign">
                          <span className="sr-only">{r.kind === 'add' ? 'Thêm: ' : r.kind === 'del' ? 'Xoá: ' : ''}</span>
                          <span aria-hidden="true">{r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ''}</span>
                        </span>
                        <span>{r.text || ' '}</span>
                      </div>
                    ),
                  )}
                </div>
              )}
            </>
          ) : null,
        },
      ]
    : [];

  return (
    <Shell
      title="Lịch sử của tôi"
      subtitle="Các phiên bản cô/thầy đã duyệt và dùng, theo từng bài và từng loại sản phẩm."
    >
      <div className="ls">
        {ready && !actor && (
          <div className="ls-intro">
            <div className="ls-intro-ico"><Icon name="clock" size={26} aria-hidden="true" /></div>
            <div>
              <h2>Xem lại các bài đã soạn</h2>
              <p>
                {sso
                  ? 'Cô/thầy cần đăng nhập bằng email của trường để xem lịch sử của mình.'
                  : 'Nhập họ tên để tra cứu các phiên bản bài soạn đã lưu, so sánh thay đổi giữa các lần chỉnh sửa và tải về tệp Word (.docx).'}
              </p>
              {sso ? (
                <Link href="/dang-nhap?next=/lich-su" className="ag-btn primary">Đăng nhập</Link>
              ) : (
                <form
                  className="ls-inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveActor();
                  }}
                >
                  <div className="ls-field">
                    <label className="ls-label" htmlFor="ls-actor">Tên của cô/thầy</label>
                    <input
                      id="ls-actor"
                      className="ls-input"
                      value={draft}
                      maxLength={100}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Ví dụ: Nguyễn Thị Lan"
                      autoComplete="name"
                    />
                  </div>
                  <button type="submit" className="ag-btn primary" disabled={!draft.trim()}>Xem lịch sử</button>
                </form>
              )}
            </div>
          </div>
        )}

        {actor && (
          <div className="ls-who">
            <span>
              Đang xem lịch sử của <strong>{actor}</strong>
            </span>
            {!sso && <button type="button" className="ag-btn small" onClick={changeActor}>Đổi tên</button>}
          </div>
        )}

        {error && (
          <div className="ls-error" role="alert">
            {error}{' '}
            {actor && !versions && (
              <button type="button" className="ag-btn small" onClick={() => void load(actor)}>Thử lại</button>
            )}
          </div>
        )}

        {actor && !versions && !error && (
          <div aria-busy="true" aria-label="Đang tải lịch sử" className="ls-skel-list">
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </div>
        )}

        {versions && versions.length === 0 && (
          <EmptyState
            icon="clock"
            title="Chưa có phiên bản nào"
            description={<>Phiên bản được tạo mỗi khi cô/thầy bấm <strong>Duyệt &amp; dùng</strong> ở Trợ lý soạn bài.</>}
            action={<Link href="/" className="ag-btn primary">Mở trợ lý soạn bài</Link>}
          />
        )}

        {versions && versions.length > 0 && (
          <>
            <form className="ls-filters" role="search" aria-label="Lọc lịch sử" onSubmit={(e) => e.preventDefault()}>
              <div className="ls-field ls-f-q">
                <label className="ls-label" htmlFor="ls-q">Tìm theo tên bài</label>
                <input id="ls-q" type="search" className="ls-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ví dụ: Phân số" />
              </div>
              <div className="ls-field">
                <label className="ls-label" htmlFor="ls-fmt">Loại sản phẩm</label>
                <select id="ls-fmt" className="ls-input" value={fmt} onChange={(e) => setFmt(e.target.value)}>
                  <option value="">Tất cả</option>
                  {formatsPresent.map((f) => (
                    <option key={f} value={f}>{formatLabel(f)}</option>
                  ))}
                </select>
              </div>
              <div className="ls-field">
                <label className="ls-label" htmlFor="ls-from">Từ ngày</label>
                <input id="ls-from" type="date" className="ls-input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="ls-field">
                <label className="ls-label" htmlFor="ls-to">Đến ngày</label>
                <input id="ls-to" type="date" className="ls-input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </div>
              {filtering && (
                <button type="button" className="ag-btn small" onClick={clearFilters}>
                  <Icon name="x" size={16} aria-hidden="true" />
                  Xoá bộ lọc
                </button>
              )}
            </form>
            <p className="ls-count" role="status">
              {filtering ? `${filtered.length} / ${versions.length} phiên bản phù hợp` : `${versions.length} phiên bản`}
            </p>

            {filtered.length === 0 ? (
              <EmptyState
                icon="folder"
                title="Không có phiên bản phù hợp"
                description="Cô/thầy thử đổi từ khoá hoặc nới khoảng ngày."
                action={<button type="button" className="ag-btn" onClick={clearFilters}>Xoá bộ lọc</button>}
              />
            ) : (
              <div className="ls-grid">
                <div className="ls-list">
                  {groups.map(([key, g]) => (
                    <section key={key} className="ls-lesson" aria-label={g.title}>
                      <h3>{g.title}</h3>
                      {[...g.byFormat.entries()].map(([f, list]) => (
                        <div key={f}>
                          <div className="ls-fmt">{formatLabel(f)}</div>
                          {list.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              className="ls-ver"
                              aria-current={selected?.id === v.id}
                              disabled={busy === v.id}
                              onClick={() => open(v)}
                            >
                              <span className="ls-ver-n">Phiên bản {v.number}</span>
                              <span className="ls-ver-meta">{when(v.createdAt)}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </section>
                  ))}
                </div>

                <div>
                  {!selected ? (
                    <EmptyState icon="file" title="Chọn một phiên bản" description="Bấm vào một phiên bản ở danh sách để xem nội dung và so sánh với bản trước." />
                  ) : (
                    <article className="ls-detail" aria-label="Nội dung phiên bản">
                      <h2>{selected.title}</h2>
                      <p className="ls-detail-meta">
                        {formatLabel(selected.format)} · Phiên bản {selected.number} · {when(selected.createdAt)}
                      </p>
                      <div className="ls-actions">
                        <Link href={`/?v=${encodeURIComponent(selected.id)}`} className="ag-btn primary">
                          <Icon name="sparkles" size={18} aria-hidden="true" />
                          Mở trong trợ lý để tiếp tục
                        </Link>
                        <button type="button" className="ag-btn" onClick={downloadDocx}>
                          <Icon name="download" size={18} aria-hidden="true" />
                          Tải văn bản (.docx)
                        </button>
                      </div>
                      {!previous && (
                        <p className="ls-detail-meta">Đây là phiên bản đầu của sản phẩm này, chưa có bản trước để so sánh.</p>
                      )}
                      <Tabs label="Cách xem phiên bản" items={detailTabs} value={tab} onChange={setTab} />
                    </article>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
