'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchJson, friendlyError } from '@/lib/ui/fetchJson';
import { Shell } from '@/components/Shell';
import { Icon } from '@/components/ui/icons';
import { LibraryDetail } from '@/components/kho/LibraryDetail';
import { GRADES, SUBJECTS } from '@/lib/catalog';
import { ARTIFACT_LABELS, type ResourceKind } from '@/lib/resources/types';
import type { KhoStatus } from '@/components/kho/types';
import '../ui-du.css';
import '../ui-kho.css';

interface Row {
  atomId: string;
  code: string;
  title: string;
  chapter: string;
  lesson: string;
  status: KhoStatus;
  hasPackage?: boolean;
  version?: number;
  kinds: ResourceKind[];
}

type Filter = 'all' | 'ready' | 'approved' | 'pending';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'ready', label: 'Có gói kiến thức' },
  { id: 'approved', label: 'Đã duyệt chuẩn' },
  { id: 'pending', label: 'AI soạn từ dữ liệu cơ bản' },
];

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').toLowerCase();

export default function KhoPage() {
  const [subject, setSubject] = useState('toan');
  const [grade, setGrade] = useState('10');
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      try {
        const qs = new URLSearchParams({ subject, grade });
        const data = await fetchJson<{ ok?: boolean; items?: Row[] }>(`/api/kho/library?${qs.toString()}`, { signal });
        setRows(data.items || []);
      } catch (e) {
        if (signal?.aborted) return;
        setRows([]);
        setError(friendlyError(e, 'Không tải được thư viện tiết học.'));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [subject, grade],
  );

  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    return () => c.abort();
  }, [load]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      ready: rows.filter((r) => r.status === 'approved' || r.status === 'chua_duyet').length,
      approved: rows.filter((r) => r.status === 'approved').length,
      pending: rows.filter((r) => r.status === 'khong_co').length,
    }),
    [rows],
  );

  const chapters = useMemo(() => {
    const nq = norm(q.trim());
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      if (filter === 'ready' && r.status !== 'approved' && r.status !== 'chua_duyet') continue;
      if (filter === 'approved' && r.status !== 'approved') continue;
      if (filter === 'pending' && r.status !== 'khong_co') continue;
      if (nq && !norm(`${r.title} ${r.code} ${r.lesson}`).includes(nq)) continue;
      const k = r.chapter || 'Chưa rõ chương';
      map.set(k, [...(map.get(k) || []), r]);
    }
    return [...map];
  }, [rows, filter, q]);

  const openRow = rows.find((r) => r.atomId === openId);
  const searching = q.trim().length > 0;

  return (
    <Shell title="Thư viện tiết học" subtitle="Mỗi tiết một bản chuẩn đã qua người duyệt. Chọn bài để xem và soạn.">
      <div className="kh-lib-filters">
        <div>
          <label className="ag-field-label" htmlFor="kh-subject">
            Môn
          </label>
          <select id="kh-subject" className="ag-field" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {SUBJECTS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.shortName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="ag-field-label" htmlFor="kh-grade">
            Khối
          </label>
          <select id="kh-grade" className="ag-field" value={grade} onChange={(e) => setGrade(e.target.value)}>
            {GRADES.map((g) => (
              <option key={g.grade} value={g.grade}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="ag-field-label" htmlFor="kh-search">
            Tìm theo tên bài
          </label>
          <input
            id="kh-search"
            className="ag-field"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ví dụ: hàm số bậc hai"
            maxLength={100}
          />
        </div>
      </div>

      <div className="kh-lib-chips du-chips" role="group" aria-label="Lọc theo trạng thái" style={{ marginTop: 0 }}>
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="du-chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
            {!loading && !error && <b>{counts[f.id]}</b>}
          </button>
        ))}
      </div>

      {!loading && !error && rows.length > 0 && (
        <div className="kh-summary" role="group" aria-label="Tổng quan môn và khối đang chọn">
          <div className="kh-sum-main">
            <b>{counts.approved}</b>
            <span>
              trên {counts.all} bài đã có bản chuẩn được duyệt ({Math.round((counts.approved / Math.max(1, counts.all)) * 100)}%)
            </span>
          </div>
          <div
            className="kh-sum-bar"
            role="progressbar"
            aria-label="Tỷ lệ bài đã duyệt chuẩn"
            aria-valuemin={0}
            aria-valuemax={counts.all}
            aria-valuenow={counts.approved}
          >
            <i style={{ width: `${(counts.approved / Math.max(1, counts.all)) * 100}%` }} />
          </div>
          <p>
            Bài chưa có bản chuẩn vẫn soạn được: AI sẽ soạn từ dữ liệu cơ bản của chương trình, và cô/thầy nên rà lại trước khi dùng.
          </p>
        </div>
      )}

      {error && (
        <div className="ag-alert bad" role="alert">
          <Icon name="alert" size={18} />
          <div>
            {error}{' '}
            <button type="button" className="ag-link kh-tap" onClick={() => void load()}>
              Thử lại
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="kh-grid" aria-busy="true" aria-label="Đang tải thư viện">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="kh-skel-card" />
          ))}
        </div>
      ) : (
        <>
          {!error && chapters.length === 0 && (
            <div className="du-empty kh-empty">
              <Icon name="library" size={32} />
              <strong>{rows.length === 0 ? 'Chưa có bài nào cho môn và khối này' : 'Không có bài khớp bộ lọc'}</strong>
              {rows.length === 0 ? 'Thử đổi môn hoặc khối khác.' : 'Thử bỏ bớt từ khoá hoặc đổi trạng thái lọc.'}
              {rows.length > 0 && (
                <button
                  type="button"
                  className="ag-btn small"
                  onClick={() => {
                    setQ('');
                    setFilter('all');
                  }}
                >
                  Xoá bộ lọc
                </button>
              )}
            </div>
          )}
          {chapters.map(([chapter, list], idx) => {
            const readyCount = list.filter((r) => r.status === 'approved' || r.status === 'chua_duyet').length;
            const approvedCount = list.filter((r) => r.status === 'approved').length;
            return (
              <details key={chapter} className="kh-chap" open={searching || idx < 2}>
                <summary>
                  <span className="kh-chap-name">
                    <Icon name="chevron" size={18} className="kh-chev" />
                    {chapter}
                  </span>
                  <small>
                    {approvedCount > 0
                      ? `${approvedCount}/${list.length} đã duyệt · ${readyCount} có gói kiến thức`
                      : `${readyCount}/${list.length} bài có gói kiến thức`}
                  </small>
                </summary>
                <div className="kh-grid">
                  {list.map((r) => (
                    <button
                      key={r.atomId}
                      type="button"
                      className={`kh-lesson-card${r.status === 'approved' ? ' ok' : ''}`}
                      onClick={() => setOpenId(r.atomId)}
                    >
                      <span className="t">{r.title}</span>
                      {r.lesson && <span className="s">{r.lesson}</span>}
                      <span className="kh-row">
                        {r.status === 'approved' ? (
                          <span className="ag-status ok">Đã duyệt chuẩn{r.version ? `, v${r.version}` : ''}</span>
                        ) : r.status === 'chua_duyet' ? (
                          <span className="ag-status draft">Có gói kiến thức · Chờ duyệt</span>
                        ) : (
                          <span className="ag-status none">AI soạn từ dữ liệu cơ bản</span>
                        )}
                      </span>
                      {r.kinds.length > 0 && (
                        <span className="kh-row" aria-label="Các dạng tài nguyên đã có">
                          {r.kinds.map((k) => (
                            <span key={k} className="kh-pill">
                              {ARTIFACT_LABELS[k].replace(/ \(.*\)$/, '')}
                            </span>
                          ))}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </details>
            );
          })}
        </>
      )}

      {openId && <LibraryDetail atomId={openId} fallbackTitle={openRow?.title || ''} onClose={() => setOpenId(null)} />}
    </Shell>
  );
}
