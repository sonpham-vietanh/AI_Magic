'use client';

// Phần ruột dùng chung của "Bản soạn": khung bên phải của trợ lý và kết quả của trang biểu mẫu /soan-bai.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { ArtifactView } from '@/components/resources/ArtifactView';
import { buildFinalText, textToSections } from '@/lib/ui/soanBai';
import {
  ARTIFACT_SHORT,
  getArtifacts,
  getFromKho,
  getStructure,
  structureSummary,
  type AgentResult,
} from '@/lib/agent/result';
import { WORKFLOW_LABELS } from './types';

type Tab = 'doc' | 'cautruc' | 'soi' | 'chuan';

/** Tiêu đề chung chung do bộ tách mục tự đặt, không có giá trị với người đọc. */
const GENERIC_HEADING = /^Nội dung( học liệu biên soạn)?$/i;

type LineKind = 'h2' | 'h3' | 'li' | 'p';

/** Phân loại một dòng của giáo án theo cách đánh mục hành chính (I., Hoạt động 1, a)...). */
export function classifyLine(line: string): LineKind {
  const t = line.trim();
  if (/^[IVX]{1,4}\.\s+\S/.test(t)) return 'h2';
  if (/^(Hoạt động|Bước|Phần|Câu)\s*\d+/i.test(t) || /^\d{1,2}\.\s+\S/.test(t)) return 'h3';
  if (/^([a-dđ]\)|[-•–]\s)/.test(t)) return 'li';
  return 'p';
}

/** Hiển thị thân bài bằng text node (không bao giờ chèn HTML), có nhấn mạnh các tiêu đề mục. */
export function DocBody({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  return (
    <>
      {lines.map((line, i) =>
        line.trim() === '' ? null : (
          <p key={i} className={`ag-line ${classifyLine(line)}`}>
            {line.trim()}
          </p>
        ),
      )}
    </>
  );
}

export interface ResultPanelProps {
  title: string;
  formatText: string;
  result: AgentResult;
  text: string;
  onText: (text: string) => void;
  busy: boolean;
  accepted?: boolean;
  diffRatio?: number;
  version?: { id: string; number: number };
  versionFailed?: boolean;
  fromVersion?: number;
  /** Tên bài, dùng khi bản chuẩn không có tiêu đề. */
  lessonTitle?: string;
  onRegenerate: () => void;
  onAccept: () => Promise<void> | void;
}

export function ResultPanel(p: ResultPanelProps) {
  const r = p.result;
  const [tab, setTab] = useState<Tab>('doc');
  const [editing, setEditing] = useState(false);
  const [exportError, setExportError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [sel, setSel] = useState(0);

  const artifacts = useMemo(() => getArtifacts(r), [r]);
  const structure = useMemo(() => getStructure(r), [r]);
  const fromKho = useMemo(() => getFromKho(r), [r]);
  const sum = structureSummary(structure);
  const cur = artifacts.length ? artifacts[Math.min(sel, artifacts.length - 1)] : undefined;

  const sectionsSrc = r.content?.sections ?? [];
  const headings = useMemo(() => sectionsSrc.map((s) => s.heading), [sectionsSrc]);
  const original = useMemo(() => buildFinalText(sectionsSrc, r.content?.markdown ?? ''), [sectionsSrc, r.content?.markdown]);
  const edited = p.text !== original;
  const sections = useMemo(
    () => (edited ? textToSections(p.text, headings) : sectionsSrc),
    [edited, p.text, headings, sectionsSrc],
  );

  const download = async () => {
    setExportError('');
    try {
      const { buildDocxBlob, downloadBlob } = await import('@/lib/export/docx');
      const blob = await buildDocxBlob({
        title: p.title.toUpperCase(),
        subtitle: [
          `${p.formatText} · ${(r.bloomLevels ?? []).join(' → ')}`,
          r.requiresApproval ? 'Bản nháp: cần người duyệt trước khi dùng' : 'Đã soạn từ bản chuẩn của Kho',
        ],
        sections: sections.map((s) => ({ heading: s.heading, body: s.body })),
      });
      const safe = p.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'ban-soan';
      downloadBlob(blob, `${safe}.docx`);
    } catch {
      setExportError('Không tạo được file Word. Cô/thầy thử lại hoặc dùng nút In.');
    }
  };

  const accept = async () => {
    setAccepting(true);
    try {
      await p.onAccept();
    } finally {
      setAccepting(false);
    }
  };

  const tabs: [Tab, string][] = [
    ['doc', 'Bản soạn'],
    ['cautruc', structure.length ? `Kiểm tra cấu trúc (${sum.ok}/${sum.total})` : 'Kiểm tra cấu trúc'],
    ['soi', 'AI nhận xét (tham khảo)'],
    ['chuan', 'Bản chuẩn'],
  ];

  return (
    <div className="ag-panel">
      <div className="ag-tabs" role="tablist" aria-label="Nội dung bản soạn">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            id={`rp-tab-${id}`}
            aria-controls="rp-panel"
            className="ag-tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="ag-canvas-body" role="tabpanel" id="rp-panel" aria-labelledby={`rp-tab-${tab}`}>
        {tab === 'doc' && (
          <>
            {sum.missing.length > 0 && (
              <div className="ag-alert bad" role="status">
                <Icon name="alert" size={18} />
                <span>
                  <strong>Còn thiếu:</strong> {sum.missing.map((c) => c.label).join('; ')}. Xem chi tiết ở tab “Kiểm tra cấu trúc”.
                </span>
              </div>
            )}
            {fromKho.length > 0 && (
              <div className="ag-alert ok" role="status">
                <Icon name="shield" size={18} />
                <span>Lấy trực tiếp từ bản chuẩn đã duyệt: {fromKho.map((k) => ARTIFACT_SHORT[k] ?? k).join(', ')}.</span>
              </div>
            )}
            {r.requiresApproval && (
              <div className="ag-alert warn" role="status">
                <Icon name="alert" size={18} />
                <span>Cần người duyệt trước khi dùng. Đây mới là bản nháp.</span>
              </div>
            )}
            {(r.warnings ?? []).length > 0 && (
              <div className="ag-alert info" role="status">
                <Icon name="info" size={18} />
                <ul>
                  {r.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {cur ? (
              <>
                {artifacts.length > 1 && (
                  <div className="ag-kinds" role="group" aria-label="Chọn sản phẩm để xem">
                    {artifacts.map((a, i) => (
                      <button
                        key={`${a.kind}-${i}`}
                        type="button"
                        className="ag-chip"
                        aria-pressed={cur === a}
                        onClick={() => setSel(i)}
                      >
                        {ARTIFACT_SHORT[a.kind] ?? a.kind}
                      </button>
                    ))}
                  </div>
                )}
                <div className="ag-art">
                  <ArtifactView artifact={cur} />
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '12px 0' }}>
                  <button type="button" className="ag-btn small" onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
                    <Icon name="edit" size={16} />
                    {editing ? 'Xem bản đẹp' : 'Chỉnh sửa'}
                  </button>
                </div>
                {editing ? (
                  <>
                    <label className="ag-field-label" htmlFor="ag-edit">
                      Sửa trực tiếp. Mỗi mục bắt đầu bằng dòng tiêu đề.
                    </label>
                    <textarea id="ag-edit" className="ag-field" rows={22} value={p.text} onChange={(e) => p.onText(e.target.value)} />
                  </>
                ) : (
                  sections.map((s, i) => (
                    <section className="ag-doc-sec" key={`${s.heading}-${i}`}>
                      {s.heading && !GENERIC_HEADING.test(s.heading.trim()) && <h3>{s.heading}</h3>}
                      <DocBody text={s.body} />
                    </section>
                  ))
                )}
              </>
            )}
          </>
        )}

        {tab === 'cautruc' && (
          <>
            {structure.length === 0 ? (
              <div className="ag-alert info">
                <Icon name="info" size={18} />
                <span>
                  {p.fromVersion
                    ? 'Bản mở lại từ Lịch sử không kèm kết quả kiểm tra cấu trúc.'
                    : 'Sản phẩm này chưa có kiểm tra cấu trúc tự động. Cô/thầy đọc kỹ trước khi dùng.'}
                </span>
              </div>
            ) : (
              <>
                <p className="ag-st-sum">
                  Đạt {sum.ok}/{sum.total} mục
                  {sum.missing.length === 0 ? ': cấu trúc đủ theo yêu cầu.' : `, còn ${sum.missing.length} mục chưa đạt.`}
                </p>
                <ul className="ag-st-list">
                  {structure.map((c) => (
                    <li key={c.id} className={c.ok ? 'ok' : 'bad'}>
                      <span className="ag-st-ico" aria-hidden="true">
                        <Icon name={c.ok ? 'check' : 'x'} size={16} />
                      </span>
                      <div>
                        <strong>{c.label}</strong>
                        <span className="ag-st-tag">{c.ok ? 'Đạt' : 'Chưa đạt'}</span>
                        {c.note && <small>{c.note}</small>}
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="ag-note">Đây là kiểm tra cấu trúc bằng quy tắc cố định, không phải điểm do AI tự chấm.</p>
              </>
            )}
          </>
        )}

        {tab === 'soi' && (
          <>
            {!r.reflection || r.reflection.skipped || r.reflection.scores.length === 0 ? (
              <div className="ag-alert warn">
                <Icon name="alert" size={18} />
                <span>
                  {p.fromVersion
                    ? 'Bản mở lại từ Lịch sử không kèm nhận xét của AI.'
                    : 'Lần này trợ lý chưa tự soi được. Cô/thầy nên đọc kỹ trước khi dùng.'}
                </span>
              </div>
            ) : (
              <>
                <div className="ag-alert info">
                  <Icon name="info" size={18} />
                  <span>
                    Điểm do trợ lý tự chấm bài do chính nó soạn nên thường cao. Chỉ dùng để tham khảo, người duyệt mới là chốt
                    chặn.
                  </span>
                </div>
                <p style={{ margin: '14px 0', fontWeight: 800, color: 'var(--navy)', fontSize: 18 }}>
                  Trung bình {r.reflection.average.toFixed(1)}/5
                </p>
                {r.reflection.scores.map((s) => (
                  <div className="ag-score" key={s.id}>
                    <span className="ag-score-name">{s.name}</span>
                    <span className="ag-score-val">{s.score}/5</span>
                    <span className="ag-bar" role="img" aria-label={`${s.score} trên 5`}>
                      <i style={{ width: `${(s.score / 5) * 100}%` }} />
                    </span>
                    {s.note && <span className="ag-score-note">{s.note}</span>}
                  </div>
                ))}
                {r.reflection.issues.length > 0 && (
                  <div className="ag-alert warn" style={{ marginTop: 16 }}>
                    <Icon name="alert" size={18} />
                    <div>
                      Trợ lý lưu ý:
                      <ul>
                        {r.reflection.issues.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === 'chuan' && (
          <>
            <dl className="ag-kv">
              <dt>Quy trình</dt>
              <dd>{WORKFLOW_LABELS[r.workflow] ?? r.workflow}</dd>
              <dt>Trạng thái</dt>
              <dd>
                {r.standard?.status === 'approved' ? (
                  <span className="ag-status ok">Đã duyệt</span>
                ) : r.standard?.status === 'chua_duyet' ? (
                  <span className="ag-status draft">Chưa duyệt (bản nháp)</span>
                ) : (
                  <span className="ag-status none">{p.fromVersion ? 'Không có thông tin' : 'Không có'}</span>
                )}
              </dd>
              <dt>Bài dạy</dt>
              <dd>{r.standard?.title ?? p.lessonTitle}</dd>
              <dt>Mã</dt>
              <dd>{r.standard?.atomId}</dd>
              {r.standard?.reviewedBy && (
                <>
                  <dt>Người duyệt</dt>
                  <dd>{r.standard.reviewedBy}</dd>
                </>
              )}
              {(r.bloomLevels ?? []).length > 0 && (
                <>
                  <dt>Các bậc tư duy</dt>
                  <dd>{r.bloomLevels.join(' → ')}</dd>
                </>
              )}
            </dl>
            <p className="ag-note">
              Trợ lý nâng cấp từ bản chuẩn này theo yêu cầu của cô/thầy, không soạn lại từ đầu và không thêm kiến thức ngoài bản
              chuẩn.
            </p>
          </>
        )}
      </div>

      {exportError && (
        <div className="ag-alert bad" role="alert" style={{ margin: '0 16px 12px' }}>
          <Icon name="alert" size={18} />
          <span>{exportError}</span>
        </div>
      )}
      {p.accepted && (
        <div className="ag-alert ok" role="status" style={{ margin: '0 16px 12px' }}>
          <Icon name="check" size={18} />
          <span>
            Đã ghi nhận.
            {typeof p.diffRatio === 'number'
              ? p.diffRatio === 0
                ? ' Cô/thầy dùng nguyên bản AI soạn.'
                : ` Cô/thầy đã chỉnh khoảng ${Math.round(p.diffRatio * 100)}% nội dung.`
              : ''}{' '}
            {p.version ? (
              <>
                Đã lưu thành phiên bản {p.version.number} trong{' '}
                <Link href="/lich-su" className="ag-inline-link">
                  Lịch sử của tôi
                </Link>
                .
              </>
            ) : p.versionFailed ? (
              'Chưa lưu được vào Lịch sử của tôi, nhưng việc duyệt vẫn được ghi nhận.'
            ) : null}
          </span>
        </div>
      )}

      <div className="ag-canvas-foot">
        <button type="button" className="ag-btn primary" onClick={accept} disabled={accepting || p.busy || p.accepted}>
          <Icon name="check" />
          {p.accepted ? 'Đã duyệt & dùng' : 'Duyệt & dùng'}
        </button>
        <button type="button" className="ag-btn" onClick={p.onRegenerate} disabled={p.busy}>
          <Icon name="refresh" />
          Sinh lại
        </button>
        {!cur && (
          <>
            <button type="button" className="ag-btn" onClick={download}>
              <Icon name="download" />
              Tải .docx
            </button>
            <button type="button" className="ag-btn" onClick={() => window.print()}>
              <Icon name="print" />
              In
            </button>
          </>
        )}
      </div>
    </div>
  );
}
