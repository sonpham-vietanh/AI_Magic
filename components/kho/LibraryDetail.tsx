'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { useDialog } from '@/components/studio/useDialog';
import { ArtifactView } from '@/components/resources/ArtifactView';
import { availableFormats, EXPORT_LABELS, exportArtifact, type ExportFormat } from '@/lib/export/artifact';
import { fetchJson, friendlyError } from '@/lib/ui/fetchJson';
import { ARTIFACT_LABELS, type Artifact } from '@/lib/resources/types';
import { AriaTabs, panelProps, type TabDef } from './AriaTabs';
import { useMe } from './useMe';
import { FIELD_LABELS, FIELD_ORDER, whenText, type LessonView } from './types';

type Tab = 'tom_tat' | 'tai_nguyen' | 'cau_hoi';

function ExportButtons({ artifact }: { artifact: Artifact }) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [err, setErr] = useState('');
  const formats = availableFormats(artifact.kind);
  const run = async (f: ExportFormat) => {
    setBusy(f);
    setErr('');
    try {
      await exportArtifact(artifact, f, artifact.title);
    } catch {
      setErr('Không tạo được tệp tải về. Cô/thầy thử lại, hoặc chọn định dạng khác nhé.');
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const me = useMe();

  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError('');
    setLesson(null);
    setTab('tom_tat');
    (async () => {
      try {
        const data = await fetchJson<{ lesson?: LessonView }>(`/api/kho/standard?atomId=${encodeURIComponent(atomId)}`, { signal: c.signal });
        if (!data.lesson) throw new Error('empty');
        setLesson(data.lesson);
      } catch (e) {
        if (!c.signal.aborted) setError(friendlyError(e, 'Không tải được bản chuẩn. Cô/thầy đóng rồi mở lại bài này nhé.'));
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    })();
    return () => c.abort();
  }, [atomId]);

  // Bẫy focus, ESC đóng, trả focus về thẻ bài khi đóng.
  useDialog(dialogRef, true, () => {
    onClose();
    return true;
  });

  // Khoá cuộn nền khi hộp thoại mở.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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

  const tabs: TabDef<Tab>[] = [
    { id: 'tom_tat', label: 'Tóm tắt' },
    { id: 'tai_nguyen', label: `Tài nguyên (${artifacts.length})` },
    { id: 'cau_hoi', label: `Câu hỏi (${lesson?.questions.length ?? 0})` },
  ];

  return (
    <div className="kh-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} tabIndex={-1} className="kh-detail" role="dialog" aria-modal="true" aria-labelledby="kh-detail-title">
        <div className="kh-detail-head">
          <div className="kh-detail-titles">
            <div className="kh-detail-eyebrow">
              {lesson?.atomCode && <span className="kh-code">{lesson.atomCode}</span>}
              {approved && (
                <span className="ag-status ok">
                  Đã duyệt chuẩn{lesson?.version ? `, v${lesson.version}` : ''}
                </span>
              )}
            </div>
            <h2 id="kh-detail-title">{title}</h2>
          </div>
          <button type="button" className="ag-iconbtn" aria-label="Đóng chi tiết" onClick={onClose}>
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="kh-detail-body" aria-busy={loading}>
          {loading && (
            <div aria-label="Đang tải bản chuẩn" role="status">
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
                <strong>Bài này chưa có bản chuẩn đã duyệt.</strong> Nội dung chưa qua người duyệt nên chưa được đưa ra cho giáo viên.{' '}
                {me.canReview && me.ready ? (
                  <>
                    Cô/thầy có thể vào{' '}
                    <Link className="ag-link kh-tap" href="/duyet">
                      trang Duyệt học liệu
                    </Link>{' '}
                    để dựng và duyệt.
                  </>
                ) : (
                  'Cô/thầy nhờ người phụ trách duyệt bài này nhé.'
                )}
              </div>
            </div>
          )}

          {lesson && approved && (
            <>
              <AriaTabs tabs={tabs} value={tab} onChange={setTab} label="Nội dung bản chuẩn" prefix="kh-d" className="kh-tabs" tabClassName="kh-tab" />

              {tab === 'tom_tat' && (
                <div {...panelProps('kh-d', 'tom_tat')} className="kh-panel">
                  {lesson.review && lesson.review.decision === 'approve' && (
                    <p className="kh-reviewed">
                      <Icon name="shield" size={18} />
                      <span>
                        Duyệt bởi <strong>{lesson.review.reviewer}</strong>
                        {whenText(lesson.review.reviewedAt) ? `, ${whenText(lesson.review.reviewedAt)}` : ''}.
                      </span>
                    </p>
                  )}
                  {entries.length === 0 && <p className="ag-note">Gói kiến thức chưa có nội dung hiển thị.</p>}
                  {entries.map(([k, v]) => (
                    <div key={k} className="kh-field">
                      <h3>{FIELD_LABELS[k] || k}</h3>
                      <div>{v}</div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'tai_nguyen' && (
                <div {...panelProps('kh-d', 'tai_nguyen')} className="kh-panel">
                  {artifacts.length === 0 ? (
                    <div className="ag-alert info">
                      <Icon name="info" size={18} />
                      <div>Phiên bản chuẩn này chưa kèm tài nguyên nào. Tài nguyên được sinh và duyệt ở trang Duyệt học liệu.</div>
                    </div>
                  ) : (
                    <ul className="kh-assets">
                      {artifacts.map((a, i) => (
                        <li key={`${a.kind}-${i}`} className="kh-asset">
                          <strong>{ARTIFACT_LABELS[a.kind]}</strong>
                          <ExportButtons artifact={a} />
                          <details className="kh-preview" open={artifacts.length === 1}>
                            <summary>
                              Xem trước
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
                <div {...panelProps('kh-d', 'cau_hoi')} className="kh-panel">
                  <p className="kh-qcount">
                    Ngân hàng có <strong>{lesson.questions.length}</strong> câu hỏi cho bài này.
                  </p>
                  {byLevel.size > 0 && (
                    <ul className="kh-row kh-levels" aria-label="Số câu theo mức">
                      {[...byLevel].map(([k, n]) => (
                        <li key={k} className="kh-pill">
                          {k}: <b>{n}</b>
                        </li>
                      ))}
                    </ul>
                  )}
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
          {!approved && lesson && <span className="kh-foot-note">Cần có bản chuẩn đã duyệt.</span>}
        </div>
      </div>
    </div>
  );
}
