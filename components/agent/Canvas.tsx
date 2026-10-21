'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { buildFinalText, textToSections } from '@/lib/ui/soanBai';
import { formatLabel } from '@/lib/agent/flow';
import { WORKFLOW_LABELS, type ResultEntry } from './types';

type Tab = 'doc' | 'soi' | 'chuan';

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
function DocBody({ text }: { text: string }) {
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

interface Props {
  entry: ResultEntry;
  busy: boolean;
  onClose: () => void;
  onText: (text: string) => void;
  onRegenerate: () => void;
  onAccept: () => Promise<void> | void;
}

export function Canvas({ entry, busy, onClose, onText, onRegenerate, onAccept }: Props) {
  const [tab, setTab] = useState<Tab>('doc');
  const [editing, setEditing] = useState(false);
  const [exportError, setExportError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const r = entry.result;

  const headings = useMemo(() => r.content.sections.map((s) => s.heading), [r.content.sections]);
  const original = useMemo(() => buildFinalText(r.content.sections, r.content.markdown), [r]);
  const edited = entry.text !== original;
  const sections = useMemo(
    () => (edited ? textToSections(entry.text, headings) : r.content.sections),
    [edited, entry.text, headings, r.content.sections],
  );

  const download = async () => {
    setExportError('');
    try {
      const { buildDocxBlob, downloadBlob } = await import('@/lib/export/docx');
      const blob = await buildDocxBlob({
        title: entry.title.toUpperCase(),
        subtitle: [
          `${formatLabel(entry.slots.format)} · ${r.bloomLevels.join(' → ')}`,
          r.requiresApproval ? 'Bản nháp: cần người duyệt trước khi dùng' : 'Đã soạn từ bản chuẩn của Kho',
        ],
        sections: sections.map((s) => ({ heading: s.heading, body: s.body })),
      });
      const safe = entry.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'ban-soan';
      downloadBlob(blob, `${safe}.docx`);
    } catch {
      setExportError('Không tạo được file Word. Cô/thầy thử lại hoặc dùng nút In.');
    }
  };

  const accept = async () => {
    setAccepting(true);
    try {
      await onAccept();
    } finally {
      setAccepting(false);
    }
  };

  return (
    <aside className="ag-canvas" aria-label="Bản soạn">
      <div className="ag-canvas-head">
        <div className="ag-canvas-title">
          <h2>{entry.title}</h2>
          <p>
            {formatLabel(entry.slots.format)} · {WORKFLOW_LABELS[r.workflow] ?? r.workflow}
          </p>
        </div>
        <button type="button" className="ag-iconbtn" onClick={onClose} aria-label="Đóng bản soạn">
          <Icon name="x" />
        </button>
      </div>

      <div className="ag-tabs" role="tablist" aria-label="Nội dung bản soạn">
        {(
          [
            ['doc', 'Bản soạn'],
            ['soi', 'Tự soi'],
            ['chuan', 'Bản chuẩn'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            className="ag-tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="ag-canvas-body" role="tabpanel">
        {tab === 'doc' && (
          <>
            {r.requiresApproval && (
              <div className="ag-alert warn" role="status">
                <Icon name="alert" size={18} />
                <span>Cần người duyệt trước khi dùng. Đây mới là bản nháp.</span>
              </div>
            )}
            {r.warnings.length > 0 && (
              <div className="ag-alert info" role="status">
                <Icon name="info" size={18} />
                <ul>
                  {r.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
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
                <textarea
                  id="ag-edit"
                  className="ag-field"
                  rows={22}
                  value={entry.text}
                  onChange={(e) => onText(e.target.value)}
                />
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

        {tab === 'soi' && (
          <>
            {r.reflection.skipped || r.reflection.scores.length === 0 ? (
              <div className="ag-alert warn">
                <Icon name="alert" size={18} />
                <span>Lần này trợ lý chưa tự soi được. Cô/thầy nên đọc kỹ trước khi dùng.</span>
              </div>
            ) : (
              <>
                <div className="ag-alert info">
                  <Icon name="info" size={18} />
                  <span>
                    Điểm do trợ lý tự chấm bài do chính nó soạn nên thường cao. Chỉ dùng để tham khảo, người duyệt mới là
                    chốt chặn.
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
              <dt>Trạng thái</dt>
              <dd>
                {r.standard.status === 'approved' ? (
                  <span className="ag-status ok">Đã duyệt</span>
                ) : r.standard.status === 'chua_duyet' ? (
                  <span className="ag-status draft">Chưa duyệt (bản nháp)</span>
                ) : (
                  <span className="ag-status none">Không có</span>
                )}
              </dd>
              <dt>Bài dạy</dt>
              <dd>{r.standard.title ?? entry.slots.baiTitle}</dd>
              <dt>Mã</dt>
              <dd>{r.standard.atomId}</dd>
              {r.standard.reviewedBy && (
                <>
                  <dt>Người duyệt</dt>
                  <dd>{r.standard.reviewedBy}</dd>
                </>
              )}
              <dt>Các bậc tư duy</dt>
              <dd>{r.bloomLevels.join(' → ')}</dd>
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
      {entry.accepted && (
        <div className="ag-alert ok" role="status" style={{ margin: '0 16px 12px' }}>
          <Icon name="check" size={18} />
          <span>
            Đã ghi nhận.
            {typeof entry.diffRatio === 'number'
              ? entry.diffRatio === 0
                ? ' Cô/thầy dùng nguyên bản AI soạn.'
                : ` Cô/thầy đã chỉnh khoảng ${Math.round(entry.diffRatio * 100)}% nội dung.`
              : ''}
          </span>
        </div>
      )}

      <div className="ag-canvas-foot">
        <button type="button" className="ag-btn primary" onClick={accept} disabled={accepting || busy || entry.accepted}>
          <Icon name="check" />
          {entry.accepted ? 'Đã duyệt & dùng' : 'Duyệt & dùng'}
        </button>
        <button type="button" className="ag-btn" onClick={onRegenerate} disabled={busy}>
          <Icon name="refresh" />
          Sinh lại
        </button>
        <button type="button" className="ag-btn" onClick={download}>
          <Icon name="download" />
          Tải .docx
        </button>
        <button type="button" className="ag-btn" onClick={() => window.print()}>
          <Icon name="print" />
          In
        </button>
      </div>
    </aside>
  );
}
