'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/icons';
import {
  STEP_PROMPTS,
  answerText,
  bloomLabel,
  clearStep,
  followUpFormats,
  formatLabel,
  initialSlots,
  nextStep,
  styleLabel,
  toParams,
  type AgentSlots,
  type AskStep,
  type FormatValue,
} from '@/lib/agent/flow';
import {
  EVENT_NEW_CHAT,
  EVENT_OPEN_HISTORY,
  getHistoryItem,
  saveHistoryItem,
} from '@/lib/agent/history';
import { matchLessons, parseIntent, pickConfident, type CommandId } from '@/lib/agent/intent';
import { formatApiError, type BloomStart } from '@/lib/ui/soanBai';
import type { WorkflowResult } from '@/lib/workflows/types';
import { Shell } from '../Shell';
import { Canvas } from './Canvas';
import { BloomChoices, ConfirmCard, FormatChoices, LessonPicker, RunCard, StyleChoices } from './Cards';
import { subjectLabel, type AtomLite, type Msg, type ResultEntry, type RunState } from './types';

type Standard = 'approved' | 'chua_duyet' | 'khong_co';

const SUGGESTIONS: { format: FormatValue; icon: IconName; title: string; desc: string }[] = [
  { format: 'ke_hoach', icon: 'book', title: 'Soạn kế hoạch bài dạy', desc: 'Theo Công văn 5512, nâng cấp từ bản chuẩn của Kho' },
  { format: 'quiz', icon: 'quiz', title: 'Tạo quiz củng cố', desc: 'Câu hỏi thật theo bậc tư duy, dùng ngay trong tiết' },
  { format: 'de_kiem_tra', icon: 'exam', title: 'Soạn đề kiểm tra', desc: 'Có ma trận Thông tư 22, cần tổ chuyên môn duyệt' },
  { format: 'slide', icon: 'slides', title: 'Soạn slide bài giảng', desc: 'Dàn ý trình chiếu từ gói kiến thức của bài' },
];

const COMMAND_LINKS: Partial<Record<CommandId, { href: string; label: string; desc: string }>> = {
  duyet: { href: '/duyet', label: 'Duyệt bản chuẩn', desc: 'Chấm 6 tiêu chí để đưa bài vào Kho' },
  chat_luong: { href: '/chat-luong', label: 'Chất lượng & Tín hiệu', desc: 'Tỷ lệ sinh lại, mức chỉnh sửa, chấm mù' },
  cong_cu: { href: '/cong-cu', label: 'Kho 82 công cụ', desc: 'Các công cụ soạn học liệu riêng lẻ' },
  thu_vien: { href: '/thu-vien', label: 'Thư viện học liệu', desc: 'Học liệu đã lưu và nhật ký hoạt động' },
  lop: { href: '/ho-so-lop-hoc', label: 'Lớp học & chương trình', desc: 'Hồ sơ lớp và ghi chú chủ nhiệm' },
  bieu_mau: { href: '/soan-bai', label: 'Soạn bài bằng biểu mẫu', desc: 'Điền đủ 7 mục trong một màn hình' },
};

export function AgentApp() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [slots, setSlots] = useState<AgentSlots>(() => initialSlots());
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [results, setResults] = useState<Record<string, ResultEntry>>({});
  const [canvasId, setCanvasId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<AtomLite[]>([]);
  const [standard, setStandard] = useState<Record<string, Standard>>({});

  const idRef = useRef(0);
  const nid = () => `m${++idRef.current}`;
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const abortRef = useRef<AbortController | null>(null);
  const lessonCache = useRef<Record<string, AtomLite[]>>({});
  const threadRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const busy = Object.values(runs).some((r) => r.status === 'running');
  const canvasEntry = canvasId ? results[canvasId] : undefined;
  const hasResults = Object.keys(results).length > 0;

  /* ---------- tiện ích hội thoại ---------- */
  const push = useCallback((...m: Msg[]) => setMsgs((p) => [...p, ...m]), []);
  const say = useCallback(
    (t: string) => setMsgs((p) => [...p, { id: `m${++idRef.current}`, role: 'agent', kind: 'text', text: t }]),
    [],
  );
  const userSay = useCallback(
    (t: string) => setMsgs((p) => [...p, { id: `m${++idRef.current}`, role: 'user', text: t }]),
    [],
  );

  const fetchStandard = useCallback((atomId: string) => {
    fetch(`/api/kho/standard?atomId=${encodeURIComponent(atomId)}`)
      .then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; lesson?: { status?: Standard } };
        if (res.ok && j.ok && j.lesson?.status) setStandard((p) => ({ ...p, [atomId]: j.lesson!.status! }));
      })
      .catch(() => undefined);
  }, []);

  /** Hỏi bước còn thiếu tiếp theo (hoặc xác nhận). Không hỏi lặp cùng một bước liên tiếp. */
  const advance = useCallback(
    (s: AgentSlots) => {
      const step = nextStep(s);
      if (step === 'confirm' && s.baiDayId) fetchStandard(s.baiDayId);
      setMsgs((p) => {
        const last = p[p.length - 1];
        if (step === 'confirm') {
          if (last && last.role === 'agent' && last.kind === 'confirm') return p;
          return [...p, { id: `m${++idRef.current}`, role: 'agent', kind: 'confirm' }];
        }
        if (last && last.role === 'agent' && last.kind === 'ask' && last.step === step) return p;
        return [...p, { id: `m${++idRef.current}`, role: 'agent', kind: 'ask', step }];
      });
    },
    [fetchStandard],
  );

  const apply = useCallback((patch: Partial<AgentSlots>): AgentSlots => {
    const next = { ...slotsRef.current, ...patch };
    slotsRef.current = next;
    setSlots(next);
    return next;
  }, []);

  /* ---------- trả lời các thẻ ---------- */
  const pickFormat = (v: FormatValue) => {
    const next = apply({ format: v });
    userSay(answerText('format', next));
    advance(next);
  };
  const pickLesson = (a: AtomLite) => {
    setSuggestions([]);
    const next = apply({ baiDayId: a.id, baiTitle: a.title });
    userSay(answerText('bai', next));
    advance(next);
  };
  const pickBloom = (v: BloomStart) => {
    const next = apply({ bloom: v });
    userSay(answerText('bloom', next));
    advance(next);
  };
  const pickStyle = (v: AgentSlots['phongCach']) => {
    const next = apply({ phongCach: v });
    userSay(answerText('phongCach', next));
    advance(next);
  };
  const editStep = (step: AskStep) => {
    const next = clearStep(slotsRef.current, step);
    slotsRef.current = next;
    setSlots(next);
    const label =
      step === 'format' ? 'sản phẩm' : step === 'bai' ? 'bài dạy' : step === 'bloom' ? 'mức tư duy' : 'phong cách';
    userSay(`Đổi ${label}`);
    advance(next);
  };

  /* ---------- chạy quy trình ---------- */
  const startRun = useCallback(
    async (s: AgentSlots, opts: { regenerationOf?: string } = {}) => {
      const built = toParams(s, { regenerationOf: opts.regenerationOf });
      if (!built.ok) {
        say(`Mình còn thiếu thông tin nên chưa soạn được (${built.error}). Cô/thầy kiểm tra lại giúp mình nhé.`);
        return;
      }
      const runKey = `r${Date.now()}`;
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setRuns((r) => ({ ...r, [runKey]: { status: 'running', startedAt: Date.now(), hasNews: Boolean(s.suKien) } }));
      push({ id: nid(), role: 'agent', kind: 'run', runKey });

      const fail = (error: string, details?: string[]) =>
        setRuns((r) => ({ ...r, [runKey]: { ...r[runKey], status: 'error', error, details } }));

      try {
        const res = await fetch('/api/workflows/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ params: built.params }),
          signal: ctrl.signal,
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          reasons?: string[];
          result?: WorkflowResult;
        };
        if (!res.ok || !j.ok || !j.result) {
          if (res.status === 422) fail(j.error || 'Sự kiện thời sự không đạt kiểm tra an toàn.', j.reasons);
          else fail(formatApiError(res.status, j.error));
          return;
        }
        const result = j.result;
        const title = `${formatLabel(s.format)}: ${s.baiTitle ?? result.standard.title ?? ''}`.trim();
        const original = (result.content.sections.length
          ? result.content.sections.map((x) => (x.heading ? `${x.heading}\n${x.body}` : x.body)).join('\n\n').trim()
          : result.content.markdown) as string;
        const entry: ResultEntry = {
          id: result.runId,
          title,
          at: new Date().toISOString(),
          slots: { ...s },
          result,
          text: original,
        };
        setResults((r) => ({ ...r, [entry.id]: entry }));
        setRuns((r) => ({ ...r, [runKey]: { ...r[runKey], status: 'done', resultId: entry.id } }));
        setCanvasId(entry.id);
        saveHistoryItem({ id: entry.id, title, at: entry.at, slots: entry.slots, result, text: original });

        const approved = result.standard.status === 'approved';
        say(
          `Mình đã soạn xong ${formatLabel(s.format).toLowerCase()} cho bài “${s.baiTitle ?? ''}”. ` +
            (approved
              ? 'Mình nâng cấp từ bản chuẩn đã duyệt của Kho.'
              : 'Bài này chưa có bản chuẩn đã duyệt nên đây mới là bản nháp, cần người duyệt trước khi dùng.') +
            ' Cô/thầy xem ở khung bên phải, chỉnh nếu cần rồi bấm “Duyệt & dùng”.',
        );
        push({ id: nid(), role: 'agent', kind: 'followups', resultId: entry.id });
      } catch (e) {
        if (ctrl.signal.aborted) fail('Đã dừng theo yêu cầu của cô/thầy.');
        else fail('Không kết nối được máy chủ. Cô/thầy kiểm tra mạng rồi thử lại.');
        void e;
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    },
    [push, say],
  );

  const startFromConfirm = (news: AgentSlots['suKien']) => {
    const next = apply({ suKien: news });
    userSay('Bắt đầu soạn');
    void startRun(next);
  };

  const cancelRun = () => abortRef.current?.abort();

  const regenerate = (entry: ResultEntry) => {
    if (busy) return;
    userSay('Sinh lại bản này');
    say('Mình soạn lại ngay. Lần này mình ghi nhận đây là một lần sinh lại.');
    void startRun(entry.slots, { regenerationOf: entry.id });
  };

  const accept = async (entry: ResultEntry) => {
    let diffRatio: number | undefined;
    try {
      const res = await fetch('/api/signals/final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: entry.id, finalText: entry.text, accepted: true }),
      });
      const j = (await res.json().catch(() => ({}))) as { diffRatio?: number };
      if (res.ok && typeof j.diffRatio === 'number') diffRatio = j.diffRatio;
    } catch {
      /* ghi tín hiệu là phụ, không chặn giáo viên */
    }
    setResults((r) => ({ ...r, [entry.id]: { ...r[entry.id], accepted: true, diffRatio } }));
    saveHistoryItem({
      id: entry.id,
      title: entry.title,
      at: entry.at,
      slots: entry.slots,
      result: entry.result,
      text: entry.text,
      accepted: true,
    });
  };

  const setEntryText = (id: string, t: string) =>
    setResults((r) => (r[id] ? { ...r, [id]: { ...r[id], text: t, accepted: false, diffRatio: undefined } } : r));

  /* ---------- bắt đầu / làm lại ---------- */
  const resetChat = useCallback(() => {
    abortRef.current?.abort();
    setMsgs([]);
    setRuns({});
    setCanvasId(null);
    setSuggestions([]);
    const base = initialSlots();
    const keep = { ...base, subject: slotsRef.current.subject, grade: slotsRef.current.grade };
    slotsRef.current = keep;
    setSlots(keep);
  }, []);

  const startWithFormat = (format: FormatValue) => {
    const next = apply({ format });
    userSay(formatLabel(format));
    say(`Được ạ. Mình sẽ hỏi vài điều ngắn để soạn đúng ${formatLabel(format).toLowerCase()}.`);
    advance(next);
  };

  const followUp = (format: FormatValue) => {
    if (busy) return;
    const next = apply({ format });
    userSay(`Làm thêm: ${formatLabel(format)}`);
    say('Mình giữ nguyên bài và các lựa chọn trước đó.');
    advance(next);
  };

  const anotherLesson = () => {
    if (busy) return;
    const base = slotsRef.current;
    const next: AgentSlots = {
      ...initialSlots(),
      subject: base.subject,
      grade: base.grade,
      ngonNgu: base.ngonNgu,
    };
    slotsRef.current = next;
    setSlots(next);
    userSay('Soạn bài khác');
    say('Mình sẵn sàng. Cô/thầy muốn soạn gì tiếp?');
    advance(next);
  };

  const openHistory = useCallback(
    (id: string) => {
      const item = getHistoryItem(id);
      if (!item) return;
      setResults((r) => ({
        ...r,
        [id]: { id, title: item.title, at: item.at, slots: item.slots, result: item.result, text: item.text, accepted: item.accepted },
      }));
      setCanvasId(id);
      setMsgs((p) =>
        p.length > 0
          ? p
          : [{ id: `m${++idRef.current}`, role: 'agent', kind: 'text', text: `Mình đã mở lại bản soạn “${item.title}”. Cô/thầy xem ở khung bên phải.` }],
      );
    },
    [],
  );

  /* ---------- câu gõ tự do (luật từ khoá, không lập kế hoạch tự do) ---------- */
  const ensureLessons = async (subject: string, grade: string): Promise<AtomLite[]> => {
    const key = `${subject}-${grade}`;
    if (lessonCache.current[key]) return lessonCache.current[key];
    try {
      const res = await fetch(`/api/supabase/knowledge?subject=${subject}&grade=${grade}&limit=200`);
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; atoms?: AtomLite[] };
      const list = res.ok && j.ok ? (j.atoms ?? []) : [];
      lessonCache.current[key] = list;
      return list;
    } catch {
      return [];
    }
  };

  const handleSend = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setText('');
    if (taRef.current) taRef.current.style.height = 'auto';
    userSay(value);

    const intent = parseIntent(value);
    if (intent.command) {
      if (intent.command === 'reset') {
        resetChat();
        return;
      }
      const link = COMMAND_LINKS[intent.command];
      if (link) {
        say('Cô/thầy mở trang này nhé:');
        push({ id: nid(), role: 'agent', kind: 'links', links: [link] });
      }
      return;
    }

    const patch: Partial<AgentSlots> = {};
    const noted: string[] = [];
    if (intent.format) {
      patch.format = intent.format;
      noted.push(formatLabel(intent.format).toLowerCase());
    }
    if (intent.bloom) {
      patch.bloom = intent.bloom;
      noted.push(`mức ${bloomLabel(intent.bloom)}`);
    }
    if (intent.phongCach) {
      patch.phongCach = intent.phongCach;
      noted.push(`phong cách ${styleLabel(intent.phongCach).toLowerCase()}`);
    }
    if (intent.ngonNgu) patch.ngonNgu = intent.ngonNgu;
    let next = apply(patch);

    if (!next.baiDayId && intent.lessonQuery) {
      const list = await ensureLessons(next.subject, next.grade);
      const matches = matchLessons(intent.lessonQuery, list);
      const sure = pickConfident(matches);
      if (sure) {
        next = apply({ baiDayId: sure.id, baiTitle: sure.title });
        noted.push(`bài “${sure.title}”`);
        setSuggestions([]);
      } else if (matches.length > 0) {
        setSuggestions(matches.map((m) => m.lesson));
        say(`Mình thấy vài bài gần với “${intent.lessonQuery}”. Cô/thầy chọn giúp mình bài đúng nhé.`);
      } else {
        setSuggestions([]);
        say(`Mình chưa tìm thấy bài nào khớp với “${intent.lessonQuery}” trong ${subjectLabel(next.subject)} lớp ${next.grade}. Cô/thầy thử gõ tên bài ở ô tìm bên dưới.`);
      }
    }

    if (noted.length === 0 && !intent.lessonQuery) {
      say('Mình chưa hiểu ý. Cô/thầy chọn một lựa chọn bên dưới, hoặc gõ ví dụ: “soạn kế hoạch bài dạy bài mệnh đề logic”.');
    } else if (noted.length > 0) {
      say(`Mình ghi nhận: ${noted.join(', ')}.`);
    }
    advance(next);
  };

  const runCommandLink = (href: string) => href;

  /* ---------- hiệu ứng ---------- */
  useEffect(() => {
    // Cuộn sau khi bố cục ổn định: thẻ xác nhận còn dài thêm khi tải trạng thái bản chuẩn.
    const id = requestAnimationFrame(() => {
      const el = threadRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight });
    });
    return () => cancelAnimationFrame(id);
  }, [msgs, runs, standard, suggestions]);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const h = q.get('h');
      const fresh = q.get('new');
      const fmt = q.get('format') as FormatValue | null;
      if (h) openHistory(h);
      else if (fmt && ['ke_hoach', 'slide', 'worksheet', 'quiz', 'de_kiem_tra', 'audio', 'video', 'tai_nguyen_6_dang'].includes(fmt)) {
        const next = apply({ format: fmt });
        userSay(formatLabel(fmt));
        advance(next);
      } else if (fresh) resetChat();
      if (h || fresh || fmt) window.history.replaceState(null, '', '/');
    } catch {
      /* bỏ qua */
    }
    const onNew = () => resetChat();
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) openHistory(id);
    };
    window.addEventListener(EVENT_NEW_CHAT, onNew);
    window.addEventListener(EVENT_OPEN_HISTORY, onOpen);
    return () => {
      window.removeEventListener(EVENT_NEW_CHAT, onNew);
      window.removeEventListener(EVENT_OPEN_HISTORY, onOpen);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canvasEntry) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && window.matchMedia('(max-width: 900px)').matches) setCanvasId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [canvasEntry]);

  /* ---------- hiển thị ---------- */
  const lastId = msgs.length ? msgs[msgs.length - 1].id : '';

  const renderAgent = (m: Exclude<Msg, { role: 'user' }>) => {
    const active = m.id === lastId && !busy;
    switch (m.kind) {
      case 'text':
        return <p className="ag-text">{m.text}</p>;
      case 'ask':
        return (
          <>
            <p className="ag-text">{STEP_PROMPTS[m.step]}</p>
            {active && m.step === 'format' && <FormatChoices onPick={pickFormat} />}
            {active && m.step === 'bai' && (
              <LessonPicker
                subject={slots.subject}
                grade={slots.grade}
                onSubject={(v) => apply({ subject: v })}
                onGrade={(v) => apply({ grade: v })}
                suggestions={suggestions}
                onPick={pickLesson}
              />
            )}
            {active && m.step === 'bloom' && <BloomChoices onPick={pickBloom} />}
            {active && m.step === 'phongCach' && <StyleChoices onPick={pickStyle} />}
          </>
        );
      case 'confirm':
        return (
          <>
            <p className="ag-text">Mình đã đủ thông tin. Cô/thầy kiểm tra lại giúp mình nhé.</p>
            {active && (
              <ConfirmCard
                slots={slots}
                standardStatus={slots.baiDayId ? standard[slots.baiDayId] : undefined}
                onEdit={editStep}
                onChange={(patch) => apply(patch)}
                onStart={startFromConfirm}
              />
            )}
          </>
        );
      case 'run': {
        const run = runs[m.runKey];
        if (!run) return null;
        return (
          <RunCard
            run={run}
            entry={run.resultId ? results[run.resultId] : undefined}
            onCancel={cancelRun}
            onOpen={(id) => setCanvasId(id)}
          />
        );
      }
      case 'links':
        return (
          <div className="ag-card">
            {m.links.map((l) => (
              <Link key={l.href} href={runCommandLink(l.href)} className="ag-suggest-card" style={{ border: 0, padding: 0 }}>
                <span className="ag-suggest-ico">
                  <Icon name="chevron" />
                </span>
                <span>
                  <strong>{l.label}</strong>
                  <span className="ag-sub">{l.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        );
      case 'followups': {
        const entry = results[m.resultId];
        return (
          <>
            {active && entry && (
              <div className="ag-chips" role="group" aria-label="Gợi ý tiếp theo">
                {followUpFormats(entry.slots.format).map((f) => (
                  <button key={f.value} type="button" className="ag-chip" onClick={() => followUp(f.value)}>
                    <Icon name="plus" size={16} />
                    {f.label} cho bài này
                  </button>
                ))}
                <button type="button" className="ag-chip" onClick={anotherLesson}>
                  <Icon name="refresh" size={16} />
                  Soạn bài khác
                </button>
              </div>
            )}
          </>
        );
      }
    }
  };

  return (
    <Shell variant="chat">
      <div className={`ag-agent${canvasEntry ? ' has-canvas' : ''}`}>
        <section className="ag-chat" aria-label="Trò chuyện với trợ lý">
          <div className="ag-chat-top">
            <span className="ag-chat-top-title">
              {subjectLabel(slots.subject)} · Lớp {slots.grade}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {hasResults && !canvasEntry && (
                <button
                  type="button"
                  className="ag-btn small"
                  onClick={() => setCanvasId(Object.keys(results)[Object.keys(results).length - 1])}
                >
                  <Icon name="panel" size={16} />
                  Mở bản soạn
                </button>
              )}
              <Link href="/soan-bai" className="ag-btn small ghost">
                <Icon name="clipboard" size={16} />
                Dùng biểu mẫu
              </Link>
            </div>
          </div>

          <div className="ag-thread" ref={threadRef}>
            {msgs.length === 0 ? (
              <div className="ag-hero">
                <h1>Chào cô/thầy, hôm nay mình soạn gì?</h1>
                <p>
                  Mình lấy bản chuẩn đã duyệt trong Kho của trường, rồi chỉnh theo lớp, mức tư duy và phong cách dạy của cô/thầy.
                  Mình hỏi bằng các lựa chọn cố định để kết quả luôn đúng chuẩn.
                </p>
                <div className="ag-suggest">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.format} type="button" className="ag-suggest-card" onClick={() => startWithFormat(s.format)}>
                      <span className="ag-suggest-ico">
                        <Icon name={s.icon} />
                      </span>
                      <span>
                        <strong>{s.title}</strong>
                        <span className="ag-sub">{s.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="ag-thread-inner" aria-live="polite">
                {msgs.map((m) =>
                  m.role === 'user' ? (
                    <div className="ag-msg user" key={m.id}>
                      <div className="ag-bubble">{m.text}</div>
                    </div>
                  ) : (
                    <div className="ag-msg" key={m.id}>
                      <div className="ag-avatar" aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo-crest.webp" alt="" />
                      </div>
                      <div className="ag-body">{renderAgent(m)}</div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          <div className="ag-composer-wrap">
            <form
              className="ag-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
            >
              <label htmlFor="ag-input" className="sr-only" style={{ position: 'absolute', left: -9999 }}>
                Nhắn cho trợ lý
              </label>
              <textarea
                id="ag-input"
                ref={taRef}
                rows={1}
                value={text}
                disabled={busy}
                placeholder={busy ? 'Mình đang soạn, cô/thầy đợi một chút nhé…' : 'Nhắn cho trợ lý…'}
                onChange={(e) => {
                  setText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <button type="submit" className="ag-send" aria-label="Gửi" disabled={busy || !text.trim()}>
                <Icon name="send" />
              </button>
            </form>
            <p className="ag-composer-hint">Ví dụ: “soạn kế hoạch bài dạy bài mệnh đề logic”. Nội dung do AI soạn, cô/thầy cần đọc lại trước khi dạy.</p>
          </div>
        </section>

        {canvasEntry && (
          <Canvas
            entry={canvasEntry}
            busy={busy}
            onClose={() => setCanvasId(null)}
            onText={(t) => setEntryText(canvasEntry.id, t)}
            onRegenerate={() => regenerate(canvasEntry)}
            onAccept={() => accept(canvasEntry)}
          />
        )}
      </div>
    </Shell>
  );
}
