'use client';

import { useEffect, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/icons';
import { formatLabel, type AgentSlots, type FormatValue } from '@/lib/agent/flow';
import { EVENT_HISTORY, formatWhen, loadHistory } from '@/lib/agent/history';
import { QUICK_QUESTIONS } from '@/lib/agent/nlu';
import { dailyTip, greetingByHour, greetingName, isReviewerRole, roleLabel, todayLabel, type MeInfo } from '@/lib/agent/prefs';
import type { ClassProfile } from '@/lib/types';
import { HeroArt } from './HeroArt';
import type { UsageInfo } from './useMe';

export { HeroArt } from './HeroArt';

const QUICK: { format: FormatValue; icon: IconName; title: string; desc: string; tone: string }[] = [
  { format: 'bo_tiet_day', icon: 'sparkles', title: 'Bộ tiết dạy', desc: 'Kế hoạch bài dạy, slide, phiếu học tập và quiz của một bài, chỉ một lần bấm', tone: 'gold' },
  { format: 'ke_hoach', icon: 'book', title: 'Kế hoạch bài dạy', desc: 'Theo Công văn 5512, dựa trên gói kiến thức của Kho', tone: 'navy' },
  { format: 'slide', icon: 'slides', title: 'Slide bài giảng', desc: 'Bộ slide tải ngay về PowerPoint (.pptx)', tone: 'navy' },
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

export interface RecentItem {
  key: string;
  title: string;
  meta: string;
  kind: 'version' | 'local';
  id: string;
  /** Có với bản lưu trong trình duyệt: dùng cho "Soạn lại như lần trước". */
  slots?: AgentSlots;
  /** Bản nháp chưa duyệt, đang làm dở. */
  inProgress?: boolean;
}

interface VersionLite {
  id: string;
  number: number;
  runId: string;
  title: string;
  format: string;
  createdAt: string;
}

/** "Gần đây của tôi": bản soạn trong trình duyệt (có đủ lựa chọn để soạn lại) cộng phiên bản đã lưu trên máy chủ, bỏ trùng theo runId. */
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
  for (const h of local) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    out.push({
      key: `l-${h.id}`,
      id: h.id,
      kind: 'local',
      title: h.title,
      slots: h.slots,
      inProgress: !h.accepted,
      meta: `${formatLabel(h.slots?.format) || 'Bản soạn'} · ${h.accepted ? 'đã duyệt' : 'bản nháp'} · ${formatWhen(h.at)}`,
    });
  }
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
  /** Lớp của tôi (theo email giáo viên chủ nhiệm hoặc lớp đã dùng gần đây). */
  myClasses: ClassProfile[];
  /** Mọi lớp chọn được khi chưa có "lớp của tôi". */
  pickableClasses: ClassProfile[];
  onStart: (f: FormatValue) => void;
  onShowAll: () => void;
  onOpenRecent: (item: RecentItem) => void;
  onRedo: (item: RecentItem) => void;
  onRedoOtherClass: (item: RecentItem) => void;
  onPlanForClass: (c: ClassProfile) => void;
  onQuickAsk: (question: string) => void;
}

export function Hero({
  me,
  usage,
  recent,
  myClasses,
  pickableClasses,
  onStart,
  onShowAll,
  onOpenRecent,
  onRedo,
  onRedoOtherClass,
  onPlanForClass,
  onQuickAsk,
}: HeroProps) {
  const name = greetingName(me.user?.name);
  const hello = name ? `${greetingByHour()}, ${name}` : 'Chào cô/thầy';
  const [pickClass, setPickClass] = useState('');
  const [today, setToday] = useState('');
  const [tip, setTip] = useState('');
  useEffect(() => {
    // Tính trên trình duyệt để ngày và mẹo đúng theo ngày của cô/thầy (không lệch giữa máy chủ và trình duyệt).
    setToday(todayLabel());
    setTip(dailyTip());
  }, []);
  const todayFirst = recent.length > 0 || myClasses.length > 0;
  const todaySection = (
      <section className="ag-today" aria-labelledby="ag-today-h">
        <div className="ag-today-head">
          <h2 id="ag-today-h">Hôm nay</h2>
          {today && <span className="ag-today-date">{today}</span>}
        </div>
        <div className="ag-today-grid">
          <div className="ag-today-card">
            <h3>
              <Icon name="users" size={17} />
              Lớp của tôi
            </h3>
            {myClasses.length > 0 ? (
              <ul className="ag-today-list">
                {myClasses.map((c) => (
                  <li key={c.id} className="ag-today-row">
                    <span className="ag-today-row-txt">
                      <strong>Lớp {c.className}</strong>
                      <span>
                        {c.studentCount} học sinh · {c.campus}
                      </span>
                    </span>
                    <button type="button" className="ag-btn small" onClick={() => onPlanForClass(c)}>
                      <Icon name="sparkles" size={16} />
                      Soạn bài tiếp theo
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="ag-today-empty">
                <p>Chưa có lớp nào gắn với tài khoản của cô/thầy. Chọn lớp đang dạy để mình soạn sát đặc điểm của lớp.</p>
                <div className="ag-today-pick">
                  <label htmlFor="ag-today-class" className="ag-today-sr">
                    Chọn lớp đang dạy
                  </label>
                  <select id="ag-today-class" className="ag-field" value={pickClass} onChange={(e) => setPickClass(e.target.value)}>
                    <option value="">Chọn lớp đang dạy</option>
                    {pickableClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        Lớp {c.className} · {c.campus}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="ag-btn small"
                    disabled={!pickClass}
                    onClick={() => {
                      const c = pickableClasses.find((x) => x.id === pickClass);
                      if (c) onPlanForClass(c);
                    }}
                  >
                    Soạn bài cho lớp này
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="ag-today-card">
            <h3>
              <Icon name="clock" size={17} />
              Gần đây của tôi
            </h3>
            {recent.length === 0 ? (
              <p className="ag-today-muted">
                Chưa có bản soạn nào. Bản soạn đầu tiên sẽ hiện ở đây ngay khi xong, kể cả khi cô/thầy chưa duyệt.
              </p>
            ) : (
              <ul className="ag-today-list">
                {recent.map((r) => (
                  <li key={r.key} className="ag-today-item">
                    <button type="button" className="ag-home-recent-item" onClick={() => onOpenRecent(r)}>
                      <span className="ag-home-recent-ico" aria-hidden="true">
                        <Icon name="file" size={18} />
                      </span>
                      <span className="ag-home-recent-txt">
                        <strong>{r.title}</strong>
                        <span>{r.meta}</span>
                      </span>
                      <span className="ag-home-recent-open">{r.inProgress ? 'Tiếp tục' : 'Mở lại'}</span>
                    </button>
                    {r.slots && (
                      <div className="ag-today-acts">
                        <button type="button" className="ag-btn small" onClick={() => onRedo(r)}>
                          <Icon name="refresh" size={15} />
                          Soạn lại như lần trước
                        </button>
                        <button type="button" className="ag-btn small" onClick={() => onRedoOtherClass(r)}>
                          <Icon name="users" size={15} />
                          Soạn lại cho lớp khác
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {tip && (
          <p className="ag-today-tip">
            <Icon name="info" size={16} />
            <span>
              <strong>Mẹo hôm nay:</strong> {tip}
            </span>
          </p>
        )}
      </section>
  );
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
            Gõ một câu như “soạn kế hoạch bài dạy định lí Pythagore lớp 7A2, 2 tiết”, hỏi chuyên môn, hoặc bấm một thẻ bên dưới.
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

      {todayFirst && todaySection}

      <div className="ag-quick" role="group" aria-label="Bắt đầu nhanh">
        {QUICK.map((s, i) => (
          <button
            key={s.format}
            type="button"
            className={`ag-quick-card tone-${s.tone}${i === 0 ? ' ag-quick-featured' : ''}`}
            onClick={() => onStart(s.format)}
          >
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

      {!todayFirst && todaySection}

      <section className="ag-today-ask" aria-labelledby="ag-today-ask-h">
        <h2 id="ag-today-ask-h">Hỏi nhanh</h2>
        <div className="ag-today-asks">
          {QUICK_QUESTIONS.map((q) => (
            <button key={q.title} type="button" className="ag-today-askbtn" onClick={() => onQuickAsk(q.question)}>
              <Icon name={q.icon} size={18} />
              <span>{q.title}</span>
            </button>
          ))}
        </div>
      </section>

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
