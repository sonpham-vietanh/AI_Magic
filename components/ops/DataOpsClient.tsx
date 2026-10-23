'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Shell } from '@/components/Shell';
import { Icon } from '@/components/ui/icons';
import type { InspectResult } from '@/lib/ops/stores';
import type { VerifyReport } from '@/lib/ops/exportBundle';
import '../../app/ui-dl.css';

interface LogRow {
  id: string;
  at: string;
  actor: string;
  action: 'export' | 'verify';
  detail?: string;
}
type Status = InspectResult & { log: LogRow[] };

const LOCATION: Record<string, { text: string; cls: string }> = {
  both: { text: 'Đĩa và Supabase', cls: 'ok' },
  disk: { text: 'Chỉ trên đĩa', cls: 'mid' },
  supabase: { text: 'Chỉ trên Supabase', cls: 'ok' },
  none: { text: 'Chưa có dữ liệu', cls: 'off' },
};
const ACTION_TEXT: Record<string, string> = { export: 'Tải bản sao lưu', verify: 'Kiểm tra bản sao lưu' };

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return 'Chưa ghi';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Chưa ghi';
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function DataOpsClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [report, setReport] = useState<(VerifyReport & { fileName: string }) | null>(null);
  const [verifyErr, setVerifyErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/data/status', { cache: 'no-store' });
      if (res.status === 401 || res.status === 403) {
        setDenied(true);
        return;
      }
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Lỗi không rõ');
      setDenied(false);
      setStatus(j as Status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được trạng thái kho dữ liệu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const doExport = async () => {
    setExporting(true);
    setExportMsg('');
    try {
      const res = await fetch('/api/admin/export', { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `Máy chủ trả lỗi ${res.status}.`);
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'va-sao-luu.json';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setExportMsg(`Đã tải ${name} (${fmtBytes(blob.size)}).`);
      void load();
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : 'Không tải được bản sao lưu.');
    } finally {
      setExporting(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setVerifying(true);
    setVerifyErr('');
    setReport(null);
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Tệp lớn hơn 25 MB, không kiểm tra được trên trang này.');
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('Tệp không phải JSON hợp lệ.');
      }
      const res = await fetch('/api/admin/data/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || `Máy chủ trả lỗi ${res.status}.`);
      setReport({ ...(j.report as VerifyReport), fileName: file.name });
      void load();
    } catch (e) {
      setVerifyErr(e instanceof Error ? e.message : 'Không kiểm tra được tệp.');
    } finally {
      setVerifying(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const stores = status?.stores ?? [];
  const withData = stores.filter((s) => s.exists);
  const totalBytes = stores.reduce((n, s) => n + s.bytes, 0);
  const cloud = status?.cloud;

  return (
    <Shell
      title="Dữ liệu và sao lưu"
      subtitle="Xem các kho dữ liệu của hệ thống, tải bản sao lưu và kiểm tra bản sao lưu cũ. Chỉ dành cho quản trị viên."
      rightAction={
        <button type="button" className="ag-btn" onClick={() => void load()} disabled={loading}>
          <Icon name="refresh" size={18} />
          Làm mới
        </button>
      }
    >
      <div className="dl">
          {denied && (
            <div className="dl-note dl-note-warn" role="alert">
              <Icon name="shield" size={20} />
              <div>
                <strong>Chỉ quản trị viên được xem trang này.</strong>
                <p>Cô/thầy đăng nhập bằng tài khoản quản trị (email nằm trong danh sách ADMIN_EMAILS) rồi mở lại trang.</p>
              </div>
            </div>
          )}
          {error && (
            <div className="dl-note dl-note-bad" role="alert">
              <Icon name="alert" size={20} />
              <div>
                <strong>Chưa tải được dữ liệu.</strong>
                <p>{error}</p>
              </div>
            </div>
          )}

          {!denied && (
            <>
              <section className="dl-stats" aria-label="Tổng quan">
                <div className="dl-stat">
                  <span className="dl-stat-label">Kho đang có dữ liệu</span>
                  <span className="dl-stat-value">{status ? `${withData.length}/${stores.length}` : '-'}</span>
                </div>
                <div className="dl-stat">
                  <span className="dl-stat-label">Tổng dung lượng</span>
                  <span className="dl-stat-value">{status ? fmtBytes(totalBytes) : '-'}</span>
                </div>
                <div className="dl-stat">
                  <span className="dl-stat-label">Đồng bộ Supabase</span>
                  <span className="dl-stat-value dl-stat-sm">
                    {!cloud ? '-' : cloud.enabled ? 'Đang bật' : cloud.configured ? 'Đã cấu hình, đang tắt' : 'Chưa cấu hình'}
                  </span>
                  {cloud?.error && <span className="dl-stat-hint">{cloud.error}</span>}
                  {cloud && !cloud.enabled && <span className="dl-stat-hint">Dữ liệu chỉ nằm trên đĩa của máy chủ này.</span>}
                </div>
              </section>

              <section className="dl-card" aria-labelledby="dl-h-backup">
                <h2 id="dl-h-backup">Sao lưu</h2>
                <p className="dl-lead">
                  Bản sao lưu là một tệp JSON gồm các kho, kèm checksum SHA-256 từng kho. Đã loại token phiên, mã và khóa; email được giữ nguyên.
                  Trang này chỉ tải về và kiểm tra, không tự khôi phục dữ liệu.
                </p>
                <div className="dl-actions">
                  <button type="button" className="ag-btn primary" onClick={() => void doExport()} disabled={exporting}>
                    <Icon name="download" size={18} />
                    {exporting ? 'Đang tạo bản sao lưu...' : 'Tải bản sao lưu'}
                  </button>
                  <input
                    ref={fileRef}
                    id="dl-file"
                    type="file"
                    accept="application/json,.json"
                    className="dl-file"
                    onChange={(e) => void onFile(e.target.files?.[0])}
                  />
                  <label htmlFor="dl-file" className={`ag-btn${verifying ? ' is-busy' : ''}`}>
                    <Icon name="check" size={18} />
                    {verifying ? 'Đang kiểm tra...' : 'Kiểm tra bản sao lưu'}
                  </label>
                </div>
                <p className="dl-msg" role="status" aria-live="polite">
                  {exportMsg}
                </p>

                {verifyErr && (
                  <div className="dl-note dl-note-bad" role="alert">
                    <Icon name="alert" size={20} />
                    <div>{verifyErr}</div>
                  </div>
                )}
                {report && (
                  <div className={`dl-report ${report.ok ? 'ok' : 'bad'}`} role="status">
                    <h3>
                      <Icon name={report.ok ? 'check' : 'alert'} size={20} />
                      {report.ok ? 'Bản sao lưu hợp lệ' : 'Bản sao lưu có vấn đề'}
                      <span className="dl-file-name">{report.fileName}</span>
                    </h3>
                    {report.createdAt && (
                      <p className="dl-lead">
                        Tạo lúc {fmtWhen(report.createdAt)}
                        {report.createdBy ? `, bởi ${report.createdBy}` : ''}.
                      </p>
                    )}
                    {report.errors.length > 0 && (
                      <ul className="dl-list dl-list-bad">
                        {report.errors.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    )}
                    {report.warnings.length > 0 && (
                      <ul className="dl-list dl-list-warn">
                        {report.warnings.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    )}
                    {report.checks.some((c) => c.ok) && (
                      <ul className="dl-checks">
                        {report.checks.filter((c) => c.ok).map((c) => (
                          <li key={c.key} className={c.ok ? 'dl-check-ok' : 'dl-check-bad'}>
                            <span className="dl-check-key">{c.key}</span>
                            <span>{c.ok ? `Khớp checksum, ${c.records} bản ghi` : c.problem}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>

              <section className="dl-card" aria-labelledby="dl-h-stores">
                <h2 id="dl-h-stores">Các kho dữ liệu</h2>
                {loading && !status ? (
                  <p className="dl-lead">Đang tải...</p>
                ) : (
                  <div className="dl-table-wrap">
                    <table className="dl-table">
                      <thead>
                        <tr>
                          <th scope="col">Kho</th>
                          <th scope="col">Nơi lưu</th>
                          <th scope="col" className="num">Bản ghi</th>
                          <th scope="col" className="num">Dung lượng</th>
                          <th scope="col">Ghi lần cuối</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stores.map((s) => {
                          const loc = LOCATION[s.location];
                          return (
                            <tr key={s.key}>
                              <th scope="row">
                                <span className="dl-store-name">{s.label}</span>
                                <code>{s.key}</code>
                                {s.error && <span className="dl-row-err">{s.error}</span>}
                              </th>
                              <td data-label="Nơi lưu">
                                <span className={`dl-pill dl-pill-${loc.cls}`}>{loc.text}</span>
                              </td>
                              <td data-label="Bản ghi" className="num">{s.exists ? s.records.toLocaleString('vi-VN') : '-'}</td>
                              <td data-label="Dung lượng" className="num">{s.exists ? fmtBytes(s.bytes) : '-'}</td>
                              <td data-label="Ghi lần cuối">{fmtWhen(s.lastWrite ?? s.cloudUpdatedAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="dl-card" aria-labelledby="dl-h-log">
                <h2 id="dl-h-log">Hoạt động gần đây</h2>
                {status && status.log.length === 0 ? (
                  <p className="dl-lead">Chưa có lần tải hay kiểm tra bản sao lưu nào.</p>
                ) : (
                  <ul className="dl-log">
                    {(status?.log ?? []).map((l) => (
                      <li key={l.id}>
                        <span className="dl-log-act">{ACTION_TEXT[l.action] ?? l.action}</span>
                        <span className="dl-log-who">{l.actor}</span>
                        <time dateTime={l.at}>{fmtWhen(l.at)}</time>
                        {l.detail && <span className="dl-log-detail">{l.detail}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
      </div>
    </Shell>
  );
}
