'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { GRADES, SUBJECTS } from '@/lib/catalog';
import {
  getConnectedNodes,
  getNodesByFilter,
  KNOWLEDGE_NODES,
  RELATION_LABELS,
} from '@/lib/knowledge-graph';
import type {
  SupabaseAtom,
  SupabaseEdge,
  SupabaseQuestion,
  SupabaseSocratic,
  SupabaseStatsOverview,
} from '@/lib/supabase';
import { classifySearchQuery } from '@/lib/ui/searchQuery';
import type { GradeLevel, SubjectCode } from '@/lib/types';

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
    throw new Error(
      body?.error || `Máy chủ trả về lỗi (${res.status}). Vui lòng thử lại sau.`,
    );
  }
  return body;
}

const SUPABASE_SUBJECTS = [
  'Toán',
  'Ngữ văn',
  'Tiếng Anh',
  'Khoa học tự nhiên',
  'Lịch sử và Địa lí',
  'Giáo dục công dân',
  'Tin học',
  'Công nghệ',
  'Vật lí',
  'Hoá học',
  'Sinh học',
  'Địa lí',
  'Giáo dục kinh tế và pháp luật',
  'Oxford English',
];

export default function KnowledgeGraphPage() {
  const [viewMode, setViewMode] = useState<'supabase' | 'weekly'>('supabase');

  // State cho Kho Tri thức Supabase (12.908 Atoms, 8.968 Edges, 12.986 Questions, 7.612 Socratic)
  const [overview, setOverview] = useState<SupabaseStatsOverview | null>(null);
  const [sbSubject, setSbSubject] = useState<string>('Toán');
  const [sbGrade, setSbGrade] = useState<string>('7');
  const [sbSearch, setSbSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [loadError, setLoadError] = useState<string>('');
  const [atoms, setAtoms] = useState<SupabaseAtom[]>([]);
  const [atomsTotal, setAtomsTotal] = useState<number>(0);
  const [loadingList, setLoadingList] = useState<boolean>(false);

  const [selectedAtomId, setSelectedAtomId] = useState<string>('KC-4402137');
  const [atomDetail, setAtomDetail] = useState<{
    atom: SupabaseAtom | null;
    edges: SupabaseEdge[];
    questions: SupabaseQuestion[];
    socratic: SupabaseSocratic[];
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  // State cho 34 Chủ đề Liên môn theo tuần
  const [grade, setGrade] = useState<GradeLevel | 'all'>('all');
  const [subject, setSubject] = useState<SubjectCode | 'all'>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string>(
    'kg-7-toan-thong-ke-bieu-do',
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(sbSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [sbSearch]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/supabase/knowledge?mode=overview', { signal: ctrl.signal })
      .then((r) =>
        readApiJson<{ ok?: boolean; overview?: SupabaseStatsOverview }>(r),
      )
      .then((data) => {
        if (data.ok && data.overview) setOverview(data.overview);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setLoadError(
          err instanceof Error ? err.message : 'Không tải được số liệu tổng quan.',
        );
      });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (viewMode !== 'supabase') return;
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

    fetch(`/api/supabase/knowledge?${params.toString()}`, {
      signal: ctrl.signal,
    })
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
          parsedQuery.kind === 'atomId'
            ? data.atom
              ? [data.atom]
              : []
            : data.atoms || [];
        setLoadError('');
        setAtoms(list);
        setAtomsTotal(data.totalCount || list.length);
        setSelectedAtomId((cur) => {
          if (list.length === 0) return '';
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
        setLoadError(
          err instanceof Error ? err.message : 'Không tải được danh sách bài học.',
        );
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingList(false);
      });
    return () => ctrl.abort();
  }, [viewMode, sbSubject, sbGrade, debouncedSearch]);

  useEffect(() => {
    if (viewMode !== 'supabase') return;
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
        setLoadError(
          err instanceof Error ? err.message : 'Không tải được chi tiết bài học.',
        );
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingDetail(false);
      });
    return () => ctrl.abort();
  }, [viewMode, selectedAtomId]);

  const weeklyNodes = getNodesByFilter({ grade, subject });
  const activeWeeklyNode =
    weeklyNodes.find((n) => n.id === selectedNodeId) ||
    KNOWLEDGE_NODES.find((n) => n.id === selectedNodeId) ||
    weeklyNodes[0];
  const weeklyConnections = activeWeeklyNode
    ? getConnectedNodes(activeWeeklyNode.id)
    : [];

  return (
    <Shell
      title="Sơ đồ Liên môn & Kho Tri thức Supabase"
      subtitle="Kết nối trực tiếp cơ sở dữ liệu School AI Factory (12.908 Đơn vị kiến thức, 8.968 Liên kết, 12.986 Câu hỏi & 7.612 Kịch bản Socratic)."
      rightActions={
        atomDetail?.atom ? (
          <Link
            href={`/?nodeId=${atomDetail.atom.id}&tool=khbd-5512`}
            className="btn btn-cta"
          >
            Soạn Giáo án từ Đơn vị Kiến thức này →
          </Link>
        ) : undefined
      }
    >
      <div className="stack" style={{ gap: '20px' }}>
        {/* THANH THỐNG KÊ SUPABASE LIVE & CHUYỂN CHẾ ĐỘ */}
        <section className="va-card-accent">
          <div className="row-between" style={{ marginBottom: '14px' }}>
            <div className="row-wrap">
              <button
                type="button"
                className={`va-tab ${viewMode === 'supabase' ? 'active' : ''}`}
                onClick={() => setViewMode('supabase')}
              >
                <span>Kho Tri thức Supabase (Live DB)</span>
                <span className="va-tab-count">
                  {(overview?.atomsCount || 12908).toLocaleString('vi-VN')} Atoms
                </span>
              </button>
              <button
                type="button"
                className={`va-tab ${viewMode === 'weekly' ? 'active' : ''}`}
                onClick={() => setViewMode('weekly')}
              >
                <span>Chủ đề Liên môn theo Tuần</span>
                <span className="va-tab-count">34 chủ đề</span>
              </button>
            </div>

            <div className="row-wrap">
              <span className="va-badge va-badge-navy">
                <b>{(overview?.atomsCount || 12908).toLocaleString('vi-VN')}</b> Đơn vị kiến thức
              </span>
              <span className="va-badge va-badge-gold">
                <b>{(overview?.edgesCount || 8968).toLocaleString('vi-VN')}</b> Cạnh liên kết
              </span>
              <span className="va-badge va-badge-green">
                <b>{(overview?.questionsCount || 12986).toLocaleString('vi-VN')}</b> Câu hỏi đánh giá
              </span>
              <span className="va-badge">
                <b>{(overview?.socraticCount || 7612).toLocaleString('vi-VN')}</b> Kịch bản Socratic 4 bậc
              </span>
            </div>
          </div>

          {viewMode === 'supabase' ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '14px',
                paddingTop: '12px',
                borderTop: '1px solid var(--line)',
              }}
            >
              <div className="field">
                <label htmlFor="sb-subject">1. Môn học (14 môn trên Supabase)</label>
                <select
                  id="sb-subject"
                  value={sbSubject}
                  onChange={(e) => setSbSubject(e.target.value)}
                >
                  <option value="all">Tất cả 14 môn học</option>
                  {SUPABASE_SUBJECTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="sb-grade">2. Khối lớp</label>
                <select
                  id="sb-grade"
                  value={sbGrade}
                  onChange={(e) => setSbGrade(e.target.value)}
                >
                  <option value="all">Tất cả khối lớp</option>
                  {['6', '7', '8', '9', '10', '11', '12'].map((g) => (
                    <option key={g} value={g}>
                      Khối {g}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="sb-search">
                  3. Tìm theo mã (TO07-…, KC-…), chương, bài học hoặc nội dung
                </label>
                <input
                  id="sb-search"
                  type="search"
                  value={sbSearch}
                  onChange={(e) => setSbSearch(e.target.value)}
                  aria-label="Tìm kiếm đơn vị kiến thức"
                  placeholder="Tên bài hoặc mã (TO07-…, KC-…)"
                />
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '14px',
                paddingTop: '12px',
                borderTop: '1px solid var(--line)',
              }}
            >
              <div className="field">
                <label htmlFor="wk-grade">Khối lớp</label>
                <select
                  id="wk-grade"
                  value={grade}
                  onChange={(e) =>
                    setGrade(e.target.value as GradeLevel | 'all')
                  }
                >
                  <option value="all">Tất cả khối</option>
                  {GRADES.map((g) => (
                    <option key={g.grade} value={g.grade}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="wk-subject">Môn học</label>
                <select
                  id="wk-subject"
                  value={subject}
                  onChange={(e) =>
                    setSubject(e.target.value as SubjectCode | 'all')
                  }
                >
                  <option value="all">Tất cả môn học</option>
                  {SUBJECTS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </section>

        {loadError && viewMode === 'supabase' && (
          <div
            role="alert"
            className="va-badge"
            style={{ whiteSpace: 'normal', color: '#b42318' }}
          >
            {loadError}
          </div>
        )}

        {viewMode === 'supabase' ? (
          /* ==================== CHẾ ĐỘ 1: DỮ LIỆU THỰC SUPABASE (ATOMS + EDGES + QUESTIONS + SOCRATIC) ==================== */
          <div
            className="grid-2"
            style={{
              gridTemplateColumns: '400px minmax(0, 1fr)',
              alignItems: 'start',
              gap: '22px',
            }}
          >
            {/* DANH SÁCH ATOMS BÊN TRÁI */}
            <aside
              className="card stack"
              style={{
                maxHeight: '80vh',
                overflowY: 'auto',
                padding: '18px',
                gap: '12px',
              }}
            >
              <div className="row-between">
                <h2 style={{ fontSize: '16.5px', fontWeight: 800 }}>
                  Đơn vị kiến thức ({atomsTotal.toLocaleString('vi-VN')} kết quả)
                </h2>
                {loadingList && (
                  <span className="va-badge va-badge-gold">Đang tải...</span>
                )}
              </div>

              {!loadingList && atoms.length === 0 && (
                <div style={{ color: 'var(--muted)', fontSize: '15px' }}>
                  Không có đơn vị kiến thức nào khớp bộ lọc hiện tại.
                </div>
              )}
              <div className="stack" style={{ gap: '8px' }}>
                {atoms.map((a) => {
                  const isSelected = a.id === selectedAtomId;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelectedAtomId(a.id)}
                      className={`va-list-item ${isSelected ? 'active' : ''}`}
                    >
                      <div className="row-between" style={{ marginBottom: '4px' }}>
                        <span
                          className="va-badge va-badge-navy"
                          style={{ fontFamily: 'monospace' }}
                        >
                          {a.code}
                        </span>
                        <span className="va-badge va-badge-gold">
                          {a.subject} · Khối {a.grade} · DOK {a.dok}
                        </span>
                      </div>
                      <div
                        style={{
                          fontWeight: 800,
                          color: 'var(--navy)',
                          fontSize: '15px',
                          lineHeight: 1.38,
                        }}
                      >
                        {a.title}
                      </div>
                      <div
                        style={{
                          fontSize: '12.5px',
                          color: 'var(--muted)',
                          marginTop: '4px',
                        }}
                      >
                        {a.chapter} · {a.lesson}
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* CHI TIẾT ATOM, EDGES, QUESTIONS & SOCRATIC BÊN PHẢI */}
            <div className="stack" style={{ gap: '20px' }}>
              {loadingDetail && !atomDetail?.atom ? (
                <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
                  Đang tải chi tiết đơn vị kiến thức từ Supabase...
                </div>
              ) : atomDetail?.atom ? (
                <>
                  {/* THẺ 1: HỒ SƠ ĐƠN VỊ KIẾN THỨC (ATOM) */}
                  <section className="card stack" style={{ padding: '26px 28px', gap: '16px' }}>
                    <div className="row-between">
                      <div>
                        <div className="va-crumb">
                          MÃ ATOM: {atomDetail.atom.code} ({atomDetail.atom.id}) · {atomDetail.atom.chapter}
                        </div>
                        <h2 style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px' }}>
                          {atomDetail.atom.title}
                        </h2>
                        <div className="va-rule" style={{ marginTop: '8px' }} />
                      </div>

                      <div className="row-wrap">
                        <span className="va-badge va-badge-navy">
                          {atomDetail.atom.subject} · Khối {atomDetail.atom.grade}
                        </span>
                        <span className="va-badge va-badge-gold">
                          Bloom: {atomDetail.atom.bloom} · DOK {atomDetail.atom.dok}
                        </span>
                      </div>
                    </div>

                    <div className="grid-2" style={{ gap: '14px' }}>
                      <div
                        style={{
                          background: 'var(--cream)',
                          border: '1px solid var(--line)',
                          borderRadius: '6px',
                          padding: '14px 16px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '12.5px',
                            fontWeight: 800,
                            color: 'var(--navy)',
                            textTransform: 'uppercase',
                            marginBottom: '6px',
                          }}
                        >
                          Yêu cầu cần đạt (Chuẩn GDPT 2018):
                        </div>
                        <div style={{ fontSize: '15px', lineHeight: 1.6 }}>
                          {atomDetail.atom.yeu_cau || atomDetail.atom.title}
                        </div>
                      </div>

                      <div
                        style={{
                          background: 'var(--cream)',
                          border: '1px solid var(--line)',
                          borderRadius: '6px',
                          padding: '14px 16px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '12.5px',
                            fontWeight: 800,
                            color: 'var(--navy)',
                            textTransform: 'uppercase',
                            marginBottom: '6px',
                          }}
                        >
                          Bài học & Năng lực đặc thù:
                        </div>
                        <div style={{ fontSize: '15px', lineHeight: 1.6 }}>
                          <div>
                            <b>Bài học:</b> {atomDetail.atom.lesson}
                          </div>
                          <div>
                            <b>Năng lực:</b>{' '}
                            {atomDetail.atom.nang_luc ||
                              'Năng lực giải quyết vấn đề và sáng tạo'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {atomDetail.atom.quan_niem_sai && (
                      <div
                        style={{
                          background: 'var(--gold-soft)',
                          border: '1px solid rgba(232, 196, 10, 0.45)',
                          borderLeft: '4px solid var(--gold)',
                          borderRadius: '6px',
                          padding: '14px 18px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '12.5px',
                            fontWeight: 800,
                            color: 'var(--gold-text)',
                            textTransform: 'uppercase',
                            marginBottom: '4px',
                          }}
                        >
                          Quan niệm sai phổ biến của học sinh
                        </div>
                        <div style={{ fontSize: '15.5px', color: 'var(--ink)' }}>
                          {atomDetail.atom.quan_niem_sai}
                        </div>
                      </div>
                    )}

                    <div className="row-wrap" style={{ paddingTop: '4px' }}>
                      <Link
                        href={`/?nodeId=${atomDetail.atom.id}&tool=khbd-5512`}
                        className="btn btn-cta"
                      >
                        Soạn Giáo án CV 5512 từ Atom này →
                      </Link>
                      <Link
                        href={`/?nodeId=${atomDetail.atom.id}&tool=ktdg-trac-nghiem-4-lua-chon`}
                        className="btn btn-navy"
                      >
                        Tạo Đề Kiểm tra từ Atom này →
                      </Link>
                      <Link
                        href={`/?nodeId=${atomDetail.atom.id}&tool=pht-tram-hoc-tap`}
                        className="btn"
                      >
                        Tạo Phiếu Học tập →
                      </Link>
                    </div>
                  </section>

                  {/* THẺ 2: MẠNG LƯỚI TIÊN QUYẾT & LIÊN MÔN (EDGES) */}
                  <section className="card stack" style={{ padding: '22px 26px', gap: '14px' }}>
                    <div>
                      <div className="va-crumb">
                        MẠNG LƯỚI TRI THỨC SUPABASE
                      </div>
                      <h3 style={{ fontSize: '18px', fontWeight: 800 }}>
                        Kiến thức Tiên quyết & Liên kết Liên môn ({atomDetail.edges.length} liên kết)
                      </h3>
                    </div>

                    {atomDetail.edges.length === 0 ? (
                      <div style={{ color: 'var(--muted)', fontSize: '15px' }}>
                        Đơn vị kiến thức này là nút độc lập trong chương.
                      </div>
                    ) : (
                      <div className="stack" style={{ gap: '10px' }}>
                        {atomDetail.edges.map((edge) => (
                          <div
                            key={edge.id}
                            style={{
                              background: 'var(--cream)',
                              border: '1px solid var(--line)',
                              borderLeft: edge.cross_subject
                                ? '4px solid var(--gold)'
                                : '4px solid var(--navy)',
                              borderRadius: '6px',
                              padding: '14px 16px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                            }}
                          >
                            <div className="row-between">
                              <div className="row-wrap">
                                <span className="va-badge va-badge-navy">
                                  {edge.relation === 'prerequisite_hard'
                                    ? 'Tiên quyết bắt buộc'
                                    : edge.relation === 'prerequisite_soft'
                                      ? 'Tiên quyết bổ trợ'
                                      : 'Liên kết mở rộng'}
                                </span>
                                {edge.cross_subject && (
                                  <span className="va-badge va-badge-gold">
                                    Liên môn: {edge.cross_subject}
                                  </span>
                                )}
                                {edge.linkedAtom && (
                                  <span className="va-badge">
                                    {edge.linkedAtom.code} · {edge.linkedAtom.subject} Khối {edge.linkedAtom.grade}
                                  </span>
                                )}
                              </div>

                              {edge.linkedAtom && (
                                <button
                                  type="button"
                                  className="btn"
                                  style={{ minHeight: '32px', padding: '4px 10px', fontSize: '13px' }}
                                  onClick={() => setSelectedAtomId(edge.linkedAtom!.id)}
                                >
                                  Xem Atom {edge.linkedAtom.code} →
                                </button>
                              )}
                            </div>

                            <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: '15.5px' }}>
                              {edge.linkedAtom
                                ? edge.linkedAtom.title
                                : `Liên kết nút ${edge.from_id} → ${edge.to_id}`}
                            </div>

                            {(edge.quan_niem_sai || edge.remediation_hint) && (
                              <div style={{ fontSize: '14.5px', color: 'var(--ink-secondary)' }}>
                                {edge.quan_niem_sai && (
                                  <div>
                                    <b>Lỗi hổng liên quan:</b> {edge.quan_niem_sai}
                                  </div>
                                )}
                                {edge.remediation_hint && (
                                  <div style={{ color: 'var(--success)', fontWeight: 600 }}>
                                    <b>Gợi ý khắc phục:</b> {edge.remediation_hint}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* THẺ 3: NGÂN HÀNG CÂU HỎI ĐÁNH GIÁ & PHÂN TÍCH NHIỄU (QUESTIONS) */}
                  <section className="card stack" style={{ padding: '22px 26px', gap: '14px' }}>
                    <div>
                      <div className="va-crumb">
                        NGÂN HÀNG CÂU HỎI ĐÁNH GIÁ (12.986 CÂU)
                      </div>
                      <h3 style={{ fontSize: '18px', fontWeight: 800 }}>
                        Câu hỏi kiểm tra & Phân tích phương án nhiễu ({atomDetail.questions.length} câu)
                      </h3>
                    </div>

                    {atomDetail.questions.length === 0 ? (
                      <div style={{ color: 'var(--muted)', fontSize: '15px' }}>
                        Chưa có câu hỏi đính kèm trực tiếp cho mã Atom này.
                      </div>
                    ) : (
                      <div className="stack" style={{ gap: '12px' }}>
                        {atomDetail.questions.map((q, idx) => (
                          <div
                            key={q.id}
                            style={{
                              background: 'var(--cream)',
                              border: '1px solid var(--line)',
                              borderRadius: '6px',
                              padding: '16px 18px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                            }}
                          >
                            <div className="row-between">
                              <span className="va-badge va-badge-navy" style={{ fontFamily: 'monospace' }}>
                                Câu {idx + 1} · {q.id} ({q.key})
                              </span>
                              <div className="row-wrap">
                                <span className="va-badge va-badge-gold">
                                  Độ khó: {q.do_kho} · DOK {q.dok}
                                </span>
                                <span className="va-badge">Tier {q.tier}</span>
                              </div>
                            </div>

                            <div style={{ fontWeight: 700, fontSize: '15.5px', color: 'var(--navy)' }}>
                              {q.noi_dung}
                            </div>

                            <div
                              style={{
                                background: 'var(--success-bg)',
                                color: 'var(--success)',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                fontSize: '14.5px',
                                fontWeight: 700,
                              }}
                            >
                              ✓ Đáp án đúng: {q.dap_an}
                            </div>

                            <div style={{ fontSize: '14.5px', color: 'var(--ink)' }}>
                              <b>Lời giải chi tiết:</b> {q.loi_giai}
                            </div>

                            {Array.isArray(q.nhieu) && q.nhieu.length > 0 && (
                              <div
                                style={{
                                  background: '#ffffff',
                                  border: '1px solid var(--line)',
                                  borderRadius: '6px',
                                  padding: '10px 12px',
                                  fontSize: '14px',
                                }}
                              >
                                <div style={{ fontWeight: 800, color: 'var(--gold-text)', marginBottom: '4px' }}>
                                  Phân tích các phương án nhiễu (Lỗi tư duy học sinh hay mắc):
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.55 }}>
                                  {q.nhieu.map((n, ni) => (
                                    <li key={ni}>
                                      <b>&ldquo;{n.noiDung}&rdquo;</b> — <i>Lý do nhầm:</i> {n.lyDo}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* THẺ 4: KỊCH BẢN HỎI ĐÁP SOCRATIC 4 BẬC (SOCRATIC) */}
                  <section className="card stack" style={{ padding: '22px 26px', gap: '14px' }}>
                    <div>
                      <div className="va-crumb">
                        KỊCH BẢN SƯ PHẠM SOCRATIC (7.612 KỊCH BẢN)
                      </div>
                      <h3 style={{ fontSize: '18px', fontWeight: 800 }}>
                        Hướng dẫn 4 Bậc câu hỏi Socratic giúp học sinh tự nhận ra lỗi sai ({atomDetail.socratic.length} kịch bản)
                      </h3>
                    </div>

                    {atomDetail.socratic.length === 0 ? (
                      <div style={{ color: 'var(--muted)', fontSize: '15px' }}>
                        Chưa có kịch bản Socratic cho Atom này.
                      </div>
                    ) : (
                      <div className="stack" style={{ gap: '14px' }}>
                        {atomDetail.socratic.map((soc) => (
                          <div
                            key={soc.id}
                            style={{
                              background: 'var(--cream)',
                              border: '1px solid var(--line)',
                              borderLeft: '4px solid var(--gold)',
                              borderRadius: '6px',
                              padding: '16px 18px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                            }}
                          >
                            <div className="row-between">
                              <span className="va-badge va-badge-navy">
                                Mã {soc.id} · {soc.vi_tri}
                              </span>
                              <span className="va-badge va-badge-gold">
                                Khi HS chọn sai: {soc.wrong_answer}
                              </span>
                            </div>

                            <div style={{ fontSize: '14.5px', whiteSpace: 'pre-wrap' }}>
                              <b>Tình huống câu hỏi:</b> {soc.question_summary}
                            </div>

                            <div style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '14.5px' }}>
                              Nguyên nhân nhầm lẫn: {soc.misconception}
                            </div>

                            <div className="grid-2" style={{ gap: '10px' }}>
                              <div style={{ background: '#ffffff', border: '1px solid var(--line)', padding: '10px 12px', borderRadius: '6px', fontSize: '14px' }}>
                                <b style={{ color: 'var(--navy)' }}>Bậc 1 (Khơi gợi suy luận):</b>
                                <div style={{ marginTop: '4px' }}>{soc.bac_1}</div>
                              </div>
                              <div style={{ background: '#ffffff', border: '1px solid var(--line)', padding: '10px 12px', borderRadius: '6px', fontSize: '14px' }}>
                                <b style={{ color: 'var(--navy)' }}>Bậc 2 (Định hướng trọng tâm):</b>
                                <div style={{ marginTop: '4px' }}>{soc.bac_2}</div>
                              </div>
                              <div style={{ background: '#ffffff', border: '1px solid var(--line)', padding: '10px 12px', borderRadius: '6px', fontSize: '14px' }}>
                                <b style={{ color: 'var(--navy)' }}>Bậc 3 (Phản biện & Đối chiếu):</b>
                                <div style={{ marginTop: '4px' }}>{soc.bac_3}</div>
                              </div>
                              <div style={{ background: '#ffffff', border: '1px solid var(--line)', padding: '10px 12px', borderRadius: '6px', fontSize: '14px' }}>
                                <b style={{ color: 'var(--success)' }}>Bậc 4 (Chốt kiến thức đúng):</b>
                                <div style={{ marginTop: '4px' }}>{soc.bac_4}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              ) : atoms.length === 0 && !loadingList ? (
                <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
                  Không có kết quả để hiển thị. Hãy đổi từ khóa hoặc bộ lọc.
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          /* ==================== CHẾ ĐỘ 2: 34 CHỦ ĐỀ LIÊN MÔN THEO TUẦN ==================== */
          <div
            className="grid-2"
            style={{
              gridTemplateColumns: '390px minmax(0, 1fr)',
              alignItems: 'start',
              gap: '22px',
            }}
          >
            <aside
              className="card stack"
              style={{ maxHeight: '78vh', overflowY: 'auto', padding: '18px' }}
            >
              <h2 style={{ fontSize: '17px', fontWeight: 800 }}>
                Chủ đề theo tuần ({weeklyNodes.length})
              </h2>
              <div className="stack" style={{ gap: '8px' }}>
                {weeklyNodes.map((node) => {
                  const isSelected = activeWeeklyNode?.id === node.id;
                  const connCount = getConnectedNodes(node.id).length;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`va-list-item ${isSelected ? 'active' : ''}`}
                    >
                      <div className="row-between" style={{ marginBottom: '4px' }}>
                        <span className="va-badge va-badge-navy">
                          {node.subjectName} · Khối {node.grade}
                        </span>
                        <span className="va-badge va-badge-gold">
                          {connCount} liên kết
                        </span>
                      </div>
                      <div
                        style={{
                          fontWeight: 800,
                          color: 'var(--navy)',
                          fontSize: '15.5px',
                        }}
                      >
                        {node.title}
                      </div>
                      <div
                        style={{
                          fontSize: '13px',
                          color: 'var(--muted)',
                          marginTop: '4px',
                        }}
                      >
                        Học kỳ {node.semester} · Tuần {node.weekRange[0]}–{node.weekRange[1]}
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            {activeWeeklyNode && (
              <div className="stack" style={{ gap: '20px' }}>
                <section className="card stack" style={{ padding: '26px 28px', gap: '16px' }}>
                  <div className="row-between">
                    <div>
                      <div className="va-crumb">
                        MẠCH KIẾN THỨC TUẦN {activeWeeklyNode.weekRange[0]}–{activeWeeklyNode.weekRange[1]}
                      </div>
                      <h2 style={{ fontSize: '23px', fontWeight: 800, marginTop: '4px' }}>
                        {activeWeeklyNode.title}
                      </h2>
                      <div className="va-rule" style={{ marginTop: '8px' }} />
                    </div>
                    <Link
                      href={`/?nodeId=${activeWeeklyNode.id}&tool=thlm-knowledge-graph`}
                      className="btn btn-cta"
                    >
                      Soạn Kế hoạch bài dạy Liên môn →
                    </Link>
                  </div>

                  <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.65 }}>
                    {activeWeeklyNode.moetRequiredOutcomes.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>

                  <div className="stack" style={{ gap: '12px' }}>
                    {weeklyConnections.map(({ edge, node }) => (
                      <div
                        key={edge.id}
                        style={{
                          background: 'var(--cream)',
                          border: '1px solid var(--line)',
                          borderLeft: '4px solid var(--navy)',
                          borderRadius: '6px',
                          padding: '14px 18px',
                        }}
                      >
                        <div className="row-between">
                          <strong>
                            {node.subjectName} (Khối {node.grade}): {node.title}
                          </strong>
                          <span className="va-badge va-badge-gold">
                            {RELATION_LABELS[edge.relation].label}
                          </span>
                        </div>
                        <div style={{ fontSize: '14.5px', marginTop: '6px' }}>
                          <b>Điểm giao thoa:</b> {edge.integrationIdea}
                        </div>
                        <div style={{ fontSize: '14.5px', marginTop: '4px' }}>
                          <b>Hoạt động phối hợp:</b> {edge.suggestedSharedActivity}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
