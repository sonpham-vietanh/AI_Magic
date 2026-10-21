'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shell } from '@/components/Shell';
import { ArtifactView } from '@/components/resources/ArtifactView';
import { Icon } from '@/components/ui/icons';
import { diffLines } from '@/lib/versions/diff';
import type { VersionRecord, VersionSummary } from '@/lib/versions/types';
import { FORMAT_DAU_RA } from '@/lib/workflows/types';
import '../ui-ls.css';

const ACTOR_KEY = 'va.actor';

function formatLabel(id: string): string {
  return FORMAT_DAU_RA.find((f) => f.id === id)?.label ?? id;
}
function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

type Detail = Omit<VersionRecord, 'orgId'>;

export default function LichSuPage() {
  const [actor, setActor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [ready, setReady] = useState(false);
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Detail | null>(null);
  const [previous, setPrevious] = useState<Detail | null>(null);
  const [compare, setCompare] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    try {
      const v = localStorage.getItem(ACTOR_KEY);
      if (v && v.trim()) setActor(v.trim());
    } catch {
      /* không có localStorage */
    }
    setReady(true);
  }, []);

  const load = useCallback(async (name: string) => {
    setError('');
    setVersions(null);
    try {
      const r = await fetch(`/api/versions?actor=${encodeURIComponent(name)}&limit=200`);
      const j = await r.json();
      if (j.ok) setVersions(j.versions as VersionSummary[]);
      else setError(j.error || 'Không thể tải lịch sử.');
    } catch {
      setError('Không thể kết nối máy chủ để tải lịch sử.');
    }
  }, []);

  useEffect(() => {
    if (actor) void load(actor);
  }, [actor, load]);

  const fetchOne = async (id: string): Promise<Detail | null> => {
    const r = await fetch(`/api/versions?id=${encodeURIComponent(id)}`);
    const j = await r.json();
    return j.ok ? (j.version as Detail) : null;
  };

  const open = async (s: VersionSummary) => {
    setBusy(s.id);
    setCompare(false);
    setPrevious(null);
    setError('');
    try {
      const cur = await fetchOne(s.id);
      if (!cur) {
        setError('Không mở được phiên bản này.');
        return;
      }
      setSelected(cur);
      const prev = (versions ?? [])
        .filter((v) => v.lessonKey === s.lessonKey && v.format === s.format && v.number < s.number)
        .sort((a, b) => b.number - a.number)[0];
      if (prev) setPrevious(await fetchOne(prev.id));
    } catch {
      setError('Không mở được phiên bản này.');
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

  const groups = useMemo(() => {
    const map = new Map<string, { title: string; byFormat: Map<string, VersionSummary[]> }>();
    for (const v of versions ?? []) {
      const g = map.get(v.lessonKey) ?? { title: v.lessonTitle || v.lessonKey, byFormat: new Map() };
      const list = g.byFormat.get(v.format) ?? [];
      list.push(v);
      g.byFormat.set(v.format, list);
      map.set(v.lessonKey, g);
    }
    for (const g of map.values()) for (const l of g.byFormat.values()) l.sort((a, b) => b.number - a.number);
    return [...map.entries()];
  }, [versions]);

  const diff = useMemo(
    () => (compare && selected && previous ? diffLines(previous.text, selected.text) : null),
    [compare, selected, previous],
  );

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

  return (
    <Shell
      title="Lịch sử của tôi"
      subtitle="Các phiên bản cô/thầy đã duyệt và dùng, theo từng bài và từng loại sản phẩm."
    >
      <div className="ls">
        <div className="ag-alert info" role="note" style={{ marginTop: 0 }}>
          <Icon name="clock" size={18} />
          <span>
            Nhập họ tên giáo viên để tra cứu các phiên bản bài soạn đã lưu, so sánh thay đổi giữa các lần chỉnh sửa và tải về file Word (.docx).
          </span>
        </div>

        {ready && !actor && (
          <form
            className="ls-form"
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

        {actor && (
          <div className="ls-who">
            <span>Đang xem lịch sử của <strong>{actor}</strong></span>
            <button type="button" className="ag-btn small" onClick={changeActor}>Đổi tên</button>
          </div>
        )}

        {error && <p className="ls-error" role="alert">{error}</p>}
        {actor && !versions && !error && <p>Đang tải…</p>}

        {versions && versions.length === 0 && (
          <div className="ls-empty">
            Chưa có phiên bản nào. Phiên bản được tạo mỗi khi cô/thầy bấm <strong>Duyệt &amp; dùng</strong> ở Trợ lý soạn bài.
            <div style={{ marginTop: 12 }}>
              <Link href="/" className="ag-btn primary">Mở trợ lý soạn bài</Link>
            </div>
          </div>
        )}

        {versions && versions.length > 0 && (
          <div className="ls-grid">
            <div className="ls-list">
              {groups.map(([key, g]) => (
                <section key={key} className="ls-lesson" aria-label={g.title}>
                  <h3>{g.title}</h3>
                  {[...g.byFormat.entries()].map(([fmt, list]) => (
                    <div key={fmt}>
                      <div className="ls-fmt">{formatLabel(fmt)}</div>
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
                <div className="ls-empty">Chọn một phiên bản ở bên trái để xem nội dung.</div>
              ) : (
                <article className="ls-detail" aria-label="Nội dung phiên bản">
                  <h2>{selected.title}</h2>
                  <p className="ls-detail-meta">
                    {formatLabel(selected.format)} · Phiên bản {selected.number} · {when(selected.createdAt)}
                  </p>
                  <div className="ls-actions">
                    <Link href={`/?v=${encodeURIComponent(selected.id)}`} className="ag-btn primary">
                      <Icon name="sparkles" size={18} />
                      Mở trong trợ lý để tiếp tục
                    </Link>
                    <button type="button" className="ag-btn" onClick={downloadDocx}>
                      <Icon name="download" size={18} />
                      Tải văn bản (.docx)
                    </button>
                    {previous ? (
                      <button type="button" className="ag-btn" aria-pressed={compare} onClick={() => setCompare((c) => !c)}>
                        {compare ? 'Xem nội dung' : `So sánh với phiên bản ${previous.number}`}
                      </button>
                    ) : (
                      <span className="ls-detail-meta" style={{ alignSelf: 'center', margin: 0 }}>
                        Đây là phiên bản đầu của sản phẩm này, chưa có bản trước để so sánh.
                      </span>
                    )}
                  </div>

                  {diff ? (
                    <>
                      <p className="ls-diff-sum">
                        So với phiên bản {previous?.number}: thêm {diff.added} dòng, xoá {diff.removed} dòng, giữ {diff.unchanged} dòng.
                      </p>
                      <div className="ls-diff" role="region" aria-label="So sánh theo dòng" tabIndex={0}>
                        {diff.lines.map((l, i) => (
                          <div key={i} className={`ls-diff-line ${l.kind}`}>
                            <span aria-label={l.kind === 'add' ? 'thêm' : l.kind === 'del' ? 'xoá' : 'giữ nguyên'}>
                              {l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ''}
                            </span>
                            <span>{l.text || ' '}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <pre className="ls-text">{selected.text || '(Không có văn bản)'}</pre>
                  )}

                  {!compare &&
                    (selected.artifacts ?? []).map((a, i) => (
                      <section key={i} className="ls-art" aria-label={a.title}>
                        <ArtifactView artifact={a} />
                      </section>
                    ))}
                </article>
              )}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
