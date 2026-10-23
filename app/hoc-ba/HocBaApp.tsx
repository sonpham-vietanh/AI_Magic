'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Shell } from '@/components/Shell';
import { FeedbackButton } from '@/components/ui/FeedbackButton';
import { Icon } from '@/components/ui/icons';
import { downloadBlob } from '@/lib/export/docx';
import { buildHocBaDocx } from '@/lib/hocba/exportDocx';
import { parseStudentList, toCsv } from '@/lib/hocba/parse';
import { givenName, validateComment } from '@/lib/hocba/prompt';
import {
  CAP_HOC,
  DEFAULT_BATCH_SIZE,
  DO_DAI,
  GIONG_VAN,
  KY_HOC,
  MAX_STUDENTS_PER_RUN,
  XUNG_HO,
  type CapHoc,
  type CommentIssue,
  type CommentResult,
  type DoDai,
  type GiongVan,
  type HocBaOptions,
  type KyHoc,
  type XungHo,
} from '@/lib/hocba/types';
import { recordHocBa } from '@/lib/stats/localSavings';
import '../ui-hb.css';

type Status = 'cho' | 'dang' | 'xong' | 'loi';

interface Row {
  id: string;
  ten: string;
  ghiChu: string;
  text: string;
  status: Status;
  issues: CommentIssue[];
  error?: string;
}

const SAMPLE = [
  'Nguyễn Minh An | chăm chỉ, hay giúp bạn, cần tự tin phát biểu hơn',
  'Trần Gia Bảo | tư duy nhanh môn Toán, đôi khi chưa cẩn thận khi trình bày',
  'Lê Thu Hà | ngoan, trách nhiệm trực nhật, cần đọc thêm sách để mở rộng vốn từ',
].join('\n');

let seq = 0;
const newId = () => `hs${Date.now().toString(36)}${(seq++).toString(36)}`;

async function callApi(
  rows: Pick<Row, 'id' | 'ten' | 'ghiChu'>[],
  options: HocBaOptions,
  signal?: AbortSignal,
): Promise<{ ok: true; results: CommentResult[] } | { ok: false; error: string; fatal: boolean }> {
  try {
    const r = await fetch('/api/hoc-ba/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ students: rows.map((s) => ({ id: s.id, ten: s.ten, ghiChu: s.ghiChu })), options }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; results?: CommentResult[] };
    if (r.ok && j.ok && Array.isArray(j.results)) return { ok: true, results: j.results };
    const msg =
      j.error ||
      (r.status === 429 ? 'Cô/thầy gửi hơi nhanh, xin chờ vài giây rồi thử lại.' : 'Chưa soạn được, cô/thầy thử lại sau ít giây.');
    return { ok: false, error: msg, fatal: r.status === 429 };
  } catch (e) {
    if (signal?.aborted) return { ok: false, error: 'Đã dừng.', fatal: true };
    return { ok: false, error: 'Không kết nối được máy chủ. Cô/thầy kiểm tra mạng rồi thử lại.', fatal: false };
  }
}

function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'lop'
  );
}

export function HocBaApp() {
  const [lop, setLop] = useState('');
  const [raw, setRaw] = useState('');
  const [capHoc, setCapHoc] = useState<CapHoc>('thcs');
  const [kyHoc, setKyHoc] = useState<KyHoc>('cuoi_hk1');
  const [doDai, setDoDai] = useState<DoDai>('vua');
  const [giong, setGiong] = useState<GiongVan>('am_ap');
  const [xungHo, setXungHo] = useState<XungHo>('em');
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [confirmRerun, setConfirmRerun] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const optionsRef = useRef<HocBaOptions>({ capHoc, doDai, giong, kyHoc, xungHo });
  const rowsRef = useRef<Row[]>([]);

  const options: HocBaOptions = useMemo(() => ({ capHoc, doDai, giong, kyHoc, xungHo }), [capHoc, doDai, giong, kyHoc, xungHo]);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const parsed = useMemo(() => parseStudentList(raw), [raw]);
  const hasResults = rows.some((r) => r.text);
  const doneCount = rows.filter((r) => r.status === 'xong').length;
  const failCount = rows.filter((r) => r.status === 'loi').length;

  // Danh sách học sinh chỉ nằm trong phiên: cảnh báo trước khi tải lại hoặc đóng trang khi đã có kết quả.
  useEffect(() => {
    if (!hasResults) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [hasResults]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const patchRows = useCallback((fn: (r: Row) => Row, ids?: Set<string>) => {
    setRows((prev) => prev.map((r) => (!ids || ids.has(r.id) ? fn(r) : r)));
  }, []);

  const applyResults = useCallback((results: CommentResult[]) => {
    const byId = new Map(results.map((r) => [r.id, r]));
    setRows((prev) =>
      prev.map((row) => {
        const res = byId.get(row.id);
        if (!res) return row;
        if (res.text) {
          return { ...row, text: res.text, status: 'xong', issues: res.issues ?? [], error: undefined };
        }
        return { ...row, status: 'loi', error: res.error || 'Chưa soạn được nhận xét cho em này.' };
      }),
    );
  }, []);

  const runBatches = useCallback(
    async (targets: Row[]) => {
      const ctl = new AbortController();
      abortRef.current = ctl;
      setRunning(true);
      setNotice(null);
      let okCount = 0;
      let stopMsg = '';
      for (let i = 0; i < targets.length; i += DEFAULT_BATCH_SIZE) {
        if (ctl.signal.aborted) break;
        const batch = targets.slice(i, i + DEFAULT_BATCH_SIZE);
        const ids = new Set(batch.map((b) => b.id));
        patchRows((r) => ({ ...r, status: 'dang', error: undefined }), ids);
        const res = await callApi(batch, optionsRef.current, ctl.signal);
        if (res.ok) {
          applyResults(res.results);
          okCount += res.results.filter((r) => r.text).length;
        } else {
          patchRows((r) => ({ ...r, status: 'loi', error: res.error }), ids);
          if (res.fatal) {
            stopMsg = res.error;
            break;
          }
        }
      }
      // Các em chưa kịp soạn (do dừng) quay lại trạng thái chờ có thể thử lại.
      patchRows(
        (r) => (r.status === 'cho' || r.status === 'dang' ? { ...r, status: 'loi', error: 'Chưa soạn, cô/thầy bấm "Tạo lại".' } : r),
        new Set(targets.map((t) => t.id)),
      );
      if (okCount > 0) recordHocBa(okCount);
      setRunning(false);
      abortRef.current = null;
      if (stopMsg && stopMsg !== 'Đã dừng.') setNotice({ kind: 'bad', text: stopMsg });
      else if (ctl.signal.aborted) setNotice({ kind: 'ok', text: `Đã dừng. ${okCount} nhận xét đã xong được giữ lại.` });
      else if (okCount > 0) setNotice({ kind: 'ok', text: `Đã soạn xong ${okCount} nhận xét. Cô/thầy đọc lại và chỉnh trước khi dùng.` });
    },
    [applyResults, patchRows],
  );

  const start = () => {
    if (parsed.students.length === 0 || running) return;
    if (hasResults && !confirmRerun) {
      setConfirmRerun(true);
      return;
    }
    setConfirmRerun(false);
    const fresh: Row[] = parsed.students.map((s) => ({
      id: newId(),
      ten: s.ten,
      ghiChu: s.ghiChu,
      text: '',
      status: 'cho',
      issues: [],
    }));
    setRows(fresh);
    void runBatches(fresh);
  };

  const retryFailed = () => {
    const failed = rowsRef.current.filter((r) => r.status === 'loi');
    if (failed.length > 0 && !running) void runBatches(failed);
  };

  const regenerate = async (id: string) => {
    const row = rowsRef.current.find((r) => r.id === id);
    if (!row) return;
    patchRows((r) => ({ ...r, status: 'dang', error: undefined }), new Set([id]));
    const res = await callApi([row], optionsRef.current);
    if (res.ok) {
      applyResults(res.results);
      if (res.results.some((r) => r.text)) recordHocBa(1);
    } else {
      patchRows((r) => ({ ...r, status: r.text ? 'xong' : 'loi', error: res.error }), new Set([id]));
    }
  };

  const editText = (id: string, text: string) => {
    setRows((prev) => {
      const names = prev.map((r) => givenName(r.ten));
      return prev.map((r, idx) =>
        r.id === id
          ? {
              ...r,
              text,
              issues: validateComment(text, r.ghiChu, optionsRef.current, names.filter((_, j) => j !== idx)),
            }
          : r,
      );
    });
  };

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const finished = rows.filter((r) => r.text);
  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ kind: 'ok', text: okMsg });
    } catch {
      setNotice({ kind: 'bad', text: 'Trình duyệt chưa cho sao chép. Cô/thầy chọn văn bản rồi nhấn Ctrl+C.' });
    }
  };
  const copyAll = () =>
    void copyText(finished.map((r) => `${r.ten}: ${r.text}`).join('\n\n'), `Đã sao chép ${finished.length} nhận xét.`);

  const fileBase = `nhan-xet-hoc-ba-${slug(lop)}`;
  const downloadCsv = () => {
    downloadBlob(new Blob([toCsv(finished.map((r) => ({ ten: r.ten, nhanXet: r.text })))], { type: 'text/csv;charset=utf-8' }), `${fileBase}.csv`);
    setNotice({ kind: 'ok', text: 'Đã tải tệp .csv về máy.' });
  };
  const downloadDocx = async () => {
    try {
      const kh = KY_HOC.find((k) => k.id === kyHoc)?.label ?? '';
      const blob = await buildHocBaDocx({
        title: `Nhận xét học bạ${lop.trim() ? ` - Lớp ${lop.trim()}` : ''}`,
        subtitle: kh,
        rows: finished.map((r) => ({ ten: r.ten, nhanXet: r.text })),
      });
      downloadBlob(blob, `${fileBase}.docx`);
      setNotice({ kind: 'ok', text: 'Đã tải tệp Word (.docx) về máy.' });
    } catch {
      setNotice({ kind: 'bad', text: 'Chưa tạo được tệp Word. Cô/thầy thử lại hoặc dùng nút Sao chép tất cả.' });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setNotice({ kind: 'bad', text: 'Tệp quá lớn (tối đa 1 MB). Cô/thầy chỉ cần hai cột: tên và ghi chú.' });
      return;
    }
    try {
      setRaw(await file.text());
      setNotice({ kind: 'ok', text: `Đã đọc tệp ${file.name}.` });
    } catch {
      setNotice({ kind: 'bad', text: 'Không đọc được tệp này. Cô/thầy thử lưu lại dưới dạng .csv hoặc .txt.' });
    }
  };

  const clearAll = () => {
    abortRef.current?.abort();
    setRaw('');
    setRows([]);
    setNotice(null);
    setConfirmRerun(false);
  };

  const cap = CAP_HOC.find((c) => c.id === capHoc);
  const n = parsed.students.length;

  return (
    <Shell
      title="Nhận xét học bạ"
      subtitle="Dán danh sách lớp kèm vài từ khoá cho mỗi em, mình viết nhận xét cho cả lớp trong vài phút."
    >
      <div className="hb">
        <p className="hb-privacy" role="note">
          <Icon name="shield" size={20} />
          <span>
            <strong>Dữ liệu học sinh được giữ kín.</strong> Danh sách chỉ nằm trong trang này, không lưu lên máy chủ. Tên học sinh không gửi cho AI, AI chỉ nhận phần từ khoá.
            Cô/thầy nên chỉ ghi tên hoặc mã, không ghi số điện thoại, địa chỉ hay thông tin gia đình. Khi đóng trang, danh sách sẽ mất.
          </span>
        </p>

        <section className="hb-card" aria-labelledby="hb-s1">
          <h2 id="hb-s1" className="hb-h">
            1. Danh sách lớp
          </h2>
          <div className="hb-grid">
            <label className="hb-fieldwrap">
              <span className="hb-label">Tên lớp (để đặt tên tệp)</span>
              <input className="hb-field" value={lop} maxLength={20} placeholder="Ví dụ: 7A2" onChange={(e) => setLop(e.target.value)} />
            </label>
            <label className="hb-fieldwrap">
              <span className="hb-label">Cấp học</span>
              <select className="hb-field" value={capHoc} onChange={(e) => setCapHoc(e.target.value as CapHoc)}>
                {CAP_HOC.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="hb-fieldwrap">
              <span className="hb-label">Thời điểm</span>
              <select className="hb-field" value={kyHoc} onChange={(e) => setKyHoc(e.target.value as KyHoc)}>
                {KY_HOC.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="hb-fieldwrap">
            <span className="hb-label">Mỗi dòng một em: tên, dấu | rồi các từ khoá (điểm mạnh, cần cố gắng, thái độ, ghi chú)</span>
            <textarea
              className="hb-field hb-list"
              rows={8}
              value={raw}
              placeholder={SAMPLE}
              onChange={(e) => {
                setRaw(e.target.value);
                setConfirmRerun(false);
              }}
            />
          </label>

          <div className="hb-row">
            <label className="hb-filebtn">
              <Icon name="file" size={18} />
              Tải tệp CSV hoặc TXT
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="hb-file"
                onChange={(e) => {
                  void onFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            <button type="button" className="ag-btn" onClick={() => setRaw(SAMPLE)}>
              Xem ví dụ
            </button>
            <button type="button" className="ag-btn" onClick={clearAll} disabled={!raw && rows.length === 0}>
              Xoá hết
            </button>
          </div>

          <p className="hb-count" role="status">
            {n === 0
              ? 'Chưa có học sinh nào. Cô/thầy dán danh sách hoặc tải tệp (tối đa ' + MAX_STUDENTS_PER_RUN + ' em mỗi lần).'
              : `Đã đọc ${n} học sinh${n >= MAX_STUDENTS_PER_RUN ? ' (đã đạt mức tối đa mỗi lần)' : ''}.`}
          </p>
          {parsed.warnings.map((w) => (
            <p key={w} className="hb-warn" role="status">
              {w}
            </p>
          ))}
        </section>

        <section className="hb-card" aria-labelledby="hb-s2">
          <h2 id="hb-s2" className="hb-h">
            2. Kiểu nhận xét
          </h2>
          <div className="hb-grid">
            <label className="hb-fieldwrap">
              <span className="hb-label">Độ dài</span>
              <select className="hb-field" value={doDai} onChange={(e) => setDoDai(e.target.value as DoDai)}>
                {DO_DAI.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="hb-fieldwrap">
              <span className="hb-label">Giọng văn</span>
              <select className="hb-field" value={giong} onChange={(e) => setGiong(e.target.value as GiongVan)}>
                {GIONG_VAN.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="hb-fieldwrap">
              <span className="hb-label">Cách gọi học sinh</span>
              <select className="hb-field" value={xungHo} onChange={(e) => setXungHo(e.target.value as XungHo)}>
                {XUNG_HO.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="hb-hint">
            Nhận xét theo {cap?.ref}: nêu phẩm chất và năng lực, giọng tích cực, khách quan, không so sánh học sinh với nhau.
          </p>
          <div className="hb-row">
            <button type="button" className="ag-btn primary hb-go" onClick={start} disabled={n === 0 || running}>
              <Icon name="sparkles" size={18} />
              {running
                ? 'Đang viết nhận xét…'
                : confirmRerun
                  ? 'Đồng ý viết lại, bỏ các chỗ đã sửa'
                  : hasResults
                    ? `Viết lại cho cả lớp (${n} em)`
                    : `Viết nhận xét cho cả lớp (${n} em)`}
            </button>
            {running && (
              <button type="button" className="ag-btn" onClick={() => abortRef.current?.abort()}>
                Dừng
              </button>
            )}
            {confirmRerun && !running && (
              <button type="button" className="ag-btn" onClick={() => setConfirmRerun(false)}>
                Giữ kết quả hiện tại
              </button>
            )}
          </div>
        </section>

        <div aria-live="polite" className="hb-live">
          {notice && (
            <p className={`hb-notice hb-notice-${notice.kind}`} role={notice.kind === 'bad' ? 'alert' : 'status'}>
              {notice.text}
            </p>
          )}
        </div>

        {rows.length > 0 && (
          <section className="hb-card" aria-labelledby="hb-s3">
            <div className="hb-resulthead">
              <h2 id="hb-s3" className="hb-h">
                3. Nhận xét ({doneCount}/{rows.length} em đã xong)
              </h2>
              <div className="hb-row">
                <button type="button" className="ag-btn small" onClick={copyAll} disabled={finished.length === 0}>
                  Sao chép tất cả
                </button>
                <button type="button" className="ag-btn small" onClick={() => void downloadDocx()} disabled={finished.length === 0}>
                  <Icon name="download" size={16} />
                  Tải .docx
                </button>
                <button type="button" className="ag-btn small" onClick={downloadCsv} disabled={finished.length === 0}>
                  <Icon name="download" size={16} />
                  Tải .csv
                </button>
                {/* Không gửi nội dung nhận xét kèm phản hồi vì có thể chứa thông tin học sinh. */}
                <FeedbackButton context={{ workflow: 'hoc_ba', format: 'hoc_ba' }} label="Báo lỗi nhận xét" />
                {failCount > 0 && !running && (
                  <button type="button" className="ag-btn small" onClick={retryFailed}>
                    <Icon name="refresh" size={16} />
                    Soạn lại {failCount} em còn thiếu
                  </button>
                )}
              </div>
            </div>
            <div
              className="hb-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={rows.length}
              aria-valuenow={doneCount}
              aria-label="Tiến độ soạn nhận xét"
            >
              <span style={{ width: `${Math.round((doneCount / rows.length) * 100)}%` }} />
            </div>

            <ol className="hb-list-ol">
              {rows.map((r, idx) => {
                const warn = r.issues.filter((i) => i.blocking || i.code === 'qua_dai' || i.code === 'qua_ngan');
                return (
                  <li key={r.id} className="hb-item">
                    <div className="hb-itemhead">
                      <span className="hb-name">
                        {idx + 1}. {r.ten}
                      </span>
                      <span className={`hb-badge hb-badge-${r.status === 'xong' && warn.length > 0 ? 'xem' : r.status}`}>
                        {r.status === 'cho' && 'Đang chờ'}
                        {r.status === 'dang' && 'Đang viết…'}
                        {r.status === 'xong' && (warn.length > 0 ? 'Cần xem lại' : 'Đã xong')}
                        {r.status === 'loi' && 'Chưa có nhận xét'}
                      </span>
                    </div>
                    {r.ghiChu && <p className="hb-note">Từ khoá: {r.ghiChu}</p>}
                    {r.status === 'dang' && !r.text && <div className="hb-skel" aria-hidden="true" />}
                    {(r.text || r.status === 'xong') && (
                      <textarea
                        className="hb-field hb-text"
                        rows={4}
                        aria-label={`Nhận xét của ${r.ten}`}
                        value={r.text}
                        onChange={(e) => editText(r.id, e.target.value)}
                      />
                    )}
                    {r.error && r.status === 'loi' && (
                      <p className="hb-err" role="alert">
                        {r.error}
                      </p>
                    )}
                    {warn.length > 0 && (
                      <ul className="hb-issues">
                        {warn.map((w) => (
                          <li key={w.code}>{w.message}</li>
                        ))}
                      </ul>
                    )}
                    <div className="hb-row">
                      <button type="button" className="ag-btn small" onClick={() => void regenerate(r.id)} disabled={r.status === 'dang'}>
                        <Icon name="refresh" size={16} />
                        Tạo lại
                      </button>
                      {r.text && (
                        <button type="button" className="ag-btn small" onClick={() => void copyText(r.text, `Đã sao chép nhận xét của ${r.ten}.`)}>
                          Sao chép
                        </button>
                      )}
                      <button type="button" className="ag-btn small" onClick={() => removeRow(r.id)} disabled={r.status === 'dang'}>
                        Bỏ em này
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>
    </Shell>
  );
}
