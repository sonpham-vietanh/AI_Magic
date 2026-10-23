'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { ApiError, fetchJson, friendlyError } from '@/lib/ui/fetchJson';
import { UsageChart, formatMetric, metricLabel, type Metric } from './UsageChart';
import '../../app/ui-su.css';

type Range = '7d' | '30d' | 'month';

interface Bucket {
  key: string;
  runs: number;
  calls: number;
  errors: number;
  tokens: number;
  costUsd: number;
}
interface Report {
  ok: true;
  range: Range;
  from: string;
  to: string;
  dailyLimit: number;
  note?: string;
  totals: {
    runs: number;
    calls: number;
    errors: number;
    promptTokens: number;
    completionTokens: number;
    tokens: number;
    costUsd: number;
    activeUsers: number;
    estimatedCalls: number;
  };
  byDay: (Bucket & { day: string })[];
  byUser: Bucket[];
  byWorkflow: Bucket[];
  byModel: Bucket[];
  month: {
    key: string;
    spentUsd: number;
    forecastUsd: number;
    budgetUsd: number;
    overBudget: boolean;
    forecastOverBudget: boolean;
    daysElapsed: number;
    daysInMonth: number;
  };
}

const RANGES: { id: Range; label: string }[] = [
  { id: '7d', label: '7 ngày' },
  { id: '30d', label: '30 ngày' },
  { id: 'month', label: 'Tháng này' },
];
const METRICS: { id: Metric; label: string }[] = [
  { id: 'tokens', label: 'Token' },
  { id: 'costUsd', label: 'Chi phí' },
  { id: 'runs', label: 'Lượt soạn' },
];

const WORKFLOW_LABEL: Record<string, string> = {
  'wf:khbd': 'Kế hoạch bài dạy',
  'wf:slide': 'Slide bài giảng',
  'wf:worksheet': 'Phiếu học tập',
  'wf:quiz': 'Quiz nhanh',
  'wf:de_kiem_tra': 'Đề kiểm tra',
  'wf:tai_nguyen_6_dang': 'Tài nguyên 6 dạng',
  generate: 'Công cụ sư phạm',
  'generate-pack': 'Trọn bộ hồ sơ tiết dạy',
  assistant: 'Trợ lý sư phạm',
  khac: 'Khác (chưa gắn công cụ)',
};
const workflowLabel = (k: string) => WORKFLOW_LABEL[k] ?? k;

const nf = new Intl.NumberFormat('vi-VN');
const usd = (v: number) => `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`.replace('.', ',');
const num = (v: number) => nf.format(Math.round(v));
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function todayVN(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

export function UsageDashboard() {
  const [range, setRange] = useState<Range>('7d');
  const [metric, setMetric] = useState<Metric>('tokens');
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r: Range) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchJson<Report>(`/api/admin/usage?range=${r}`));
    } catch (e) {
      setData(null);
      setError({
        status: e instanceof ApiError ? e.status : 0,
        message: friendlyError(e, 'Chưa tải được số liệu sử dụng AI. Cô/thầy thử lại sau ít phút nhé.'),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [range, load]);

  const forbidden = error && (error.status === 401 || error.status === 403);

  return (
    <div className="su">
      <div className="su-toolbar">
        <div role="group" aria-label="Khoảng thời gian" className="su-seg">
          {RANGES.map((r) => (
            <button key={r.id} type="button" className="su-seg-btn" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        <a className="btn su-csv" href={`/api/admin/usage?range=${range}&format=csv`} download aria-disabled={Boolean(forbidden)}>
          <Icon name="download" size={18} aria-hidden="true" />
          Tải CSV
        </a>
      </div>

      {forbidden && (
        <div className="su-state" role="alert">
          <Icon name="shield" size={28} aria-hidden="true" />
          <h2>Trang này dành cho quản trị viên</h2>
          <p>
            {error?.status === 401
              ? 'Cô/thầy cần đăng nhập bằng tài khoản quản trị để xem số liệu sử dụng AI.'
              : 'Tài khoản hiện tại chưa có quyền quản trị. Nếu cô/thầy cần xem số liệu này, xin liên hệ người phụ trách hệ thống.'}
          </p>
        </div>
      )}

      {error && !forbidden && (
        <div className="su-state" role="alert">
          <Icon name="alert" size={28} aria-hidden="true" />
          <h2>Chưa tải được số liệu</h2>
          <p>{error.message}</p>
          <button type="button" className="btn btn-navy" onClick={() => void load(range)}>
            <Icon name="refresh" size={18} aria-hidden="true" />
            Thử lại
          </button>
        </div>
      )}

      {loading && !data && !error && (
        <div className="su-skel" aria-busy="true" aria-label="Đang tải số liệu">
          <div className="su-skel-row">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="su-skel-card" />
            ))}
          </div>
          <span className="su-skel-chart" />
        </div>
      )}

      {data && (
        <div className={loading ? 'su-body su-dim' : 'su-body'} aria-live="polite">
          {(data.month.overBudget || data.month.forecastOverBudget) && (
            <div className={data.month.overBudget ? 'su-alert su-alert-danger' : 'su-alert su-alert-warn'} role="alert">
              <Icon name="alert" size={22} aria-hidden="true" />
              <div>
                <strong>{data.month.overBudget ? 'Đã vượt ngân sách AI của tháng này' : 'Dự báo sẽ vượt ngân sách AI của tháng này'}</strong>
                <p>
                  Đã chi ước tính {usd(data.month.spentUsd)} trên ngân sách {usd(data.month.budgetUsd)}; theo đà hiện tại cuối tháng khoảng{' '}
                  {usd(data.month.forecastUsd)}. Hệ thống chỉ cảnh báo, chưa tự chặn. Có thể giảm hạn mức lượt/ngày (USAGE_DAILY_LIMIT) nếu cần.
                </p>
              </div>
            </div>
          )}

          <p className="su-period">
            Từ {dmy(data.from)} đến {dmy(data.to)} · giờ Việt Nam
          </p>

          <ul className="su-stats">
            <li className="su-stat">
              <span className="su-stat-ico"><Icon name="sparkles" size={20} aria-hidden="true" /></span>
              <span className="su-stat-label">Lượt soạn bằng AI</span>
              <strong className="su-stat-val">{num(data.totals.runs)}</strong>
              <span className="su-stat-sub">{num(data.totals.calls)} lời gọi AI · {data.totals.activeUsers} người dùng</span>
            </li>
            <li className="su-stat">
              <span className="su-stat-ico"><Icon name="layers" size={20} aria-hidden="true" /></span>
              <span className="su-stat-label">Tổng token</span>
              <strong className="su-stat-val">{formatMetric('tokens', data.totals.tokens)}</strong>
              <span className="su-stat-sub">
                Vào {formatMetric('tokens', data.totals.promptTokens)} · ra {formatMetric('tokens', data.totals.completionTokens)}
              </span>
            </li>
            <li className="su-stat">
              <span className="su-stat-ico"><Icon name="chart" size={20} aria-hidden="true" /></span>
              <span className="su-stat-label">Chi phí ước tính</span>
              <strong className="su-stat-val">{usd(data.totals.costUsd)}</strong>
              <span className="su-stat-sub">Theo bảng giá tham khảo, có thể lệch hoá đơn</span>
            </li>
            <li className="su-stat">
              <span className="su-stat-ico"><Icon name="alert" size={20} aria-hidden="true" /></span>
              <span className="su-stat-label">Lời gọi lỗi</span>
              <strong className="su-stat-val">{pct(data.totals.errors, data.totals.calls)}%</strong>
              <span className="su-stat-sub">
                {num(data.totals.errors)} lỗi · {pct(data.totals.estimatedCalls, data.totals.calls)}% token tự ước tính
              </span>
            </li>
          </ul>

          <section className="su-card" aria-labelledby="su-month">
            <h2 id="su-month" className="su-h">Chi phí tháng {data.month.key.slice(5, 7)}/{data.month.key.slice(0, 4)}</h2>
            <div className="su-month">
              <div>
                <span className="su-month-k">Đã chi (ước tính)</span>
                <strong className="su-month-v">{usd(data.month.spentUsd)}</strong>
              </div>
              <div>
                <span className="su-month-k">Dự báo cuối tháng</span>
                <strong className="su-month-v">{usd(data.month.forecastUsd)}</strong>
              </div>
              <div>
                <span className="su-month-k">Ngân sách</span>
                <strong className="su-month-v">{data.month.budgetUsd > 0 ? usd(data.month.budgetUsd) : 'Chưa đặt'}</strong>
              </div>
              <div>
                <span className="su-month-k">Hạn mức mỗi người</span>
                <strong className="su-month-v">{data.dailyLimit > 0 ? `${data.dailyLimit} lượt/ngày` : 'Không giới hạn'}</strong>
              </div>
            </div>
            {data.month.budgetUsd > 0 ? (
              <div
                className="su-meter"
                role="progressbar"
                aria-label="Mức dùng ngân sách tháng"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, pct(data.month.spentUsd, data.month.budgetUsd))}
                aria-valuetext={`${pct(data.month.spentUsd, data.month.budgetUsd)}% ngân sách`}
              >
                <span
                  className={data.month.overBudget ? 'su-meter-fill su-over' : 'su-meter-fill'}
                  style={{ width: `${Math.min(100, pct(data.month.spentUsd, data.month.budgetUsd))}%` }}
                />
              </div>
            ) : (
              <p className="su-hint">Chưa đặt ngân sách tháng. Đặt biến môi trường USAGE_MONTHLY_BUDGET_USD để nhận cảnh báo khi sắp vượt.</p>
            )}
          </section>

          <section className="su-card" aria-labelledby="su-chart-h">
            <div className="su-card-head">
              <h2 id="su-chart-h" className="su-h">{metricLabel(metric)} theo ngày</h2>
              <div role="group" aria-label="Chỉ số hiển thị" className="su-seg su-seg-sm">
                {METRICS.map((m) => (
                  <button key={m.id} type="button" className="su-seg-btn" aria-pressed={metric === m.id} onClick={() => setMetric(m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <UsageChart data={data.byDay.map((d) => ({ day: d.day, runs: d.runs, tokens: d.tokens, costUsd: d.costUsd }))} metric={metric} today={todayVN()} />
            <details className="su-details">
              <summary>Xem số liệu theo ngày dạng bảng</summary>
              <div className="su-scroll">
                <table className="su-table">
                  <caption className="su-sr">Sử dụng AI theo ngày</caption>
                  <thead>
                    <tr>
                      <th scope="col">Ngày</th>
                      <th scope="col" className="su-r">Lượt soạn</th>
                      <th scope="col" className="su-r">Token</th>
                      <th scope="col" className="su-r">Chi phí ước tính</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byDay.map((d) => (
                      <tr key={d.day}>
                        <th scope="row">{dmy(d.day)}</th>
                        <td className="su-r">{num(d.runs)}</td>
                        <td className="su-r">{num(d.tokens)}</td>
                        <td className="su-r">{usd(d.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <div className="su-two">
            <BucketTable title="Theo người dùng" firstCol="Người dùng" rows={data.byUser} label={(k) => k} id="su-user" emptyText="Chưa có người dùng nào gọi AI trong khoảng này." mono />
            <BucketTable title="Theo công cụ" firstCol="Công cụ" rows={data.byWorkflow} label={workflowLabel} id="su-wf" emptyText="Chưa có lượt soạn nào." />
          </div>
          <BucketTable title="Theo mô hình AI" firstCol="Mô hình" rows={data.byModel} label={(k) => k} id="su-model" emptyText="Chưa có dữ liệu mô hình." mono />

          <p className="su-note">
            {data.note ?? 'Chi phí là ước tính theo bảng giá tham khảo.'} Giá có thể thay đổi; có thể ghi đè bằng biến USAGE_PRICING_JSON. Khi nhà cung cấp không trả
            số token, hệ thống tự ước tính (ký tự chia 3).
          </p>
        </div>
      )}
    </div>
  );
}

function BucketTable({
  title,
  firstCol,
  rows,
  label,
  id,
  emptyText,
  mono,
}: {
  title: string;
  firstCol: string;
  rows: Bucket[];
  label: (k: string) => string;
  id: string;
  emptyText: string;
  mono?: boolean;
}) {
  const maxCost = Math.max(0, ...rows.map((r) => r.costUsd));
  return (
    <section className="su-card" aria-labelledby={id}>
      <h2 id={id} className="su-h">{title}</h2>
      {rows.length === 0 ? (
        <p className="su-empty">{emptyText}</p>
      ) : (
        <div className="su-scroll">
          <table className="su-table">
            <thead>
              <tr>
                <th scope="col">{firstCol}</th>
                <th scope="col" className="su-r">Lượt</th>
                <th scope="col" className="su-r">Token</th>
                <th scope="col" className="su-r">Chi phí</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row" className={mono ? 'su-name su-mono' : 'su-name'}>
                    <span className="su-name-t">{label(r.key)}</span>
                    <span className="su-bar-bg" aria-hidden="true">
                      <span className="su-bar-fg" style={{ width: `${maxCost > 0 ? Math.max(3, (r.costUsd / maxCost) * 100) : 0}%` }} />
                    </span>
                  </th>
                  <td className="su-r">{num(r.runs)}</td>
                  <td className="su-r">{formatMetric('tokens', r.tokens)}</td>
                  <td className="su-r">{usd(r.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
