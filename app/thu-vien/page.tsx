'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { GRADES, SUBJECTS } from '@/lib/catalog';
import { cleanPedagogicalText } from '@/lib/engine/smartGenerator';
import type { GeneratedResource, MajorOsUsageEvent } from '@/lib/types';

export default function ResourceLibraryPage() {
  const [activeView, setActiveView] = useState<'library' | 'major-os'>('library');
  const [resources, setResources] = useState<GeneratedResource[]>([]);
  const [events, setEvents] = useState<MajorOsUsageEvent[]>([]);
  const [selectedResource, setSelectedResource] = useState<GeneratedResource | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [notice, setNotice] = useState<string>('');

  const [loadError, setLoadError] = useState<string>('');

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const errors: string[] = [];
    const report = () => setLoadError(errors.join(' '));

    fetch('/api/resources', { signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { resources?: GeneratedResource[] }) => {
        const list = data.resources || [];
        setResources(list);
        if (list[0]) setSelectedResource(list[0]);
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        errors.push(`Không tải được danh sách học liệu (${err instanceof Error ? err.message : 'lỗi'}).`);
        report();
      });

    fetch('/api/usage', { signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { du_lieu?: MajorOsUsageEvent[] }) => {
        setEvents(data.du_lieu || []);
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        errors.push(`Không tải được nhật ký đồng bộ (${err instanceof Error ? err.message : 'lỗi'}).`);
        report();
      });

    return () => controller.abort();
  }, []);

  const filtered = resources.filter((r) => {
    if (subjectFilter !== 'all' && r.subject !== subjectFilter) return false;
    if (gradeFilter !== 'all' && r.grade !== gradeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.toolName.toLowerCase().includes(q) ||
        (r.className || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalMinutesSaved = events.reduce((acc, e) => acc + (e.so_phut || 15), 0);

  const handleDownloadWord = (res: GeneratedResource) => {
    const htmlDoc = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="vi">
<head><meta charset="utf-8"><title>${res.title}</title>
<style>
  body { font-family: 'Times New Roman', Arial, sans-serif; font-size: 13pt; line-height: 1.5; color: #000000; }
  h1 { font-size: 15pt; text-transform: uppercase; margin-bottom: 8px; }
  h2 { font-size: 13pt; margin-top: 14px; margin-bottom: 6px; }
  .meta { border-bottom: 1px solid #ccc; padding-bottom: 10px; margin-bottom: 14px; }
  pre { white-space: pre-wrap; font-family: inherit; margin: 0; }
</style>
</head>
<body>
  <div class="meta">
    <b>TRƯỜNG TIỂU HỌC, THCS & THPT VIỆT ANH</b><br/>
    <b>Tài liệu:</b> ${res.title}<br/>
    <b>Giáo viên:</b> ${res.teacher.name} · <b>Lớp:</b> ${res.className || `Khối ${res.grade}`}
  </div>
  ${res.structuredSections
    .map(
      (s) =>
        `<h2>${s.heading}</h2><pre>${s.body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`,
    )
    .join('\n')}
</body></html>`;
    const blob = new Blob(['\ufeff', htmlDoc], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${res.id}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice('Đã tải về file Word (.doc).');
  };

  const handleDownloadMarkdown = (res: GeneratedResource) => {
    const blob = new Blob([res.markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${res.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice('Đã tải về file Markdown (.md).');
  };

  return (
    <Shell
      title="Thư viện Học liệu & Đồng bộ Major OS v2"
      subtitle="Lưu trữ giáo án, đề kiểm tra đã biên soạn và theo dõi nhật ký đồng bộ sự kiện về hệ thống quản trị Major OS v2."
      rightActions={
        <>
          <a
            href="/api/usage"
            target="_blank"
            rel="noreferrer"
            className="btn"
          >
            API Major OS (JSON)
          </a>
          <Link href="/" className="btn btn-cta">
            + Soạn học liệu mới
          </Link>
        </>
      }
    >
      <div className="stack" style={{ gap: '20px' }}>
        {loadError && (
          <div role="alert" className="va-badge va-badge-gold" style={{ whiteSpace: 'normal' }}>
            {loadError}
          </div>
        )}
        {/* THANH CHUYỂN TAB & BỘ LỌC */}
        <section className="va-card-accent">
          <div className="row-between">
            <div className="row-wrap">
              <button
                type="button"
                className={`va-tab ${activeView === 'library' ? 'active' : ''}`}
                onClick={() => setActiveView('library')}
              >
                <span>Học liệu Đã lưu</span>
                <span className="va-tab-count">{resources.length}</span>
              </button>
              <button
                type="button"
                className={`va-tab ${activeView === 'major-os' ? 'active' : ''}`}
                onClick={() => setActiveView('major-os')}
              >
                <span>Nhật ký Đồng bộ Major OS v2</span>
                <span className="va-tab-count">{events.length} sự kiện</span>
              </button>
            </div>

            <div className="row-wrap">
              <span className="va-badge va-badge-gold">
                Tổng thời gian tiết kiệm: ~{totalMinutesSaved} phút
              </span>
              <span className="va-badge va-badge-green">
                Major OS v2 Webhook: ONLINE
              </span>
            </div>
          </div>

          {activeView === 'library' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '14px',
                marginTop: '14px',
                paddingTop: '14px',
                borderTop: '1px solid var(--line)',
              }}
            >
              <div className="field">
                <label>Tìm kiếm tên tài liệu / lớp</label>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Nhập tên bài dạy, công cụ hoặc tên lớp..."
                />
              </div>

              <div className="field">
                <label>Môn học</label>
                <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
                  <option value="all">Tất cả môn học</option>
                  {SUBJECTS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Khối lớp</label>
                <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
                  <option value="all">Tất cả khối</option>
                  {GRADES.map((g) => (
                    <option key={g.grade} value={g.grade}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </section>

        {activeView === 'library' ? (
          <div
            className="grid-2"
            style={{ gridTemplateColumns: '380px minmax(0, 1fr)', alignItems: 'start', gap: '22px' }}
          >
            {/* DANH SÁCH TÀI LIỆU ĐÃ LƯU */}
            <aside className="card stack" style={{ padding: '18px', maxHeight: '78vh', overflowY: 'auto' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 800 }}>
                Danh sách Học liệu ({filtered.length})
              </h2>

              <div className="stack" style={{ gap: '8px' }}>
                {filtered.map((res) => {
                  const isSelected = selectedResource?.id === res.id;
                  return (
                    <button
                      key={res.id}
                      type="button"
                      onClick={() => {
                        setSelectedResource(res);
                        setNotice('');
                      }}
                      className={`va-list-item ${isSelected ? 'active' : ''}`}
                    >
                      <div className="row-between" style={{ marginBottom: '4px' }}>
                        <span className="va-badge va-badge-navy">
                          Khối {res.grade} {res.className ? `· Lớp ${res.className}` : ''}
                        </span>
                        <span className="va-badge va-badge-gold">
                          ~{res.estimatedMinutesSaved} phút
                        </span>
                      </div>
                      <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: '15.5px' }}>
                        {res.title}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                        {res.toolName} · GV: {res.teacher.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* CHI TIẾT TÀI LIỆU TRÊN TRANG GIẤY A4 */}
            <div className="stack" style={{ gap: '16px' }}>
              {selectedResource ? (
                <>
                  <div className="card row-between no-print" style={{ padding: '14px 20px' }}>
                    <div>
                      <div className="va-crumb">{selectedResource.toolName}</div>
                      <div style={{ fontSize: '14px', color: 'var(--muted)' }}>
                        Giáo viên: <b>{selectedResource.teacher.name}</b> ({selectedResource.teacher.email})
                      </div>
                    </div>

                    <div className="row-wrap">
                      {notice && <span className="va-badge va-badge-green">{notice}</span>}
                      <button
                        type="button"
                        className="btn btn-cta"
                        onClick={() => handleDownloadWord(selectedResource)}
                      >
                        Tải file Word (.doc)
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => handleDownloadMarkdown(selectedResource)}
                      >
                        Tải .md
                      </button>
                      <button type="button" className="btn" onClick={() => window.print()}>
                        In / PDF
                      </button>
                      <Link
                        href={`/?tool=${selectedResource.toolId}`}
                        className="btn btn-navy"
                      >
                        Mở trong Studio →
                      </Link>
                    </div>
                  </div>

                  <div id="library-a4-preview" className="doc-paper">
                    <div className="doc-header">
                      <div>
                        <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: '15px' }}>
                          TRƯỜNG TIỂU HỌC, THCS & THPT VIỆT ANH
                        </div>
                        <div style={{ fontSize: '13.5px', color: 'var(--muted)', marginTop: '3px' }}>
                          Lớp áp dụng: <b>{selectedResource.className || `Khối ${selectedResource.grade}`}</b> · Giáo viên: <b>{selectedResource.teacher.name}</b>
                        </div>
                      </div>
                      <span className="va-badge va-badge-gold">
                        Đã lưu trữ
                      </span>
                    </div>

                    <h2 style={{ fontSize: '21px', fontWeight: 800, marginBottom: '16px' }}>
                      {selectedResource.title}
                    </h2>

                    {selectedResource.structuredSections && selectedResource.structuredSections.length > 0 ? (
                      selectedResource.structuredSections.map((sec, idx) => (
                        <div key={idx} className="section-block">
                          <h3>{cleanPedagogicalText(sec.heading)}</h3>
                          <div className="whitespace-pre">{cleanPedagogicalText(sec.body)}</div>
                        </div>
                      ))
                    ) : (
                      <div className="whitespace-pre">{cleanPedagogicalText(selectedResource.markdownContent)}</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
                  Chọn một tài liệu bên trái để xem chi tiết và tải về file Word.
                </div>
              )}
            </div>
          </div>
        ) : (
          /* TAB 2: NHẬT KÝ ĐỒNG BỘ MAJOR OS V2 */
          <section className="card stack" style={{ padding: '24px 28px', gap: '16px' }}>
            <div className="row-between">
              <div>
                <div className="va-crumb">CHUẨN DỮ LIỆU MAJOR OS V2 (VIETNAMESE SNAKE_CASE)</div>
                <h2 style={{ fontSize: '20px', fontWeight: 800 }}>
                  Nhật ký sự kiện đồng bộ về Hệ thống Quản trị Trường Việt Anh ({events.length} bản ghi)
                </h2>
              </div>
              <a
                href="/api/usage"
                target="_blank"
                rel="noreferrer"
                className="btn btn-navy"
              >
                Xem JSON gốc →
              </a>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14.5px' }}>
                <thead>
                  <tr
                    style={{
                      background: 'var(--navy)',
                      color: '#ffffff',
                      textAlign: 'left',
                    }}
                  >
                    <th style={{ padding: '12px 14px' }}>Mã sự kiện</th>
                    <th style={{ padding: '12px 14px' }}>Thời điểm (+07:00)</th>
                    <th style={{ padding: '12px 14px' }}>Giáo viên / Định danh HS</th>
                    <th style={{ padding: '12px 14px' }}>Tính năng</th>
                    <th style={{ padding: '12px 14px' }}>Lớp / Môn học</th>
                    <th style={{ padding: '12px 14px' }}>Thời gian tiết kiệm</th>
                  </tr>
                </thead>
                <tbody>
                  {events
                    .slice()
                    .reverse()
                    .map((evt) => (
                      <tr
                        key={evt.id}
                        style={{
                          borderBottom: '1px solid var(--line)',
                          background: '#ffffff',
                        }}
                      >
                        <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--navy)' }}>
                          {evt.id}
                        </td>
                        <td style={{ padding: '11px 14px', color: 'var(--muted)' }}>{evt.luc}</td>
                        <td style={{ padding: '11px 14px' }}>
                          {evt.nguoi ? <b>{evt.nguoi.ten}</b> : null}
                          {evt.hoc_sinh ? (
                            <span className="va-badge va-badge-gold" style={{ marginLeft: '6px' }}>
                              {evt.hoc_sinh.ma}
                            </span>
                          ) : null}
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <span className="va-badge va-badge-navy">{evt.tinh_nang}</span>
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          {evt.lop_hoc || `Khối ${evt.khoi_lop || '-'}`} · {evt.mon_hoc || '-'}
                        </td>
                        <td style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--success)' }}>
                          {evt.so_phut ? `${evt.so_phut} phút` : '15 phút'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </Shell>
  );
}
