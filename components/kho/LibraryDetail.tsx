'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { ArtifactView } from '@/components/resources/ArtifactView';
import { availableFormats, EXPORT_LABELS, exportArtifact, type ExportFormat } from '@/lib/export/artifact';
import { ARTIFACT_LABELS, type Artifact } from '@/lib/resources/types';
import { FIELD_LABELS, FIELD_ORDER, whenText, type LessonView } from './types';

type Tab = 'tom_tat' | 'tai_nguyen' | 'cau_hoi';
const TABS: { id: Tab; label: string }[] = [
  { id: 'tom_tat', label: 'Tóm tắt bản chuẩn' },
  { id: 'tai_nguyen', label: 'Tài nguyên' },
  { id: 'cau_hoi', label: 'Câu hỏi' },
];

function ExportButtons({ artifact }: { artifact: Artifact }) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [err, setErr] = useState('');
  const formats = availableFormats(artifact.kind);
  const run = async (f: ExportFormat) => {
    setBusy(f);
    setErr('');
    try {
      await exportArtifact(artifact, f, artifact.title);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Không tải được tệp.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <div className="kh-exports">
        {formats.map((f) => (
          <button key={f} type="button" className="ag-btn small" disabled={busy !== null} onClick={() => void run(f)}>
            {busy === f ? <span className="ag-spin" aria-hidden="true" /> : <Icon name="download" size={16} />}
            {EXPORT_LABELS[f]}
          </button>
        ))}
      </div>
      {err && (
        <div className="ag-alert bad" role="alert" style={{ marginTop: 8 }}>
          <Icon name="alert" size={18} />
          <div>{err}</div>
        </div>
      )}
    </>
  );
}

export function LibraryDetail({ atomId, fallbackTitle, onClose }: { atomId: string; fallbackTitle: string; onClose: () => void }) {
  const [lesson, setLesson] = useState<LessonView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('tom_tat');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError('');
    setLesson(null);
    setTab('tom_tat');
    (async () => {
      try {
        const res = await fetch(`/api/kho/standard?atomId=${encodeURIComponent(atomId)}`, { signal: c.signal });
        const data = (await res.json()) as { ok?: boolean; lesson?: LessonView; error?: string };
        if (!res.ok || !data.ok || !data.lesson) throw new Error(data.error || `HTTP ${res.status}`);
        setLesson(data.lesson);
      } catch (e) {
        if (!c.signal.aborted) setError(e instanceof Error ? e.message : 'Không tải được bản chuẩn.');
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    })();
    return () => c.abort();
  }, [atomId]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const approved = lesson?.status === 'approved';
  const title = lesson?.title || fallbackTitle;
  const pkg = lesson?.packages?.[0];
  const entries = Object.entries(pkg?.fields || {})
    .filter(([, v]) => !!v)
    .sort(([a], [b]) => {
      const ia = FIELD_ORDER.indexOf(a);
      const ib = FIELD_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  const artifacts = lesson?.artifacts ?? [];

  const byLevel = new Map<string, number>();
  for (const q of lesson?.questions ?? []) {
    const k = q.do_kho || q.tier;
    if (k) byLevel.set(k, (byLevel.get(k) || 0) + 1);
  }

  return (
    <div className="kh-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="kh-detail" role="dialog" aria-modal="true" aria-label={`Chi tiết tiết học: ${title}`}>
        <div className="kh-detail-head">
          <div>
            <h2>{title}</h2>
            <p>
              {lesson?.atomCode}
              {lesson?.version ? ` · Bản chuẩn v${lesson.version}` : ''}
            </p>
          </div>
          <button ref={closeRef} type="button" className="ag-iconbtn" aria-label="Đóng chi tiết" onClick={onClose}>
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="kh-detail-body" aria-busy={loading}>
          {loading && (
            <div>
              <div className="kh-skel-card" style={{ height: 44, marginBottom: 10 }} />
              <div className="kh-skel-card" style={{ marginBottom: 10 }} />
              <div className="kh-skel-card" />
            </div>
          )}
          {error && (
            <div className="ag-alert bad" role="alert">
              <Icon name="alert" size={18} />
              <div>{error}</div>
            </div>
          )}

          {lesson && !approved && (
            <div className="ag-alert warn" role="status">
              <Icon name="alert" size={18} />
              <div>
                <strong>Chưa có bản chuẩn đã duyệt.</strong> Bài này chưa qua người duyệt nên nội dung chưa được đưa ra cho giáo viên.
                Cô/thầy báo người phụ trách duyệt ở trang Dựng kho.
              </div>
            </div>
          )}

          {lesson && approved && (
            <>
              <div className="kh-tabs" role="tablist" aria-label="Nội dung bản chuẩn">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    className="kh-tab"
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                    {t.id === 'tai_nguyen' ? ` (${artifacts.length})` : t.id === 'cau_hoi' ? ` (${lesson.questions.length})` : ''}
                  </button>
                ))}
              </div>

              {tab === 'tom_tat' && (
                <div role="tabpanel" aria-label="Tóm tắt bản chuẩn">
                  {lesson.review && lesson.review.decision === 'approve' && (
                    <p className="ag-note" style={{ fontSize: 16, marginTop: 0 }}>
                      Duyệt bởi {lesson.review.reviewer}
                      {whenText(lesson.review.reviewedAt) ? `, ${whenText(lesson.review.reviewedAt)}` : ''}.
                    </p>
                  )}
                  {entries.length === 0 && <p className="ag-note">Gói kiến thức chưa có nội dung hiển thị.</p>}
                  {entries.map(([k, v]) => (
                    <div key={k} className="kh-field">
                      <h4>{FIELD_LABELS[k] || k}</h4>
                      <div>{v}</div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'tai_nguyen' && (
                <div role="tabpanel" aria-label="Tài nguyên đã duyệt">
                  {artifacts.length === 0 ? (
                    <div className="ag-alert info">
                      <Icon name="info" size={18} />
                      <div>Phiên bản chuẩn này chưa kèm tài nguyên nào. Tài nguyên được sinh và duyệt ở trang Dựng kho.</div>
                    </div>
                  ) : (
                    <ul className="kh-assets">
                      {artifacts.map((a, i) => (
                        <li key={`${a.kind}-${i}`} className="kh-asset">
                          <strong>{ARTIFACT_LABELS[a.kind]}</strong>
                          <ExportButtons artifact={a} />
                          <details className="kh-preview" open={artifacts.length === 1}>
                            <summary>
                              Xem
                              <Icon name="chevronDown" size={18} />
                            </summary>
                            <div className="kh-preview-body">
                              <ArtifactView artifact={a} compact />
                            </div>
                          </details>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {tab === 'cau_hoi' && (
                <div role="tabpanel" aria-label="Câu hỏi của bài">
                  <p style={{ fontSize: 16, margin: 0 }}>
                    Ngân hàng có <strong>{lesson.questions.length}</strong> câu hỏi cho bài này
                    {byLevel.size ? `: ${[...byLevel].map(([k, n]) => `${k} (${n})`).join(', ')}` : ''}.
                  </p>
                  <Link className="ag-link kh-tap" href="/kiem-tra">
                    Soạn đề từ ngân hàng câu hỏi
                  </Link>
                </div>
              )}
            </>
          )}
        </div>

        <div className="kh-detail-foot">
          {approved ? (
            <Link className="ag-btn primary" href={`/?bai=${encodeURIComponent(atomId)}&baiTitle=${encodeURIComponent(title)}`}>
              <Icon name="sparkles" size={18} />
              Soạn bài từ bản chuẩn này
            </Link>
          ) : (
            <button type="button" className="ag-btn primary" disabled>
              Soạn bài từ bản chuẩn này
            </button>
          )}
          {!approved && lesson && (
            <span className="ag-note" style={{ fontSize: 16, margin: 0 }}>
              Cần có bản chuẩn đã duyệt.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
