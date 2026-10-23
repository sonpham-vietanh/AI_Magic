'use client';

import { useEffect, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/icons';
import { formatLabel, type FormatValue } from '@/lib/agent/flow';
import { EVENT_HISTORY, formatWhen, loadHistory } from '@/lib/agent/history';
import { greetingByHour, greetingName, isReviewerRole, roleLabel, type MeInfo } from '@/lib/agent/prefs';
import type { UsageInfo } from './useMe';

const QUICK: { format: FormatValue; icon: IconName; title: string; desc: string; tone: string }[] = [
  { format: 'ke_hoach', icon: 'book', title: 'Kế hoạch bài dạy', desc: 'Theo Công văn 5512, dựa trên gói kiến thức của Kho', tone: 'navy' },
  { format: 'slide', icon: 'slides', title: 'Slide bài giảng', desc: 'Bộ slide tải ngay về PowerPoint (.pptx)', tone: 'gold' },
  { format: 'worksheet', icon: 'file', title: 'Phiếu học tập', desc: 'Phiếu cho học sinh, đáp án riêng cho giáo viên', tone: 'teal' },
  { format: 'quiz', icon: 'quiz', title: 'Quiz củng cố', desc: 'Câu hỏi nhanh trong tiết, kèm giải thích', tone: 'rose' },
];

const MORE: { format: FormatValue; icon: IconName; label: string }[] = [
  { format: 'de_kiem_tra', icon: 'exam', label: 'Đề kiểm tra và ma trận TT22' },
  { format: 'infographic', icon: 'layers', label: 'Infographic' },
  { format: 'mindmap', icon: 'graph', label: 'Sơ đồ tư duy' },
  { format: 'podcast', icon: 'podcast', label: 'Podcast đối thoại' },
  { format: 'video', icon: 'video', label: 'Kịch bản video' },
  { format: 'tranh_luan', icon: 'users', label: 'Tranh luận 2 chuyên gia' },
  { format: 'tai_nguyen_6_dang', icon: 'sparkles', label: 'Trọn bộ 6 tài nguyên' },
];

/** Minh hoạ tự vẽ: bản soạn, slide và câu hỏi quanh một tia sáng. Trang trí nên ẩn khỏi trình đọc màn hình. */
export function HeroArt() {
  return (
    <svg className="ag-art-svg" viewBox="0 0 380 320" role="presentation" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ag-g-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F9DD0E" />
          <stop offset="1" stopColor="#E8C40A" />
        </linearGradient>
        <linearGradient id="ag-g-navy" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#26275D" />
          <stop offset="1" stopColor="#14153A" />
        </linearGradient>
      </defs>
      <circle cx="196" cy="162" r="132" fill="#FBF6DC" />
      <circle cx="196" cy="162" r="96" fill="none" stroke="#E8C40A" strokeOpacity="0.45" strokeDasharray="3 9" strokeWidth="2" />
      {/* slide */}
      <g className="ag-art-float b" transform="rotate(7 288 118)">
        <rect x="222" y="62" width="136" height="92" rx="12" fill="#fff" stroke="#D3CFC0" />
        <rect x="222" y="62" width="136" height="20" rx="12" fill="url(#ag-g-navy)" />
        <rect x="222" y="74" width="136" height="8" fill="url(#ag-g-navy)" />
        <circle cx="236" cy="72" r="3" fill="#F9DD0E" />
        <rect x="236" y="96" width="50" height="6" rx="3" fill="#14153A" />
        <rect x="236" y="108" width="34" height="5" rx="2.5" fill="#D3CFC0" />
        <rect x="300" y="132" width="10" height="14" rx="2" fill="#E8C40A" />
        <rect x="314" y="122" width="10" height="24" rx="2" fill="#14153A" />
        <rect x="328" y="112" width="10" height="34" rx="2" fill="#26275D" />
      </g>
      {/* kế hoạch bài dạy */}
      <g className="ag-art-float a">
        <rect x="70" y="52" width="150" height="196" rx="14" fill="#fff" stroke="#D3CFC0" />
        <rect x="70" y="52" width="150" height="38" rx="14" fill="url(#ag-g-navy)" />
        <rect x="70" y="76" width="150" height="14" fill="url(#ag-g-navy)" />
        <rect x="86" y="64" width="64" height="8" rx="4" fill="#F9DD0E" />
        <rect x="86" y="104" width="118" height="7" rx="3.5" fill="#14153A" />
        <rect x="86" y="120" width="96" height="6" rx="3" fill="#D3CFC0" />
        <rect x="86" y="134" width="108" height="6" rx="3" fill="#D3CFC0" />
        <rect x="86" y="154" width="118" height="7" rx="3.5" fill="#14153A" />
        <rect x="86" y="170" width="84" height="6" rx="3" fill="#D3CFC0" />
        <rect x="86" y="184" width="100" height="6" rx="3" fill="#D3CFC0" />
        <rect x="86" y="204" width="56" height="22" rx="11" fill="url(#ag-g-gold)" />
        <path d="M96 215l4 4 8-8" fill="none" stroke="#14153A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* câu hỏi */}
      <g className="ag-art-float c">
        <rect x="204" y="190" width="132" height="70" rx="14" fill="#14153A" />
        <path d="M236 260l-6 18 22-18z" fill="#14153A" />
        <circle cx="228" cy="214" r="12" fill="url(#ag-g-gold)" />
        <text x="228" y="219" textAnchor="middle" fontSize="15" fontWeight="800" fill="#14153A" fontFamily="inherit">
          ?
        </text>
        <rect x="248" y="208" width="72" height="6" rx="3" fill="#E2E3F0" />
        <rect x="248" y="220" width="52" height="6" rx="3" fill="#8D8FC0" />
        <rect x="218" y="238" width="100" height="10" rx="5" fill="#26275D" />
        <rect x="218" y="238" width="62" height="10" rx="5" fill="#F9DD0E" />
      </g>
      {/* tia sáng */}
      <g className="ag-art-spark">
        <path d="M62 120l5 12 12 5-12 5-5 12-5-12-12-5 12-5z" fill="#E8C40A" />
        <path d="M336 30l3.5 8.5 8.5 3.5-8.5 3.5-3.5 8.5-3.5-8.5-8.5-3.5 8.5-3.5z" fill="#14153A" />
        <circle cx="48" cy="248" r="5" fill="#26275D" />
        <circle cx="352" cy="170" r="4" fill="#E8C40A" />
      </g>
    </svg>
  );
}

export interface RecentItem {
  key: string;
  title: string;
  meta: string;
  kind: 'version' | 'local';
  id: string;
}

interface VersionLite {
  id: string;
  number: number;
  runId: string;
  title: string;
  format: string;
  createdAt: string;
}

/** "Gần đây của tôi": phiên bản đã lưu (máy chủ) cộng các bản soạn mới trong trình duyệt, bỏ trùng theo runId. */
export function useRecent(actor: string, sso: boolean, refreshKey: unknown): RecentItem[] {
  const [versions, setVersions] = useState<VersionLite[]>([]);
  const [local, setLocal] = useState<ReturnType<typeof loadHistory>>([]);

  useEffect(() => {
    const read = () => setLocal(loadHistory());
    read();
    window.addEventListener(EVENT_HISTORY, read);
    return () => window.removeEventListener(EVENT_HISTORY, read);
  }, []);

  useEffect(() => {
    const who = actor.trim() || (sso ? 'me' : '');
    if (!who) return;
    let alive = true;
    fetch(`/api/versions?actor=${encodeURIComponent(who)}&limit=6`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j || j.ok !== true || !Array.isArray(j.versions)) return;
        setVersions(
          (j.versions as VersionLite[]).filter((v) => v && typeof v.id === 'string' && typeof v.title === 'string'),
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [actor, sso, refreshKey]);

  const seen = new Set<string>();
  const out: RecentItem[] = [];
  const sorted = [...versions].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  for (const v of sorted) {
    if (seen.has(v.runId)) continue;
    seen.add(v.runId);
    out.push({
      key: `v-${v.id}`,
      id: v.id,
      kind: 'version',
      title: v.title,
      meta: `${formatLabel(v.format) || 'Bản soạn'} · bản ${v.number} · ${formatWhen(v.createdAt)}`,
    });
  }
  for (const h of local) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    out.push({
      key: `l-${h.id}`,
      id: h.id,
      kind: 'local',
      title: h.title,
      meta: `${formatLabel(h.slots?.format) || 'Bản soạn'} · ${h.accepted ? 'đã duyệt' : 'bản nháp'} · ${formatWhen(h.at)}`,
    });
  }
  return out.slice(0, 4);
}

function QuotaChip({ usage }: { usage: UsageInfo }) {
  const { used, limit } = usage.today;
  if (!(limit > 0)) return null;
  const left = Math.max(0, limit - used);
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const state = left === 0 ? 'out' : left <= Math.max(1, Math.floor(limit * 0.2)) ? 'low' : 'ok';
  return (
    <div className={`ag-quota ${state}`} role="status" aria-label={`Hạn mức hôm nay: đã dùng ${used} trên ${limit} lượt soạn`}>
      <Icon name="clock" size={16} />
      <span>
        Hôm nay còn <strong>{left}</strong>/{limit} lượt soạn
      </span>
      <span className="ag-quota-bar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

interface HeroProps {
  me: MeInfo;
  usage: UsageInfo | null;
  recent: RecentItem[];
  onStart: (f: FormatValue) => void;
  onShowAll: () => void;
  onOpenRecent: (item: RecentItem) => void;
}

export function Hero({ me, usage, recent, onStart, onShowAll, onOpenRecent }: HeroProps) {
  const name = greetingName(me.user?.name);
  const hello = name ? `${greetingByHour()}, ${name}` : 'Chào cô/thầy';
  return (
    <div className="ag-hero ag-hero2">
      <div className="ag-hero-top">
        <div className="ag-hero-copy">
          <div className="ag-hero-badge">
            <Icon name="sparkles" size={15} />
            <span>Trợ lý soạn bài · GDPT 2018 và Công văn 5512</span>
          </div>
          <h1>
            {hello}.
            <span className="ag-h1-sub">Hôm nay mình soạn gì?</span>
          </h1>
          <p>
            Mình đối chiếu gói kiến thức chuẩn trong Kho của Trường Việt Anh, phân hoá theo lớp và mức tư duy Bloom, rồi soạn
            bản nháp để cô/thầy chỉnh và duyệt.
          </p>
          <div className="ag-hero-meta">
            {usage && <QuotaChip usage={usage} />}
            {me.user && isReviewerRole(me.user.role) && (
              <span className="ag-role-chip">
                <Icon name="shield" size={15} />
                {roleLabel(me.user.role)}
              </span>
            )}
          </div>
        </div>
        <div className="ag-hero-art">
          <HeroArt />
        </div>
      </div>

      <div className="ag-quick" role="group" aria-label="Bắt đầu nhanh">
        {QUICK.map((s) => (
          <button key={s.format} type="button" className={`ag-quick-card tone-${s.tone}`} onClick={() => onStart(s.format)}>
            <span className="ag-quick-ico">
              <Icon name={s.icon} size={22} />
            </span>
            <span className="ag-quick-txt">
              <strong>{s.title}</strong>
              <span className="ag-sub">{s.desc}</span>
            </span>
            <span className="ag-quick-go" aria-hidden="true">
              <Icon name="chevron" size={18} />
            </span>
          </button>
        ))}
      </div>

      {recent.length > 0 && (
        <section className="ag-home-recent" aria-labelledby="ag-home-recent-h">
          <h2 id="ag-home-recent-h">
            <Icon name="clock" size={17} />
            Gần đây của tôi
          </h2>
          <ul>
            {recent.map((r) => (
              <li key={r.key}>
                <button type="button" className="ag-home-recent-item" onClick={() => onOpenRecent(r)}>
                  <span className="ag-home-recent-ico" aria-hidden="true">
                    <Icon name="file" size={18} />
                  </span>
                  <span className="ag-home-recent-txt">
                    <strong>{r.title}</strong>
                    <span>{r.meta}</span>
                  </span>
                  <span className="ag-home-recent-open">Mở lại</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="ag-hero-more">
        <div className="ag-hero-more-head">
          <span>Hoặc chọn dạng khác (đủ 11 sản phẩm):</span>
          <button type="button" className="ag-link" onClick={onShowAll}>
            Xem mô tả từng sản phẩm
          </button>
        </div>
        <div className="ag-hero-chips">
          {MORE.map((item) => (
            <button key={item.format} type="button" className="ag-chip" onClick={() => onStart(item.format)}>
              <Icon name={item.icon} size={16} />
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
