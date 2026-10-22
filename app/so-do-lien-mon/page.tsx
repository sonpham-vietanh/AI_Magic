'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import '@/app/ui-sd.css';
import { Shell } from '@/components/Shell';
import { RelationGraph, type GraphLink } from '@/components/graph/RelationGraph';
import { WeeklyTopics } from '@/components/graph/WeeklyTopics';
import { planHref } from '@/components/graph/links';
import { dedupeEdgesByAtom, edgePriority } from '@/components/graph/layout';
import { LINK_LABEL, SUBJECT_NAMES, cleanMath, linkKind, subjectCode, subjectTone } from '@/components/graph/meta';
import type {
  SupabaseAtom,
  SupabaseEdge,
  SupabaseQuestion,
  SupabaseSocratic,
} from '@/lib/supabase';
import { classifySearchQuery } from '@/lib/ui/searchQuery';

async function readApiJson<T>(res: Response): Promise<T> {
  let body: (T & { error?: string }) | null = null;
  try {
    body = (await res.json()) as T & { error?: string };
  } catch {
    body = null;
  }
  if (!res.ok || !body) {
    if (res.status === 429) {
      throw new Error('Hệ thống đang quá tải, vui lòng thử lại sau ít phút.');
    }
    throw new Error(body?.error || `Máy chủ trả về lỗi (${res.status}). Vui lòng thử lại sau.`);
  }
  return body;
}

interface AtomDetail {
  atom: SupabaseAtom | null;
  edges: SupabaseEdge[];
  questions: SupabaseQuestion[];
  socratic: SupabaseSocratic[];
}

type Tab = 'graph' | 'weekly';
type View = 'graph' | 'list';

function directionText(edge: SupabaseEdge): string {
  const k = linkKind(edge);
  if (k !== 'hard' && k !== 'soft') return '';
  return edge.direction === 'incoming' ? 'Học trước bài này' : 'Học sau bài này';
}

export default function KnowledgeGraphPage() {
  const [tab, setTab] = useState<Tab>('graph');

  const [sbSubject, setSbSubject] = useState<string>('Toán');
  const [sbGrade, setSbGrade] = useState<string>('7');
  const [sbSearch, setSbSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [loadError, setLoadError] = useState<string>('');
  const [atoms, setAtoms] = useState<SupabaseAtom[]>([]);
  const [atomsTotal, setAtomsTotal] = useState<number>(0);
  const [loadingList, setLoadingList] = useState<boolean>(false);

  const [selectedAtomId, setSelectedAtomId] = useState<string>('KC-4402137');
  // true: bài đang xem do người dùng bấm trên đồ thị, không bị danh sách tìm kiếm ghi đè.
  const pinnedRef = useRef<boolean>(true);
  const [atomDetail, setAtomDetail] = useState<AtomDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  const [selectedLinkId, setSelectedLinkId] = useState<string>('');
  const [viewPref, setViewPref] = useState<View | null>(null);
  const [narrow, setNarrow] = useState<boolean>(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 699px)');
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(sbSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [sbSearch]);

  useEffect(() => {
    if (tab !== 'graph') return;
    const ctrl = new AbortController();
    setLoadingList(true);
    const params = new URLSearchParams();
    const parsedQuery = classifySearchQuery(debouncedSearch);
    if (parsedQuery.kind === 'atomId') {
      params.set('atomId', parsedQuery.atomId);
    } else {
      if (sbSubject !== 'all') params.set('subject', sbSubject);
      if (sbGrade !== 'all') params.set('grade', sbGrade);
      if (parsedQuery.kind === 'text') params.set('q', parsedQuery.q);
      params.set('limit', '60');
    }

    fetch(`/api/supabase/knowledge?${params.toString()}`, { signal: ctrl.signal })
      .then((r) =>
        readApiJson<{
          ok?: boolean;
          atoms?: SupabaseAtom[];
          atom?: SupabaseAtom | null;
          totalCount?: number;
        }>(r),
      )
      .then((data) => {
        const list =
          parsedQuery.kind === 'atomId' ? (data.atom ? [data.atom] : []) : data.atoms || [];
        setLoadError('');
        setAtoms(list);
        setAtomsTotal(data.totalCount || list.length);
        setSelectedAtomId((cur) => {
          if (list.length === 0) return '';
          if (cur && pinnedRef.current) return cur;
          return list.some((a) => a.id === cur) ? cur : list[0].id;
        });
        if (list.length === 0) setAtomDetail(null);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setAtoms([]);
        setAtomsTotal(0);
        setSelectedAtomId('');
        setAtomDetail(null);
        setLoadError(err instanceof Error ? err.message : 'Không tải được danh sách bài học.');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingList(false);
      });
    return () => ctrl.abort();
  }, [tab, sbSubject, sbGrade, debouncedSearch]);

  useEffect(() => {
    if (tab !== 'graph') return;
    if (!selectedAtomId) {
      setAtomDetail(null);
      return;
    }
    const ctrl = new AbortController();
    setLoadingDetail(true);
    fetch(`/api/supabase/knowledge?atomId=${encodeURIComponent(selectedAtomId)}`, {
      signal: ctrl.signal,
    })
      .then((r) =>
        readApiJson<{
          ok?: boolean;
          atom?: SupabaseAtom | null;
          edges?: SupabaseEdge[];
          questions?: SupabaseQuestion[];
          socratic?: SupabaseSocratic[];
        }>(r),
      )
      .then((data) => {
        if (data.ok) {
          setLoadError('');
          setAtomDetail({
            atom: data.atom || null,
            edges: data.edges || [],
            questions: data.questions || [],
            socratic: data.socratic || [],
          });
        }
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setAtomDetail(null);
        setLoadError(err instanceof Error ? err.message : 'Không tải được chi tiết bài học.');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingDetail(false);
      });
    return () => ctrl.abort();
  }, [tab, selectedAtomId]);

  const center = atomDetail?.atom && atomDetail.atom.id === selectedAtomId ? atomDetail.atom : null;

  const links: GraphLink[] = useMemo(() => {
    if (!center || !atomDetail) return [];
    return dedupeEdgesByAtom(atomDetail.edges)
      .filter((e) => e.linkedAtom && e.linkedAtom.id !== center.id)
      .sort((a, b) => edgePriority(b) - edgePriority(a))
      .map((e) => ({ edge: e, atom: e.linkedAtom as SupabaseAtom }));
  }, [center, atomDetail]);

  // Mặc định chọn sẵn liên kết ưu tiên cao nhất để nút "Soạn bài tích hợp" luôn sẵn sàng.
  const activeLink = links.find((l) => l.atom.id === selectedLinkId) || links[0] || null;

  const view: View = viewPref ?? (narrow ? 'list' : 'graph');

  const pickAtom = (id: string) => {
    pinnedRef.current = false;
    setSelectedLinkId('');
    setSelectedAtomId(id);
  };
  const recenter = (id: string) => {
    pinnedRef.current = true;
    setSelectedLinkId('');
    setSelectedAtomId(id);
    if (typeof window !== 'undefined') window.scrollTo?.({ top: 0 });
  };

  return (
    <Shell title="Sơ đồ liên môn" subtitle="Chọn một bài để xem các bài liên quan và soạn kế hoạch tích hợp.">
      <div className="sd">
        <div className="sd-tabs" role="tablist" aria-label="Chế độ xem">
          <button
            type="button"
            role="tab"
            id="sd-tab-graph"
            aria-selected={tab === 'graph'}
            aria-controls="sd-panel-main"
            className="ag-tab"
            onClick={() => setTab('graph')}
          >
            Liên kết giữa các bài
          </button>
          <button
            type="button"
            role="tab"
            id="sd-tab-weekly"
            aria-selected={tab === 'weekly'}
            aria-controls="sd-panel-main"
            className="ag-tab"
            onClick={() => setTab('weekly')}
          >
            Chủ đề liên môn theo tuần
          </button>
        </div>

        <div id="sd-panel-main" role="tabpanel" aria-labelledby={`sd-tab-${tab}`}>
          {tab === 'weekly' ? (
            <WeeklyTopics />
          ) : (
            <div className="sd-layout">
              {/* ---------- Tìm bài ---------- */}
              <aside className="sd-side" aria-label="Tìm bài học theo môn và lớp">
                <div className="ag-field-row">
                  <div>
                    <label className="ag-field-label" htmlFor="sb-subject">
                      Môn
                    </label>
                    <select
                      id="sb-subject"
                      className="ag-field"
                      value={sbSubject}
                      onChange={(e) => {
                        pinnedRef.current = false;
                        setSbSubject(e.target.value);
                      }}
                    >
                      <option value="all">Tất cả môn</option>
                      {SUBJECT_NAMES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="ag-field-label" htmlFor="sb-grade">
                      Lớp
                    </label>
                    <select
                      id="sb-grade"
                      className="ag-field"
                      value={sbGrade}
                      onChange={(e) => {
                        pinnedRef.current = false;
                        setSbGrade(e.target.value);
                      }}
                    >
                      <option value="all">Tất cả lớp</option>
                      {['6', '7', '8', '9', '10', '11', '12'].map((g) => (
                        <option key={g} value={g}>
                          Lớp {g}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="ag-field-label" htmlFor="sb-search">
                    Tìm bài (tên hoặc mã KC-…)
                  </label>
                  <input
                    id="sb-search"
                    type="search"
                    className="ag-field"
                    value={sbSearch}
                    onChange={(e) => {
                      pinnedRef.current = false;
                      setSbSearch(e.target.value);
                    }}
                    placeholder="Ví dụ: phân số, KC-4402137"
                    autoComplete="off"
                  />
                </div>

                <div className="sd-side-count" aria-live="polite">
                  {loadingList ? (
                    <>
                      <span className="ag-spin" style={{ display: 'inline-block', verticalAlign: 'middle' }} /> Đang tìm...
                    </>
                  ) : (
                    `${atomsTotal.toLocaleString('vi-VN')} bài`
                  )}
                </div>

                <div className="sd-results">
                  {!loadingList && atoms.length === 0 && (
                    <p className="ag-note">Không có bài nào khớp. Cô/thầy thử đổi từ khoá hoặc lớp.</p>
                  )}
                  {atoms.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="sd-atom"
                      aria-current={a.id === selectedAtomId}
                      onClick={() => pickAtom(a.id)}
                    >
                      <b>{cleanMath(a.title)}</b>
                      <small>
                        {a.subject} · Lớp {a.grade}
                        {a.chapter ? ` · ${a.chapter}` : ''}
                      </small>
                    </button>
                  ))}
                </div>
              </aside>

              {/* ---------- Đồ thị + chi tiết ---------- */}
              <div className="sd-main">
                {loadError && (
                  <div role="alert" className="ag-alert bad" style={{ marginTop: 0 }}>
                    {loadError}
                  </div>
                )}

                {!center && !loadingDetail && (
                  <div className="sd-panel sd-empty">
                    {atoms.length === 0 && !loadingList
                      ? 'Chưa có bài nào để hiển thị. Hãy đổi từ khoá hoặc lớp.'
                      : 'Chọn một bài ở danh sách để xem liên kết.'}
                  </div>
                )}
                {!center && loadingDetail && (
                  <div className="sd-panel sd-empty">
                    <span className="ag-spin" style={{ display: 'inline-block', verticalAlign: 'middle' }} /> Đang tải bài...
                  </div>
                )}

                {center && (
                  <section className="sd-panel" aria-label="Liên kết của bài đang chọn">
                    {loadingDetail && (
                      <div className="sd-loading" role="status">
                        <span className="ag-spin" /> Đang tải...
                      </div>
                    )}
                    <div className="sd-head">
                      <div style={{ minWidth: 0 }}>
                        <h2>{cleanMath(center.title)}</h2>
                        <div className="sd-meta">
                          <span className="sd-pill">
                            {center.subject} · Lớp {center.grade}
                          </span>
                          {center.chapter && <span className="sd-pill gold">{center.chapter}</span>}
                          <span className="sd-pill">{links.length} liên kết</span>
                        </div>
                      </div>
                      <div className="sd-seg" role="group" aria-label="Cách xem liên kết">
                        <button type="button" aria-pressed={view === 'graph'} onClick={() => setViewPref('graph')}>
                          Đồ thị
                        </button>
                        <button type="button" aria-pressed={view === 'list'} onClick={() => setViewPref('list')}>
                          Danh sách
                        </button>
                      </div>
                    </div>

                    {links.length === 0 ? (
                      <p className="ag-note">Bài này chưa có liên kết với bài khác.</p>
                    ) : view === 'graph' ? (
                      <RelationGraph
                        center={center}
                        links={links}
                        selectedId={activeLink?.atom.id ?? ''}
                        onSelect={setSelectedLinkId}
                        onRecenter={recenter}
                      />
                    ) : (
                      <ul className="sd-links" aria-label="Các bài liên kết">
                        {links.map(({ edge, atom }) => {
                          const kind = linkKind(edge);
                          return (
                            <li key={atom.id}>
                              <button
                                type="button"
                                className={`sd-link sd-t${subjectTone(atom.subject)}`}
                                aria-pressed={atom.id === activeLink?.atom.id}
                                onClick={() => setSelectedLinkId(atom.id)}
                              >
                                <span className="sd-code" aria-hidden="true">
                                  <span>{subjectCode(atom.subject)}</span>
                                </span>
                                <span className="sd-link-body">
                                  <b>{cleanMath(atom.title)}</b>
                                  <small>
                                    {atom.subject} · Lớp {atom.grade} · {LINK_LABEL[kind]}
                                  </small>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                )}

                {center && activeLink && (
                  <section className="sd-panel" aria-live="polite" aria-label="Chi tiết liên kết">
                    <div className="ag-label" style={{ padding: 0 }}>
                      Cặp liên kết đang chọn
                    </div>
                    <div className="sd-pair">
                      <div className="sd-pair-node">
                        <small>Bài đang xem</small>
                        <b>{cleanMath(center.title)}</b>
                        <span>
                          {center.subject} · Lớp {center.grade}
                        </span>
                      </div>
                      <div className="sd-pair-mid" aria-hidden="true">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </div>
                      <div className="sd-pair-node">
                        <small>Bài liên kết</small>
                        <b>{cleanMath(activeLink.atom.title)}</b>
                        <span>
                          {activeLink.atom.subject} · Lớp {activeLink.atom.grade}
                        </span>
                      </div>
                    </div>

                    <div className="sd-meta" style={{ marginBottom: 10 }}>
                      <span className="sd-pill">{LINK_LABEL[linkKind(activeLink.edge)]}</span>
                      {activeLink.edge.cross_subject && (
                        <span className="sd-pill gold">Liên môn: {activeLink.edge.cross_subject}</span>
                      )}
                      {directionText(activeLink.edge) && (
                        <span className="sd-pill">{directionText(activeLink.edge)}</span>
                      )}
                    </div>

                    {activeLink.edge.quan_niem_sai && (
                      <p className="sd-hint">
                        <b>Lỗi học sinh hay gặp:</b> {activeLink.edge.quan_niem_sai}
                      </p>
                    )}
                    {activeLink.edge.remediation_hint && (
                      <p className="sd-hint">
                        <b>Gợi ý:</b> {activeLink.edge.remediation_hint}
                      </p>
                    )}

                    <div className="ag-actions">
                      <Link href={planHref(center, activeLink.atom.id)} className="ag-btn primary">
                        Soạn bài tích hợp 2 bài này
                      </Link>
                      <button type="button" className="ag-btn" onClick={() => recenter(activeLink.atom.id)}>
                        Mở bài này làm trung tâm
                      </button>
                    </div>
                  </section>
                )}

                {center && (
                  <section className="sd-panel" aria-label="Về bài đang xem">
                    <div className="ag-label" style={{ padding: 0 }}>
                      Soạn từ bài đang xem
                    </div>
                    <div className="sd-tools">
                      <Link
                        href={`/?format=ke_hoach&bai=${encodeURIComponent(center.id)}&baiTitle=${encodeURIComponent(center.title)}`}
                        className="ag-btn primary"
                      >
                        Soạn giáo án
                      </Link>
                      <Link
                        href={`/?format=de_kiem_tra&bai=${encodeURIComponent(center.id)}&baiTitle=${encodeURIComponent(center.title)}`}
                        className="ag-btn"
                      >
                        Tạo đề kiểm tra
                      </Link>
                      <Link
                        href={`/?format=worksheet&bai=${encodeURIComponent(center.id)}&baiTitle=${encodeURIComponent(center.title)}`}
                        className="ag-btn"
                      >
                        Tạo phiếu học tập
                      </Link>
                      <Link
                        href={`/cong-cu?nodeId=${encodeURIComponent(center.id)}&tool=khbd-5512`}
                        className="ag-btn"
                      >
                        Mở trong Kho công cụ
                      </Link>
                    </div>

                    <details className="sd-sec">
                      <summary>Yêu cầu cần đạt và năng lực</summary>
                      <div className="sd-item">
                        <b>Yêu cầu cần đạt:</b> {center.yeu_cau || center.title}
                        <br />
                        <b>Bài học:</b> {center.lesson}
                        <br />
                        <b>Năng lực:</b> {center.nang_luc || 'Giải quyết vấn đề và sáng tạo'}
                        <br />
                        <b>Mức nhận thức:</b> {center.bloom} · DOK {center.dok}
                        {center.quan_niem_sai && (
                          <>
                            <br />
                            <b>Lỗi học sinh hay gặp:</b> {center.quan_niem_sai}
                          </>
                        )}
                      </div>
                    </details>

                    <details className="sd-sec">
                      <summary>Câu hỏi kiểm tra ({atomDetail?.questions.length ?? 0})</summary>
                      {(atomDetail?.questions.length ?? 0) === 0 && (
                        <p className="ag-note">Bài này chưa có câu hỏi đính kèm.</p>
                      )}
                      {atomDetail?.questions.map((q, idx) => (
                        <div key={q.id} className="sd-item">
                          <b>
                            Câu {idx + 1} · {q.do_kho} · DOK {q.dok}
                          </b>
                          <div>{q.noi_dung}</div>
                          <div className="sd-ans">Đáp án đúng: {q.dap_an}</div>
                          <div style={{ marginTop: 6 }}>
                            <b>Lời giải:</b> {q.loi_giai}
                          </div>
                          {Array.isArray(q.nhieu) && q.nhieu.length > 0 && (
                            <ul>
                              {q.nhieu.map((n, ni) => (
                                <li key={ni}>
                                  <b>&ldquo;{n.noiDung}&rdquo;</b>: {n.lyDo}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </details>

                    <details className="sd-sec">
                      <summary>Gợi ý hỏi đáp Socratic ({atomDetail?.socratic.length ?? 0})</summary>
                      {(atomDetail?.socratic.length ?? 0) === 0 && (
                        <p className="ag-note">Bài này chưa có kịch bản hỏi đáp.</p>
                      )}
                      {atomDetail?.socratic.map((soc) => (
                        <div key={soc.id} className="sd-item">
                          <b>Khi học sinh chọn sai: {soc.wrong_answer}</b>
                          <div>{soc.question_summary}</div>
                          <div style={{ color: 'var(--danger)', fontWeight: 700, marginTop: 4 }}>
                            Nhầm lẫn: {soc.misconception}
                          </div>
                          <div className="sd-steps">
                            <div className="sd-step">
                              <b>Bậc 1.</b> {soc.bac_1}
                            </div>
                            <div className="sd-step">
                              <b>Bậc 2.</b> {soc.bac_2}
                            </div>
                            <div className="sd-step">
                              <b>Bậc 3.</b> {soc.bac_3}
                            </div>
                            <div className="sd-step">
                              <b>Bậc 4.</b> {soc.bac_4}
                            </div>
                          </div>
                        </div>
                      ))}
                    </details>
                  </section>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

