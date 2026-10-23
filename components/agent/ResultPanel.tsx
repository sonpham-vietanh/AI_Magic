'use client';

// Phần ruột dùng chung của "Bản soạn": khung bên phải của trợ lý và kết quả của trang biểu mẫu /soan-bai.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { ArtifactView } from '@/components/resources/ArtifactView';
import { MathText } from '@/components/MathText';
import { buildDocumentHtml, printHtml } from '@/lib/export/print';
import { RefineBox } from './result/RefineBox';
import { replaceSectionBody, type RefineContext } from './result/refine';
import { useTextHistory } from './result/useTextHistory';
import { buildFinalText, textToSections } from '@/lib/ui/soanBai';
import {
  ARTIFACT_SHORT,
  getArtifacts,
  getFromKho,
  getStructure,
  structureSummary,
  type AgentResult,
} from '@/lib/agent/result';
import {
  GAMMA_GUIDE,
  NOTEBOOKLM_GUIDE,
  buildGammaOutline,
  buildNotebookSource,
  exportFileName,
} from '@/lib/agent/exportText';
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
            <MathText text={line.trim()} />
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
  /** Bối cảnh gửi kèm khi "Viết lại" (môn, khối, lớp, phong cách). */
  refineContext?: RefineContext;
  onRegenerate: () => void;
  onAccept: () => Promise<void> | void;
}

export function ResultPanel(p: ResultPanelProps) {
  const r = p.result;
  const [tab, setTab] = useState<Tab>('doc');
  const [editing, setEditing] = useState(false);
  const [exportError, setExportError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sel, setSel] = useState(0);
  const [exported, setExported] = useState<null | { kind: 'gamma' | 'notebook'; copied: boolean }>(null);

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

  /** Chỉ đề kiểm tra và nội dung thời sự bị khoá cho tới khi người duyệt; mọi loại khác dùng được ngay. */
  const blocked = r.blockAcceptDownload === true;
  /** Bản nháp: bản chuẩn của Kho chưa duyệt hoặc AI soạn từ dữ liệu cơ bản. Không chặn thao tác, chỉ gắn nhãn. */
  const draft = !blocked && (r.draft === true || (r.draft === undefined && r.requiresApproval === true));
  const hist = useTextHistory(p.text, p.onText);
  const [printing, setPrinting] = useState(false);
  const docKind = r.workflow === 'khbd' ? 'khbd' : 'generic';
  const refineCtx: RefineContext = { baiDayTen: r.standard?.title ?? p.lessonTitle, ...(p.refineContext ?? {}) };
  const applyRefine = (i: number, body: string) => {
    const next = replaceSectionBody(sections, i, body);
    hist.commit(buildFinalText(next, p.text));
  };

  const download = async () => {
    if (blocked) return;
    setExportError('');
    try {
      const { buildDocxBlob, downloadBlob } = await import('@/lib/export/docx');
      const blob = await buildDocxBlob({
        title: p.title.toUpperCase(),
        subtitle: docSubtitle(),
        sections: sections.map((s) => ({ heading: GENERIC_HEADING.test(s.heading.trim()) ? '' : s.heading, body: s.body })),
        kind: docKind,
        draft,
      });
      const safe = p.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'ban-soan';
      downloadBlob(blob, `${safe}.docx`);
    } catch {
      setExportError('Không tạo được file Word. Cô/thầy thử lại hoặc dùng nút In.');
    }
  };

  /** Phụ đề: bỏ phần trống để không còn dấu chấm hay mũi tên thừa (bản mở lại từ Lịch sử không có bậc tư duy). */
  const docSubtitle = () =>
    [[p.formatText, (r.bloomLevels ?? []).join(' → ')].filter((x) => x && x.trim()).join(' · '), draft ? '' : r.standard?.status === 'approved' ? 'Soạn từ bản chuẩn đã duyệt của Kho' : '']
      .map((x) => x.trim())
      .filter(Boolean);

  /** In đúng A4: dựng trang in sạch trong khung ẩn (có công thức, có dấu bản nháp), không in cả giao diện ứng dụng. */
  const printDoc = async () => {
    setExportError('');
    setPrinting(true);
    try {
      await printHtml(
        buildDocumentHtml(
          {
            title: p.title,
            subtitle: docSubtitle(),
            sections: sections.map((s) => ({ heading: GENERIC_HEADING.test(s.heading.trim()) ? '' : s.heading, body: s.body })),
          },
          { draft },
        ),
      );
    } catch {
      setExportError('Chưa mở được bản in. Cô/thầy thử lại hoặc dùng nút Tải .docx rồi in từ Word.');
    } finally {
      setPrinting(false);
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

  const copyText = async () => {
    if (!p.text.trim()) return;
    try {
      await navigator.clipboard.writeText(p.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setExportError('Trình duyệt không cho phép sao chép tự động. Cô/thầy bôi đen văn bản để chép.');
    }
  };

  /** Xuất văn bản để dán vào Gamma / thêm vào NotebookLM: sao chép + tải .md, không gọi API ngoài. */
  const exportTo = async (kind: 'gamma' | 'notebook') => {
    if (blocked) return;
    setExportError('');
    const input = {
      title: p.title,
      formatText: p.formatText,
      lessonTitle: r.standard?.title ?? p.lessonTitle,
      bloomLevels: r.bloomLevels ?? [],
      draft,
      text: p.text,
      sections,
      artifacts,
    };
    const body = kind === 'gamma' ? buildGammaOutline(input) : buildNotebookSource(input);
    let copiedOk = false;
    try {
      await navigator.clipboard.writeText(body);
      copiedOk = true;
    } catch {
      /* vẫn tải tệp */
    }
    try {
      const url = URL.createObjectURL(new Blob([body], { type: 'text/markdown;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFileName(p.title, kind === 'gamma' ? 'gamma' : 'notebooklm');
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      if (!copiedOk) setExportError('Chưa xuất được văn bản. Cô/thầy dùng nút Sao chép ở bên cạnh nhé.');
    }
    setExported({ kind, copied: copiedOk });
  };

  const canExport = p.text.trim().length > 0 || artifacts.length > 0;

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
            {blocked && (
              <div className="ag-alert warn" role="status">
                <Icon name="alert" size={18} />
                <span>
                  <strong>Loại này cần người duyệt trước khi tải về hoặc dùng.</strong>{' '}
                  {(r.approvalReasons ?? []).length > 0
                    ? `${(r.approvalReasons ?? []).join('; ')}.`
                    : 'Đề kiểm tra và nội dung thời sự được kiểm tra kỹ hơn để bảo đảm chính xác.'}{' '}
                  Cô/thầy vẫn xem và sao chép được.
                  {r.approvalUrl && (
                    <>
                      {' '}
                      <a href={r.approvalUrl} className="ag-inline-link">
                        Mở trang duyệt
                      </a>
                    </>
                  )}
                </span>
              </div>
            )}
            {draft && (
              <div className="dr-banner" role="status">
                <span className="dr-tag">
                  <Icon name="edit" size={14} />
                  Bản nháp, chưa duyệt
                </span>
                <span className="dr-text">
                  Cô/thầy dùng và tải về được ngay. Tệp tải về có dấu “BẢN NHÁP” để không nhầm với bản đã duyệt.
                  {(r.draftReasons ?? r.approvalReasons ?? []).length > 0 && ` Lý do: ${(r.draftReasons ?? r.approvalReasons ?? []).join('; ')}.`}
                  {r.approvalUrl && (
                    <>
                      {' '}
                      <a href={r.approvalUrl} className="ag-inline-link">
                        Mở trang duyệt
                      </a>
                    </>
                  )}
                </span>
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
                  <ArtifactView artifact={cur} draft={draft} />
                </div>
              </>
            ) : (
              <>
                <div className="dr-tools">
                  <button type="button" className="ag-btn small" onClick={hist.undo} disabled={!hist.canUndo || p.busy}>
                    <Icon name="refresh" size={16} />
                    Hoàn tác
                  </button>
                  <button type="button" className="ag-btn small" onClick={hist.redo} disabled={!hist.canRedo || p.busy}>
                    Làm lại
                  </button>
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
                    <textarea id="ag-edit" className="ag-field" rows={22} value={p.text} onChange={(e) => hist.commit(e.target.value, 'type')} />
                  </>
                ) : (
                  sections.map((s, i) => (
                    <section className="ag-doc-sec" key={`${s.heading}-${i}`}>
                      <div className="rf-head">
                        {s.heading && !GENERIC_HEADING.test(s.heading.trim()) ? <h3><MathText text={s.heading} /></h3> : <span />}
                        {s.body.trim() && (
                          <RefineBox
                            heading={GENERIC_HEADING.test(s.heading.trim()) ? '' : s.heading}
                            body={s.body}
                            format={p.formatText}
                            context={refineCtx}
                            disabled={p.busy}
                            onApply={(body) => applyRefine(i, body)}
                            onUndo={hist.undo}
                            canUndo={hist.canUndo}
                          />
                        )}
                      </div>
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
      {exported && (
        <div className="ag-alert info ag-export-guide" role="status" style={{ margin: '0 16px 12px' }}>
          <Icon name="info" size={18} />
          <div>
            <strong>
              {exported.kind === 'gamma' ? 'Đã tạo dàn ý cho Gamma' : 'Đã tạo nguồn cho NotebookLM'}
              {exported.copied ? ': đã sao chép và tải tệp .md.' : ': đã tải tệp .md (trình duyệt chặn sao chép tự động).'}
            </strong>
            <ol>
              {(exported.kind === 'gamma' ? GAMMA_GUIDE : NOTEBOOKLM_GUIDE).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </div>
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
        <button
          type="button"
          className="ag-btn primary"
          onClick={accept}
          disabled={accepting || p.busy || p.accepted || blocked}
          title={blocked ? 'Loại này cần người duyệt trước khi dùng' : 'Lưu vào Lịch sử của tôi'}
        >
          <Icon name="check" />
          {p.accepted ? 'Đã duyệt & dùng' : 'Duyệt & dùng'}
        </button>
        <button type="button" className="ag-btn" onClick={p.onRegenerate} disabled={p.busy}>
          <Icon name="refresh" />
          Sinh lại
        </button>
        {p.text.trim().length > 0 && (
          <button type="button" className="ag-btn" onClick={() => void copyText()}>
            <Icon name={copied ? 'check' : 'clipboard'} />
            {copied ? 'Đã chép' : 'Sao chép'}
          </button>
        )}
        {canExport && (
          <>
            <button
              type="button"
              className="ag-btn"
              onClick={() => void exportTo('gamma')}
              disabled={blocked}
              title={blocked ? 'Loại này cần người duyệt trước khi xuất' : 'Tạo dàn ý slide để dán vào Gamma'}
            >
              <Icon name="slides" />
              Xuất sang Gamma
            </button>
            <button
              type="button"
              className="ag-btn"
              onClick={() => void exportTo('notebook')}
              disabled={blocked}
              title={blocked ? 'Loại này cần người duyệt trước khi xuất' : 'Tạo văn bản nguồn để thêm vào NotebookLM'}
            >
              <Icon name="book" />
              Xuất sang NotebookLM
            </button>
          </>
        )}
        {!cur && (
          <>
            <button type="button" className="ag-btn" onClick={download} disabled={blocked} title={blocked ? 'Loại này cần người duyệt trước khi tải' : draft ? 'Tệp có dấu BẢN NHÁP' : undefined}>
              <Icon name="download" />
              Tải .docx
            </button>
            <button type="button" className="ag-btn" onClick={() => void printDoc()} disabled={blocked || printing || p.text.trim().length === 0}>
              <Icon name="print" />
              In
            </button>
          </>
        )}
      </div>
    </div>
  );
}
