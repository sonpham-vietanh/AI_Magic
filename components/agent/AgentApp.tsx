'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import {
  FORMAT_ITEMS,
  STEP_PROMPTS,
  answerText,
  clearStep,
  followUpFormats,
  formatLabel,
  initialSlots,
  nextStep,
  styleLabel,
  todayISO,
  toParams,
  type AgentSlots,
  type AskStep,
  type FormatValue,
} from '@/lib/agent/flow';
import {
  EVENT_NEW_CHAT,
  EVENT_OPEN_HISTORY,
  getHistoryItem,
  loadHistory,
  saveHistoryItem,
  updateHistoryText,
} from '@/lib/agent/history';
import { parseIntent, type CommandId, type Intent } from '@/lib/agent/intent';
import { buildUnderstanding, classifyMessage, isSmallTalk, REFINE_SUGGESTIONS } from '@/lib/agent/nlu';
import {
  firstLesson,
  loadLessonList,
  nextLessonAfter,
  searchLessons,
  type FoundLesson,
  type LessonSearchResult,
} from '@/lib/agent/lessonSearch';
import { callAssistant, callRefine, failureMessage, NETWORK_CHAT_MESSAGE, type ApiFailure } from '@/lib/agent/chatApi';
import { applyLast, clearPending, loadLastChoice, loadPending, saveLastChoice, savePending } from '@/lib/agent/memory';
import { buildPartialResult, canKeepPartial } from '@/lib/agent/partial';
import { looksLikeJson, parseSseChunk } from '@/lib/agent/sse';
import { textToSections } from '@/lib/ui/soanBai';
import { cleanPedagogicalText } from '@/lib/text/clean';
import { acceptResult, loadVersion, saveDraftVersion } from '@/lib/agent/accept';
import { getArtifacts, resultText, type AgentResult } from '@/lib/agent/result';
import { CLASS_PROFILES, getClassById } from '@/lib/classes';
import type { ClassProfile } from '@/lib/types';
import { applyPrefs } from '@/lib/agent/prefs';
import { Shell } from '../Shell';
import '../../app/ui-agent.css';
import { Hero, useRecent, type RecentItem } from './Hero';
import { useMe, useUsage } from './useMe';
import { Canvas, LiveCanvas } from './Canvas';
import { BloomChoices, ConfirmCard, FormatChoices, LessonPicker, ResourceChoices, RunCard, StyleChoices } from './Cards';
import { AnswerCard, ClassPickCard, CrossCard, ModeCard, RefineCard, ResumeCard, UnderstoodCard } from './ChatCards';
import { TeacherName, useActor } from './TeacherName';
import {
  GRADE_OPTIONS,
  SUBJECT_OPTIONS,
  subjectLabel,
  type AnswerState,
  type AtomLite,
  type Msg,
  type RefineState,
  type ResultEntry,
  type RunState,
} from './types';

type Standard = 'approved' | 'chua_duyet' | 'khong_co';

const FORMAT_VALUES: string[] = [...FORMAT_ITEMS.map((f) => f.value), 'bo_tiet_day'];

const COMMAND_LINKS: Partial<Record<CommandId, { href: string; label: string; desc: string }>> = {
  duyet: { href: '/duyet', label: 'Duyệt bản chuẩn', desc: 'Chấm 6 tiêu chí để đưa bài vào Kho' },
  chat_luong: { href: '/chat-luong', label: 'Chất lượng bài soạn', desc: 'Tỷ lệ sinh lại, mức chỉnh sửa, chấm mù' },
  cong_cu: { href: '/cong-cu', label: 'Kho 82 công cụ', desc: 'Các công cụ soạn học liệu riêng lẻ' },
  thu_vien: { href: '/thu-vien', label: 'Học liệu đã lưu', desc: 'Học liệu đã lưu và nhật ký hoạt động' },
  lop: { href: '/ho-so-lop-hoc', label: 'Lớp học & chương trình', desc: 'Hồ sơ lớp và ghi chú chủ nhiệm' },
  bieu_mau: { href: '/soan-bai', label: 'Soạn bài bằng biểu mẫu', desc: 'Điền đủ 7 mục trong một màn hình' },
};

const isGrade = (g: string) => GRADE_OPTIONS.includes(g);
const PICKABLE_CLASSES: ClassProfile[] = CLASS_PROFILES.filter((c) => isGrade(c.grade));

const toAtom = (l: FoundLesson): AtomLite => ({
  id: l.id,
  code: l.code,
  title: l.title,
  hasFactoryPackage: l.hasFactoryPackage,
});

/** Lựa chọn khởi đầu: mặc định của tài khoản, rồi lựa chọn lần trước (môn, khối, lớp, phong cách, mức tư duy). */
function freshSlots(prefs: Parameters<typeof applyPrefs>[1], keep?: Pick<AgentSlots, 'subject' | 'grade'>): AgentSlots {
  const base: AgentSlots = keep ? { ...initialSlots(), subject: keep.subject, grade: keep.grade } : initialSlots();
  return applyLast(applyPrefs(base, prefs, { keepSubjectGrade: Boolean(keep) }), loadLastChoice(), { keepSubjectGrade: Boolean(keep) });
}

/** Thông điệp sau khi soạn xong: nói thật về bản nháp. Chỉ đề kiểm tra và thời sự mới bị khoá. */
function doneMessage(result: AgentResult, s: AgentSlots): string {
  const what = formatLabel(s.format).toLowerCase();
  const head = `Mình đã soạn xong ${what} cho bài “${s.baiTitle ?? ''}”.`;
  if (result.blockAcceptDownload) {
    return `${head} Nội dung này (đề kiểm tra hoặc có gắn thời sự) bắt buộc người duyệt xác nhận trước khi dùng hoặc tải về. Cô/thầy xem ở khung bên phải và gửi duyệt.`;
  }
  const approved = result.standard.status === 'approved' && result.draft !== true;
  if (approved) return `${head} Mình nâng cấp từ bản chuẩn đã duyệt của Kho. Cô/thầy xem ở khung bên phải, chỉnh nếu cần rồi tải về.`;
  return `${head} Đây là bản nháp, chưa duyệt: cô/thầy vẫn dùng và tải về được, file tải về có dấu “BẢN NHÁP”. Cô/thầy có thể nói thẳng điều cần chỉnh, ví dụ “rút còn 35 phút”.`;
}

export function AgentApp() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [slots, setSlots] = useState<AgentSlots>(() => initialSlots());
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [results, setResults] = useState<Record<string, ResultEntry>>({});
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [refines, setRefines] = useState<Record<string, RefineState>>({});
  const [auxBusy, setAuxBusy] = useState(0);
  const [canvasId, setCanvasId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<AtomLite[]>([]);
  const [standard, setStandard] = useState<Record<string, Standard>>({});
  const [now, setNow] = useState(() => Date.now());
  const [actor, saveActor, actorReady] = useActor();
  const [me, meReady] = useMe();
  const prefsRef = useRef(me.prefs);
  prefsRef.current = me.prefs;
  const prefsApplied = useRef(false);
  const actorRef = useRef(actor);
  actorRef.current = actor;

  const idRef = useRef(0);
  const nid = () => `m${++idRef.current}`;
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const canvasIdRef = useRef(canvasId);
  canvasIdRef.current = canvasId;
  const lastResultRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const auxAbortRef = useRef<AbortController | null>(null);
  const lessonCache = useRef<Record<string, FoundLesson[]>>({});
  const threadRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const usage = useUsage(Object.keys(results).length + auxBusy);
  const recent = useRecent(actor, me.ssoEnabled && Boolean(me.user), Object.keys(results).length);
  const busy = Object.values(runs).some((r) => r.status === 'running');
  const working = busy || auxBusy > 0;
  const canvasEntry = canvasId ? results[canvasId] : undefined;
  const hasResults = Object.keys(results).length > 0;
  const liveRun = Object.values(runs).find((r) => r.status === 'running' && r.streamText);

  /** Các lớp của tôi: lớp mình chủ nhiệm (theo email), lớp đã soạn gần đây và lớp dùng lần trước. */
  const [localClassIds, setLocalClassIds] = useState<string[]>([]);
  useEffect(() => {
    const ids = new Set<string>();
    for (const h of loadHistory()) if (h.slots?.classId) ids.add(h.slots.classId);
    const last = loadLastChoice().classId;
    if (last) ids.add(last);
    setLocalClassIds([...ids]);
  }, [recent.length]);
  const myClasses = useMemo(() => {
    const email = (me.user?.email ?? '').toLowerCase();
    const list = PICKABLE_CLASSES.filter(
      (c) => (email && c.homeroomTeacher.email.toLowerCase() === email) || localClassIds.includes(c.id),
    );
    return list.slice(0, 4);
  }, [me.user?.email, localClassIds]);

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

  const replaceSlots = useCallback((s: AgentSlots) => {
    slotsRef.current = s;
    setSlots(s);
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
  const pickResources = (v: AgentSlots['dangTaiNguyen']) => {
    const next = apply({ dangTaiNguyen: v });
    userSay(answerText('dangTaiNguyen', next));
    advance(next);
  };
  const pickBloom = (v: AgentSlots['bloom']) => {
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
    replaceSlots(next);
    const label =
      step === 'format' ? 'sản phẩm' : step === 'dangTaiNguyen' ? 'các dạng tài nguyên' : step === 'bai' ? 'bài dạy' : step === 'bloom' ? 'mức tư duy' : 'phong cách';
    userSay(`Đổi ${label}`);
    advance(next);
  };

  /* ---------- chạy quy trình ---------- */
  const startRun = useCallback(
    async (s: AgentSlots, opts: { regenerationOf?: string } = {}) => {
      const name = actorRef.current.trim();
      const built = toParams(s, { regenerationOf: opts.regenerationOf, teacher: name ? { name } : undefined });
      if (!built.ok) {
        say(`Mình còn thiếu thông tin nên chưa soạn được (${built.error}). Cô/thầy kiểm tra lại giúp mình nhé.`);
        return;
      }
      saveLastChoice(s);
      const runKey = `r${Date.now()}`;
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const startedAt = Date.now();
      const title = `${formatLabel(s.format)}: ${s.baiTitle ?? ''}`.trim();
      setRuns((r) => ({ ...r, [runKey]: { status: 'running', startedAt, hasNews: Boolean(s.suKien), slots: { ...s }, title } }));
      push({ id: nid(), role: 'agent', kind: 'run', runKey });
      savePending({ id: runKey, startedAt, slots: { ...s } });

      let streamAcc = '';
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        flushTimer = null;
        const showLive = !looksLikeJson(streamAcc);
        setRuns((r) =>
          r[runKey]
            ? {
                ...r,
                [runKey]: {
                  ...r[runKey],
                  streamPreview: streamAcc.slice(-600),
                  streamText: showLive ? cleanPedagogicalText(streamAcc.slice(0, 80_000)) : undefined,
                },
              }
            : r,
        );
      };
      const scheduleFlush = () => {
        if (!flushTimer) flushTimer = setTimeout(flush, 140);
      };

      /** Lỗi giữa chừng: nếu đã có phần soạn đáng giữ thì lưu thành bản nháp dở để cô/thầy mở lại. */
      const fail = (error: string, details?: string[]) => {
        if (flushTimer) clearTimeout(flushTimer);
        clearPending();
        let partialId: string | undefined;
        if (canKeepPartial(streamAcc) && !looksLikeJson(streamAcc)) {
          partialId = `partial_${runKey}`;
          const result = buildPartialResult(s, streamAcc, partialId);
          const ptitle = `${title} (soạn dở)`;
          const entry: ResultEntry = { id: partialId, title: ptitle, at: new Date().toISOString(), slots: { ...s }, result, text: streamAcc.trim() };
          setResults((r) => ({ ...r, [partialId!]: entry }));
          saveHistoryItem({ id: partialId, title: ptitle, at: entry.at, slots: entry.slots, result, text: entry.text, draft: true });
        }
        setRuns((r) => ({
          ...r,
          [runKey]: { ...r[runKey], status: 'error', error, details, streamText: undefined, partialId },
        }));
      };

      let finishedId: string | undefined;
      const finishSuccess = (result: AgentResult) => {
        if (flushTimer) clearTimeout(flushTimer);
        clearPending();
        const original = resultText(result);
        const entry: ResultEntry = {
          id: result.runId,
          title,
          at: new Date().toISOString(),
          slots: { ...s },
          result,
          text: original,
        };
        finishedId = entry.id;
        lastResultRef.current = entry.id;
        setResults((r) => ({ ...r, [entry.id]: entry }));
        setRuns((r) => ({ ...r, [runKey]: { ...r[runKey], status: 'done', resultId: entry.id, streamText: undefined } }));
        setCanvasId(entry.id);
        // Lưu NGAY khi AI trả xong (bản nháp chưa duyệt), không chờ bấm "Duyệt & dùng".
        const isDraft = result.draft ?? result.standard.status !== 'approved';
        saveHistoryItem({ id: entry.id, title, at: entry.at, slots: entry.slots, result, text: original, draft: isDraft });
        void saveDraftVersion({
          runId: entry.id,
          title,
          format: s.format ?? '',
          workflow: result.workflow,
          lessonKey: s.baiDayId ?? result.standard?.atomId ?? '',
          lessonTitle: s.baiTitle,
          text: original,
          artifacts: result.artifacts,
          actor: actorRef.current,
        }).then((v) => {
          if (v) setResults((r) => (r[entry.id] ? { ...r, [entry.id]: { ...r[entry.id], draftVersion: v } } : r));
        });
        say(doneMessage(result, s));
        push({ id: nid(), role: 'agent', kind: 'followups', resultId: entry.id });
      };

      const failFromEvent = (evt: { status?: number; error?: string; code?: string; reasons?: string[]; quota?: ApiFailure['quota'] }) => {
        const status = evt.status ?? 502;
        if (status === 422) {
          fail(evt.error || 'Sự kiện thời sự không đạt kiểm tra an toàn.', evt.reasons);
          return;
        }
        fail(failureMessage({ status, code: evt.code, error: evt.error, quota: evt.quota }));
      };

      try {
        const res = await fetch('/api/workflows/run', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream, application/json',
          },
          body: JSON.stringify({ params: built.params }),
          signal: ctrl.signal,
        });

        const contentType = res.headers.get('content-type') ?? '';
        if (res.ok && contentType.includes('text/event-stream') && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let handledTerminal = false;

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parsed = parseSseChunk(buffer);
            buffer = parsed.rest;
            for (const evt of parsed.events) {
              if (evt.type === 'stage' && evt.stage) {
                setRuns((r) => ({
                  ...r,
                  [runKey]: { ...r[runKey], currentStage: evt.stage, stageMessage: evt.message },
                }));
              } else if (evt.type === 'delta' && evt.delta) {
                streamAcc += evt.delta;
                scheduleFlush();
              } else if (evt.type === 'part' && (evt.label || evt.key)) {
                const label = evt.label ?? evt.key ?? '';
                setRuns((r) =>
                  r[runKey] ? { ...r, [runKey]: { ...r[runKey], doneParts: [...(r[runKey].doneParts ?? []), label] } } : r,
                );
              } else if (evt.type === 'review' && evt.reflection && finishedId) {
                const id = finishedId;
                setResults((r) => (r[id] ? { ...r, [id]: { ...r[id], result: { ...r[id].result, reflection: evt.reflection! } } } : r));
              } else if (evt.type === 'done' && evt.result) {
                handledTerminal = true;
                finishSuccess(evt.result);
              } else if (evt.type === 'error') {
                handledTerminal = true;
                failFromEvent(evt);
              }
            }
          }
          if (!handledTerminal) {
            fail('Luồng phản hồi bị ngắt giữa chừng, có thể do mạng yếu. Cô/thầy bấm Thử lại; phần AI đã viết (nếu có) vẫn được giữ.');
          }
          return;
        }

        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          code?: string;
          reasons?: string[];
          quota?: ApiFailure['quota'];
          result?: AgentResult;
        };
        if (!res.ok || !j.ok || !j.result) {
          failFromEvent({ status: res.status, error: j.error, code: j.code, reasons: j.reasons, quota: j.quota });
          return;
        }
        finishSuccess(j.result);
      } catch (e) {
        if (ctrl.signal.aborted) fail('Đã dừng theo yêu cầu của cô/thầy.');
        else fail(NETWORK_CHAT_MESSAGE);
        void e;
      } finally {
        if (flushTimer) clearTimeout(flushTimer);
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
    if (working) return;
    userSay('Sinh lại bản này');
    say('Mình soạn lại ngay. Lần này mình ghi nhận đây là một lần sinh lại.');
    void startRun(entry.slots, { regenerationOf: entry.id });
  };

  const accept = async (entry: ResultEntry) => {
    const cur = resultsRef.current[entry.id] ?? entry;
    const out = await acceptResult({
      runId: cur.id,
      title: cur.title,
      format: cur.slots.format ?? '',
      workflow: cur.result.workflow,
      lessonKey: cur.slots.baiDayId ?? cur.result.standard?.atomId ?? '',
      lessonTitle: cur.slots.baiTitle,
      text: cur.text,
      artifacts: cur.result.artifacts,
      actor: actorRef.current,
    });
    setResults((r) => ({
      ...r,
      [cur.id]: { ...r[cur.id], accepted: true, diffRatio: out.diffRatio, version: out.version, versionFailed: out.versionFailed },
    }));
    saveHistoryItem({
      id: cur.id,
      title: cur.title,
      at: cur.at,
      slots: cur.slots,
      result: cur.result,
      text: cur.text,
      accepted: true,
      draft: false,
    });
  };

  /** Cô/thầy sửa tay: lưu luôn vào bản trong trình duyệt để tải lại trang không mất. */
  const setEntryText = (id: string, t: string) => {
    setResults((r) => (r[id] ? { ...r, [id]: { ...r[id], text: t, accepted: false, diffRatio: undefined } } : r));
    updateHistoryText(id, t);
  };

  /* ---------- bắt đầu / làm lại ---------- */
  const resetChat = useCallback(() => {
    abortRef.current?.abort();
    auxAbortRef.current?.abort();
    setMsgs([]);
    setRuns({});
    setAnswers({});
    setRefines({});
    setCanvasId(null);
    setSuggestions([]);
    replaceSlots(freshSlots(prefsRef.current, { subject: slotsRef.current.subject, grade: slotsRef.current.grade }));
  }, [replaceSlots]);

  const startWithFormat = (format: FormatValue) => {
    const next = apply({ format });
    userSay(formatLabel(format));
    say(`Được ạ. Mình sẽ hỏi vài điều ngắn để soạn đúng ${formatLabel(format).toLowerCase()}.`);
    advance(next);
  };

  const showAllFormats = () => {
    say('Đây là đủ các sản phẩm mình làm được. Cô/thầy chọn một sản phẩm nhé.');
    advance(slotsRef.current);
  };

  const followUp = (format: FormatValue) => {
    if (working) return;
    const next = apply({ format });
    userSay(`Làm thêm: ${formatLabel(format)}`);
    say('Mình giữ nguyên bài và các lựa chọn trước đó.');
    advance(next);
  };

  const anotherLesson = () => {
    if (working) return;
    const base = slotsRef.current;
    const next = freshSlots(prefsRef.current, { subject: base.subject, grade: base.grade });
    replaceSlots({ ...next, ngonNgu: base.ngonNgu });
    userSay('Soạn bài khác');
    say('Mình sẵn sàng. Cô/thầy muốn soạn gì tiếp?');
    advance({ ...next, ngonNgu: base.ngonNgu });
  };

  const openHistory = useCallback((id: string) => {
    const item = getHistoryItem(id);
    if (!item) return;
    lastResultRef.current = id;
    setResults((r) => ({
      ...r,
      [id]: { id, title: item.title, at: item.at, slots: item.slots, result: item.result, text: item.text, accepted: item.accepted },
    }));
    setCanvasId(id);
    setMsgs((p) =>
      p.length > 0
        ? p
        : [
            {
              id: `m${++idRef.current}`,
              role: 'agent',
              kind: 'text',
              text: `Mình đã mở lại bản soạn “${item.title}”. Cô/thầy xem ở khung bên phải, hoặc nói thẳng điều cần chỉnh (ví dụ “rút còn 35 phút”).`,
            },
          ],
    );
  }, []);

  /** Mở lại một phiên bản đã lưu (từ trang Lịch sử) để tiếp tục chỉnh trong khung bản soạn. */
  const openVersion = useCallback(async (id: string) => {
    const v = await loadVersion(id);
    if (!v) {
      setMsgs((p) => [
        ...p,
        { id: `m${++idRef.current}`, role: 'agent', kind: 'text', text: 'Mình chưa mở được phiên bản này. Cô/thầy thử lại từ trang Lịch sử nhé.' },
      ]);
      return;
    }
    const fmt = FORMAT_VALUES.includes(v.format) ? (v.format as FormatValue) : undefined;
    const entryId = `${v.runId}-v${v.number}`;
    const slotsV: AgentSlots = {
      ...initialSlots(),
      format: fmt,
      baiDayId: v.lessonKey || undefined,
      baiTitle: v.lessonTitle,
    };
    const result: AgentResult = {
      runId: v.runId,
      workflow: (v.workflow || 'khbd') as AgentResult['workflow'],
      bloomLevels: [],
      standard: { status: 'khong_co', atomId: v.lessonKey, title: v.lessonTitle },
      warnings: [],
      content: { sections: v.text ? textToSections(v.text) : [], markdown: v.text },
      reflection: { scores: [], average: 0, issues: [], skipped: true },
      requiresApproval: false,
      draft: true,
      artifacts: v.artifacts,
    };
    lastResultRef.current = entryId;
    setResults((r) => ({
      ...r,
      [entryId]: { id: entryId, title: v.title, at: v.createdAt, slots: slotsV, result, text: v.text, fromVersion: v.number },
    }));
    setCanvasId(entryId);
    setMsgs((p) => [
      ...p,
      {
        id: `m${++idRef.current}`,
        role: 'agent',
        kind: 'text',
        text: `Mình đã mở lại phiên bản ${v.number} của “${v.title}”. Cô/thầy xem ở khung bên phải, chỉnh tiếp nếu cần.`,
      },
    ]);
  }, []);

  /* ---------- soạn lại, lớp của tôi ---------- */
  const redo = (item: RecentItem) => {
    if (working || !item.slots) return;
    const s: AgentSlots = { ...item.slots, ngayDay: todayISO(), suKien: undefined };
    replaceSlots(s);
    setSuggestions([]);
    userSay(`Soạn lại như lần trước: ${item.title}`);
    say('Mình giữ nguyên mọi lựa chọn của lần trước. Cô/thầy kiểm tra rồi bấm “Bắt đầu soạn”.');
    advance(s);
  };

  const redoOtherClass = (item: RecentItem) => {
    if (working || !item.slots) return;
    const s: AgentSlots = { ...item.slots, ngayDay: todayISO(), suKien: undefined };
    replaceSlots(s);
    userSay(`Soạn lại cho lớp khác: ${item.title}`);
    push({ id: nid(), role: 'agent', kind: 'classpick', slots: s });
  };

  const pickOtherClass = (c: ClassProfile, from: AgentSlots) => {
    userSay(`Lớp ${c.className}`);
    const sameGrade = c.grade === from.grade;
    const next = apply({
      ...from,
      classId: c.id,
      grade: c.grade,
      ...(sameGrade ? {} : { baiDayId: undefined, baiTitle: undefined }),
    });
    say(
      sameGrade
        ? `Mình giữ nguyên bài và các lựa chọn, chỉ đổi sang lớp ${c.className}.`
        : `Lớp ${c.className} học khối ${c.grade} nên mình cần chọn lại bài phù hợp khối này.`,
    );
    advance(next);
  };

  const ensureLessons = async (subject: string, grade: string): Promise<FoundLesson[]> => {
    const key = `${subject}-${grade}`;
    if (lessonCache.current[key]) return lessonCache.current[key];
    const list = await loadLessonList(subject, grade);
    if (list.length) lessonCache.current[key] = list;
    return list;
  };

  /** "Soạn bài tiếp theo cho lớp này": bài kế tiếp sau bài gần nhất đã soạn cho lớp, theo thứ tự chương trình. */
  const planForClass = async (c: ClassProfile) => {
    if (working) return;
    userSay(`Soạn bài tiếp theo cho lớp ${c.className}`);
    const last = loadLastChoice();
    const hist = loadHistory().find((h) => h.slots?.classId === c.id && h.slots.baiDayId);
    const subject = hist?.slots.subject ?? last.subject ?? slotsRef.current.subject;
    const base = freshSlots(prefsRef.current);
    let next = apply({
      ...base,
      subject,
      grade: c.grade,
      classId: c.id,
      format: hist?.slots.format ?? last.format ?? base.format,
      baiDayId: undefined,
      baiTitle: undefined,
    });
    setSuggestions([]);
    if (hist?.slots.baiDayId) {
      const list = await ensureLessons(subject, c.grade);
      const nxt = nextLessonAfter(list, hist.slots.baiDayId);
      if (nxt) {
        next = apply({ baiDayId: nxt.id, baiTitle: nxt.title });
        say(`Lớp ${c.className}: bài cô/thầy soạn gần nhất là “${hist.slots.baiTitle ?? ''}”, bài kế tiếp trong chương trình là “${nxt.title}”.`);
      } else {
        say(`Lớp ${c.className}: mình chưa tìm được bài kế tiếp sau “${hist.slots.baiTitle ?? ''}”, cô/thầy chọn bài giúp mình nhé.`);
      }
    } else {
      const list = await ensureLessons(subject, c.grade);
      const first = firstLesson(list);
      if (first) {
        next = apply({ baiDayId: first.id, baiTitle: first.title });
        say(`Chưa có bài nào được soạn cho lớp ${c.className}, nên mình gợi ý bài đầu tiên của chương trình: “${first.title}”. Cô/thầy đổi bài nếu muốn.`);
      } else {
        say(`Mình chưa thấy bài nào đã soạn cho lớp ${c.className}. Cô/thầy chọn bài đầu tiên nhé.`);
      }
    }
    advance(next);
  };

  /* ---------- hỏi đáp chuyên môn ---------- */
  const doAsk = async (question: string, existingKey?: string) => {
    const key = existingKey ?? `a${Date.now()}`;
    setAnswers((a) => ({ ...a, [key]: { status: 'loading', question } }));
    if (!existingKey) push({ id: nid(), role: 'agent', kind: 'answer', answerKey: key });
    setAuxBusy((n) => n + 1);
    const ctrl = new AbortController();
    auxAbortRef.current = ctrl;

    // Nhớ vài lượt trước: các cặp hỏi và đáp đã xong, theo đúng thứ tự trong hội thoại.
    const turns: { role: 'teacher' | 'assistant'; text: string }[] = [];
    for (const m of msgsRef.current) {
      if (m.role === 'agent' && m.kind === 'answer' && m.answerKey !== key) {
        const a = answersRef.current[m.answerKey];
        if (a?.status === 'done' && a.text) turns.push({ role: 'teacher', text: a.question }, { role: 'assistant', text: a.text });
      }
    }
    const target = canvasIdRef.current ? resultsRef.current[canvasIdRef.current] : undefined;
    const s = slotsRef.current;
    const out = await callAssistant(
      question,
      {
        classId: s.classId,
        lessonTitle: s.baiTitle,
        subject: subjectLabel(s.subject),
        grade: s.grade,
        history: turns.slice(-6),
        currentText: target?.text ? target.text.slice(0, 3500) : undefined,
      },
      ctrl.signal,
    );
    if (auxAbortRef.current === ctrl) auxAbortRef.current = null;
    setAuxBusy((n) => Math.max(0, n - 1));
    if (out.ok) {
      setAnswers((a) => ({ ...a, [key]: { status: 'done', question, text: out.data.reply, suggestions: out.data.suggestions } }));
    } else if (!out.aborted) {
      setAnswers((a) => ({ ...a, [key]: { status: 'error', question, error: out.message } }));
    } else {
      setAnswers((a) => ({ ...a, [key]: { status: 'error', question, error: out.message } }));
    }
  };

  const quickAsk = (q: string) => {
    if (working) return;
    userSay(q);
    void doAsk(q);
  };

  /* ---------- chỉnh bản đang mở bằng lời ---------- */
  const refineTarget = (): ResultEntry | undefined => {
    const id = canvasIdRef.current ?? lastResultRef.current;
    return id ? resultsRef.current[id] : undefined;
  };

  const doRefine = async (entry: ResultEntry, instruction: string, existingKey?: string) => {
    if (getArtifacts(entry.result).length > 0) {
      say(
        'Bản này là slide, phiếu học tập hoặc tài nguyên có nhiều phần riêng, nên mình chưa chỉnh được bằng lời cho cả bản. Cô/thầy mở khung bên phải để sửa từng phần, hoặc bấm “Sinh lại”. Với kế hoạch bài dạy, quiz và đề kiểm tra mình chỉnh được ngay.',
      );
      return;
    }
    const key = existingKey ?? `f${Date.now()}`;
    setRefines((r) => ({ ...r, [key]: { status: 'working', instruction, entryId: entry.id, retryable: true } }));
    if (!existingKey) push({ id: nid(), role: 'agent', kind: 'refine', refineKey: key });
    // Màn hình rộng: bản soạn nằm cạnh khung chat nên mở luôn để thấy thay đổi. Điện thoại: bản soạn phủ kín màn hình
    // và che mất thẻ tiến trình/lỗi, nên để cô/thầy bấm "Xem bản đã chỉnh" khi cần.
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 901px)').matches) setCanvasId(entry.id);
    setAuxBusy((n) => n + 1);
    const ctrl = new AbortController();
    auxAbortRef.current = ctrl;
    const cur = resultsRef.current[entry.id] ?? entry;
    const s = cur.slots;
    const cls = s.classId ? getClassById(s.classId) : undefined;
    const out = await callRefine(
      {
        instruction,
        text: cur.text,
        format: formatLabel(s.format),
        context: {
          monHoc: subjectLabel(s.subject),
          khoi: s.grade,
          lop: cls?.className,
          baiDayTen: s.baiTitle,
          phongCach: s.phongCach ? styleLabel(s.phongCach) : undefined,
        },
      },
      ctrl.signal,
    );
    if (auxAbortRef.current === ctrl) auxAbortRef.current = null;
    setAuxBusy((n) => Math.max(0, n - 1));
    if (!out.ok) {
      setRefines((r) => ({ ...r, [key]: { status: 'error', instruction, entryId: entry.id, error: out.message, retryable: true } }));
      return;
    }
    const newText = out.data.text;
    setResults((r) => {
      const c = r[entry.id];
      if (!c) return r;
      return {
        ...r,
        [entry.id]: {
          ...c,
          text: newText,
          undo: [...(c.undo ?? []), c.text].slice(-10),
          lastRefine: instruction,
          accepted: false,
          diffRatio: undefined,
        },
      };
    });
    updateHistoryText(entry.id, newText);
    setRefines((r) => ({ ...r, [key]: { status: 'done', instruction, entryId: entry.id, retryable: true } }));
  };

  const undoRefine = (entryId: string) => {
    const c = resultsRef.current[entryId];
    if (!c || !c.undo || c.undo.length === 0) return;
    const undo = c.undo.slice(0, -1);
    const prev = c.undo[c.undo.length - 1];
    setResults((r) => (r[entryId] ? { ...r, [entryId]: { ...r[entryId], text: prev, undo, lastRefine: undo.length ? r[entryId].lastRefine : undefined, accepted: false } } : r));
    updateHistoryText(entryId, prev);
    say('Mình đã hoàn tác lần chỉnh vừa rồi, bản soạn quay về như trước đó.');
  };

  /* ---------- câu gõ tự do ---------- */
  const lessonScope = () => ({ subject: slotsRef.current.subject, grade: slotsRef.current.grade });

  const composeFromIntent = async (intent: Intent, pre?: LessonSearchResult) => {
    const patch: Partial<AgentSlots> = {};
    if (intent.format) patch.format = intent.format;
    if (intent.bloom) patch.bloom = intent.bloom;
    if (intent.phongCach) patch.phongCach = intent.phongCach;
    if (intent.ngonNgu) patch.ngonNgu = intent.ngonNgu;
    if (intent.soTiet) patch.soTiet = intent.soTiet;
    if (intent.subject) patch.subject = intent.subject;
    const notes: string[] = [];
    if (intent.className) {
      const cls = PICKABLE_CLASSES.find((c) => c.className.toUpperCase() === intent.className);
      if (cls) {
        patch.classId = cls.id;
        patch.grade = cls.grade;
      } else {
        if (intent.grade && isGrade(intent.grade)) patch.grade = intent.grade;
        notes.push(`Mình chưa có hồ sơ lớp ${intent.className}, nên soạn theo khối ${intent.grade ?? slotsRef.current.grade}.`);
      }
    } else if (intent.grade) {
      if (isGrade(intent.grade)) patch.grade = intent.grade;
      else notes.push(`Mình hỗ trợ khối 6 đến 12, nên chưa soạn được cho khối ${intent.grade}.`);
    }
    const wantsLesson = Boolean(intent.lessonQuery || intent.chapterNo || intent.lessonNo);
    if (wantsLesson) {
      patch.baiDayId = undefined;
      patch.baiTitle = undefined;
    }
    let next = apply(patch);
    const hadLessonBefore = Boolean(next.baiDayId);

    let found = false;
    let crossLessons: FoundLesson[] | null = null;
    let lessonNote = '';
    if (wantsLesson) {
      const res = pre ?? (await searchLessons(intent, lessonScope()));
      if (res.kind === 'sure') {
        next = apply({
          baiDayId: res.lesson.id,
          baiTitle: res.lesson.title,
          ...(isGrade(res.lesson.grade) ? { grade: res.lesson.grade } : {}),
          ...(SUBJECT_OPTIONS.some((o) => o.value === res.lesson.subject) ? { subject: res.lesson.subject } : {}),
        });
        found = true;
        setSuggestions([]);
      } else if (res.kind === 'here') {
        setSuggestions(res.lessons.map(toAtom));
        lessonNote = `Mình thấy vài bài gần với “${intent.lessonQueryRaw || intent.lessonQuery}”. Cô/thầy chọn giúp mình bài đúng nhé.`;
      } else if (res.kind === 'cross') {
        crossLessons = res.lessons;
      } else if (res.kind === 'error') {
        lessonNote = res.message;
      } else {
        setSuggestions([]);
        lessonNote = `Mình chưa tìm thấy bài nào khớp với “${intent.lessonQueryRaw || intent.lessonQuery || 'số bài vừa nêu'}” trong ${subjectLabel(next.subject)} lớp ${next.grade}, cả khi tìm ở các khối và môn khác. Cô/thầy thử gõ tên bài ở ô tìm bên dưới.`;
      }
    }

    const u = buildUnderstanding(intent, next, { lessonFound: found });
    if (u.understood.length > 0 || u.unclear.length > 0) {
      push({ id: nid(), role: 'agent', kind: 'understood', chips: u.understood, unclear: u.unclear });
    }
    for (const n of notes) say(n);
    if (lessonNote) say(lessonNote);
    if (crossLessons) {
      push({ id: nid(), role: 'agent', kind: 'cross', lessons: crossLessons, query: intent.lessonQueryRaw || intent.lessonQuery });
      return;
    }
    if (!wantsLesson && u.understood.length === 0 && !hadLessonBefore) {
      say('Mình hiểu là cô/thầy muốn soạn bài. Cô/thầy chọn sản phẩm và bài giúp mình nhé.');
    }
    advance(next);
  };

  const pickCross = (l: FoundLesson) => {
    userSay(`Chọn ${l.title} (${l.subjectLabel} lớp ${l.grade})`);
    const patch: Partial<AgentSlots> = { baiDayId: l.id, baiTitle: l.title };
    if (isGrade(l.grade)) patch.grade = l.grade;
    if (SUBJECT_OPTIONS.some((o) => o.value === l.subject)) patch.subject = l.subject;
    const cur = slotsRef.current;
    const cls = cur.classId ? getClassById(cur.classId) : undefined;
    if (cls && patch.grade && cls.grade !== patch.grade) patch.classId = undefined;
    const next = apply(patch);
    setSuggestions([]);
    say(`Mình đã chuyển sang ${l.subjectLabel} lớp ${l.grade} và chọn bài “${l.title}”.`);
    advance(next);
  };

  const handleSend = async (override?: string) => {
    const value = (override ?? text).trim();
    if (!value || working) return;
    if (override === undefined) {
      setText('');
      if (taRef.current) taRef.current.style.height = 'auto';
    }
    userSay(value);

    if (isSmallTalk(value)) {
      say('Mình luôn sẵn sàng. Cô/thầy muốn soạn bài, hỏi một vấn đề chuyên môn, hay chỉnh bản đang mở?');
      return;
    }

    const last = msgsRef.current[msgsRef.current.length - 1];
    const waitingLesson = Boolean(last && last.role === 'agent' && last.kind === 'ask' && last.step === 'bai');
    const target = refineTarget();
    const cls = classifyMessage(value, { hasResult: Boolean(target), waitingLesson });
    const intent = cls.intent;

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

    if (cls.mode === 'chinh' && target) {
      void doRefine(target, value);
      return;
    }
    if (cls.mode === 'hoi') {
      void doAsk(value);
      return;
    }
    if (cls.mode === 'soan') {
      await composeFromIntent(intent);
      return;
    }
    // Chưa chắc: nếu cụm từ khớp rõ một bài thì coi là soạn, không thì hỏi lại ngắn bằng nút.
    if (cls.refineWithoutResult) {
      push({
        id: nid(),
        role: 'agent',
        kind: 'mode',
        text: value,
        note: 'Mình chưa có bản soạn nào đang mở để chỉnh. Cô/thầy muốn mình làm gì với câu này?',
      });
      return;
    }
    if (intent.lessonQuery) {
      const res = await searchLessons(intent, lessonScope());
      if (res.kind === 'sure' || res.kind === 'cross') {
        await composeFromIntent(intent, res);
        return;
      }
    }
    push({ id: nid(), role: 'agent', kind: 'mode', text: value });
  };

  const runCommandLink = (href: string) => href;

  const openRecent = (item: RecentItem) => {
    if (item.kind === 'version') void openVersion(item.id);
    else openHistory(item.id);
  };

  /* Áp tuỳ chọn mặc định và lựa chọn lần trước một lần, khi chưa có lựa chọn nào từ liên kết hay hội thoại. */
  useEffect(() => {
    if (!meReady || prefsApplied.current) return;
    prefsApplied.current = true;
    const cur = slotsRef.current;
    const keep = Boolean(cur.classId || cur.baiDayId);
    const next = applyLast(applyPrefs(cur, me.prefs, { keepSubjectGrade: keep }), loadLastChoice(), { keepSubjectGrade: keep });
    const patch: Partial<AgentSlots> = {};
    for (const k of ['subject', 'grade', 'phongCach', 'classId', 'bloom'] as const) {
      if (next[k] !== cur[k]) (patch as Record<string, unknown>)[k] = next[k];
    }
    if (Object.keys(patch).length > 0) apply(patch);
  }, [meReady, me.prefs, apply]);

  /* ---------- hiệu ứng ---------- */
  useEffect(() => {
    // Cuộn sau khi bố cục ổn định: thẻ xác nhận còn dài thêm khi tải trạng thái bản chuẩn.
    if (msgs.length === 0) return; // màn hình chào luôn hiện từ đầu
    const id = requestAnimationFrame(() => {
      const el = threadRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight });
    });
    return () => cancelAnimationFrame(id);
  }, [msgs, runs, standard, suggestions, answers, refines]);

  const isLive = Boolean(liveRun);
  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isLive]);

  useEffect(() => {
    let opened = false;
    try {
      const q = new URLSearchParams(window.location.search);
      const h = q.get('h');
      const v = q.get('v');
      const fresh = q.get('new');
      const ask = q.get('ask');
      const rawTool = q.get('tool');
      const toolFmt: FormatValue | null =
        rawTool === 'khbd-5512'
          ? 'ke_hoach'
          : rawTool?.startsWith('ktdg-')
            ? 'de_kiem_tra'
            : rawTool?.startsWith('pht-')
              ? 'worksheet'
              : null;
      const fmt = (q.get('format') as FormatValue | null) || toolFmt;
      // Tham số đến từ các trang khác: lớp (Lớp học), bài và bài liên kết (Sơ đồ liên môn).
      const classId = q.get('classId');
      const bai = q.get('bai') || q.get('nodeId');
      const baiTitle = q.get('baiTitle');
      const lienKet = q.get('lienKet');
      const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
      const patch: Partial<AgentSlots> = {};
      const cls = classId ? getClassById(classId) : undefined;
      if (cls) {
        patch.classId = cls.id;
        patch.grade = String(cls.grade);
      }
      if (bai && ID_RE.test(bai)) {
        patch.baiDayId = bai;
        patch.baiTitle = (baiTitle ?? '').trim().slice(0, 200) || bai;
      }
      if (lienKet && ID_RE.test(lienKet)) patch.lienKetId = lienKet;
      const hasPatch = Object.keys(patch).length > 0;
      const validFmt = fmt && FORMAT_VALUES.includes(fmt);

      if (v && ID_RE.test(v)) {
        opened = true;
        void openVersion(v);
      } else if (h) {
        opened = true;
        openHistory(h);
      } else if (validFmt || hasPatch) {
        opened = true;
        const next = apply({ ...patch, ...(validFmt ? { format: fmt as FormatValue } : {}) });
        if (validFmt) userSay(formatLabel(fmt as FormatValue));
        const bits: string[] = [];
        if (cls) bits.push(`lớp ${cls.className}`);
        if (patch.baiTitle) bits.push(`bài “${patch.baiTitle}”`);
        if (patch.lienKetId) bits.push('bài liên kết để tích hợp liên môn');
        if (bits.length) say(`Mình đã nhận sẵn: ${bits.join(', ')}.`);
        advance(next);
        if (patch.baiDayId && (!baiTitle || !baiTitle.trim())) {
          fetch(`/api/supabase/knowledge?atomId=${encodeURIComponent(patch.baiDayId)}`)
            .then(async (res) => {
              const j = (await res.json().catch(() => ({}))) as { ok?: boolean; atom?: { title?: string } };
              if (res.ok && j.ok && j.atom?.title) apply({ baiTitle: j.atom.title });
            })
            .catch(() => undefined);
        }
        if (patch.lienKetId) {
          // Lấy tên bài liên kết để hiển thị thân thiện (không bắt buộc).
          fetch(`/api/supabase/knowledge?atomId=${encodeURIComponent(patch.lienKetId)}`)
            .then(async (res) => {
              const j = (await res.json().catch(() => ({}))) as { ok?: boolean; atom?: { title?: string } };
              if (res.ok && j.ok && j.atom?.title) apply({ lienKetTitle: j.atom.title });
            })
            .catch(() => undefined);
        }
      } else if (fresh) {
        resetChat();
      }
      if (ask) {
        // /?ask=1: mở trang chủ và đặt con trỏ vào ô chat (nút "Hỏi nhanh" ở thanh bên).
        setTimeout(() => {
          taRef.current?.focus();
          taRef.current?.scrollIntoView({ block: 'nearest' });
        }, 60);
      }
      if (h || v || fresh || ask || validFmt || hasPatch) window.history.replaceState(null, '', '/');
    } catch {
      /* bỏ qua */
    }
    // Lần soạn trước bị ngắt (tải lại trang hoặc mất mạng): đề nghị soạn lại với các lựa chọn cũ.
    if (!opened) {
      const p = loadPending();
      if (p) {
        clearPending();
        setMsgs((cur) => (cur.length === 0 ? [{ id: `m${++idRef.current}`, role: 'agent', kind: 'resume', pending: p }] : cur));
      }
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
    const active = m.id === lastId && !working;
    switch (m.kind) {
      case 'text':
        return <p className="ag-text">{m.text}</p>;
      case 'ask':
        return (
          <>
            <p className="ag-text">{STEP_PROMPTS[m.step]}</p>
            {active && m.step === 'format' && <FormatChoices onPick={pickFormat} />}
            {active && m.step === 'dangTaiNguyen' && <ResourceChoices onPick={pickResources} />}
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
            onRetry={() => void startRun(run.slots ?? slotsRef.current)}
            retryDisabled={working}
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
        const textual = entry ? getArtifacts(entry.result).length === 0 : false;
        return (
          <>
            {active && entry && textual && (
              <div className="ag-chips" role="group" aria-label="Chỉnh nhanh bằng lời">
                {REFINE_SUGGESTIONS.map((r) => (
                  <button key={r} type="button" className="ag-chip" onClick={() => void handleSend(r)}>
                    <Icon name="edit" size={16} />
                    {r}
                  </button>
                ))}
              </div>
            )}
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
      case 'understood':
        return (
          <UnderstoodCard
            chips={m.chips}
            unclear={m.unclear}
            slots={slots}
            active={active}
            onEditStep={editStep}
            onChange={(patch) => apply(patch)}
          />
        );
      case 'mode': {
        const target = refineTarget();
        return (
          <ModeCard
            note={m.note}
            canRefine={Boolean(target) && !m.note}
            active={active}
            onCompose={() => {
              userSay('Soạn bài này');
              void composeFromIntent(parseIntent(m.text));
            }}
            onAsk={() => {
              userSay('Chỉ hỏi đáp');
              void doAsk(m.text);
            }}
            onRefine={() => {
              const t = refineTarget();
              userSay('Chỉnh bản đang mở');
              if (t) void doRefine(t, m.text);
            }}
          />
        );
      }
      case 'answer': {
        const a = answers[m.answerKey];
        if (!a) return null;
        return (
          <AnswerCard
            state={a}
            active={active}
            onRetry={() => void doAsk(a.question, m.answerKey)}
            onSuggest={(q) => {
              userSay(q);
              void doAsk(q);
            }}
          />
        );
      }
      case 'refine': {
        const r = refines[m.refineKey];
        if (!r) return null;
        const entry = results[r.entryId];
        return (
          <RefineCard
            state={r}
            entry={entry}
            canUndo={Boolean(entry?.undo?.length) && entry?.lastRefine === r.instruction}
            onUndo={() => undoRefine(r.entryId)}
            onRetry={() => entry && void doRefine(entry, r.instruction, m.refineKey)}
            onOpen={() => setCanvasId(r.entryId)}
          />
        );
      }
      case 'cross':
        return (
          <CrossCard
            lessons={m.lessons}
            query={m.query}
            active={active}
            onPick={pickCross}
            onOther={() => {
              userSay('Tìm bài khác');
              advance(clearStep(slotsRef.current, 'bai'));
            }}
          />
        );
      case 'classpick': {
        const others = PICKABLE_CLASSES.filter((c) => c.id !== m.slots.classId && c.grade === m.slots.grade);
        const pool = others.length > 0 ? others : PICKABLE_CLASSES.filter((c) => c.id !== m.slots.classId);
        return <ClassPickCard classes={pool} active={active} onPick={(c) => pickOtherClass(c, m.slots)} />;
      }
      case 'resume':
        return (
          <ResumeCard
            pending={m.pending}
            active={active}
            onResume={() => {
              userSay('Soạn lại ngay');
              void startRun({ ...m.pending.slots, ngayDay: todayISO() });
            }}
            onDismiss={() => {
              userSay('Để sau');
              say('Được ạ. Cô/thầy cần soạn gì, cứ gõ hoặc chọn một thẻ nhé.');
            }}
          />
        );
    }
  };

  const secs = liveRun ? Math.max(0, Math.round((now - liveRun.startedAt) / 1000)) : 0;
  const subtitleFor = (r: RunState) => formatLabel(r.slots?.format);

  return (
    <Shell variant="chat">
      <div className={`ag-agent${canvasEntry || liveRun ? ' has-canvas' : ''}${liveRun ? ' has-live' : ''}`}>
        <section className="ag-chat" aria-label="Trò chuyện với trợ lý">
          <div className="ag-chat-top">
            <div className="ag-chat-top-left" role="group" aria-label="Chọn nhanh môn và khối">
              <select
                className="ag-top-select"
                aria-label="Môn học"
                value={slots.subject}
                onChange={(e) => {
                  const next = apply({ subject: e.target.value, baiDayId: undefined, baiTitle: undefined });
                  saveLastChoice(next);
                }}
              >
                {SUBJECT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    Môn {o.label}
                  </option>
                ))}
              </select>
              <select
                className="ag-top-select"
                aria-label="Khối lớp"
                value={slots.grade}
                onChange={(e) => {
                  const next = apply({ grade: e.target.value, baiDayId: undefined, baiTitle: undefined });
                  saveLastChoice(next);
                }}
              >
                {GRADE_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    Khối {g}
                  </option>
                ))}
              </select>
              {slots.baiTitle && (
                <button
                  type="button"
                  className="ag-who-pill"
                  title="Đổi bài dạy"
                  aria-label={`Đổi bài dạy, đang chọn: ${slots.baiTitle}`}
                  onClick={() => editStep('bai')}
                >
                  <Icon name="book" size={15} />
                  <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {slots.baiTitle}
                  </span>
                </button>
              )}
            </div>
            <div className="ag-chat-top-right">
              <TeacherName value={actor} onSave={saveActor} ready={actorReady} inline />
              {msgs.length > 0 && (
                <button
                  type="button"
                  className="ag-btn small"
                  onClick={resetChat}
                  disabled={working}
                  title="Bắt đầu lại cuộc trò chuyện"
                >
                  <Icon name="refresh" size={16} />
                  <span className="ag-top-label">Làm mới</span>
                </button>
              )}
              {hasResults && !canvasEntry && !liveRun && (
                <button
                  type="button"
                  className="ag-btn small"
                  onClick={() => setCanvasId(lastResultRef.current ?? Object.keys(results)[Object.keys(results).length - 1])}
                >
                  <Icon name="panel" size={16} />
                  <span className="ag-top-label">Mở bản soạn</span>
                </button>
              )}
              <Link
                href={(() => {
                  const p = new URLSearchParams();
                  if (slots.format) p.set('format', slots.format);
                  if (slots.baiDayId) p.set('bai', slots.baiDayId);
                  if (slots.baiTitle) p.set('baiTitle', slots.baiTitle);
                  if (slots.classId) p.set('classId', slots.classId);
                  const qs = p.toString();
                  return qs ? `/soan-bai?${qs}` : '/soan-bai';
                })()}
                className="ag-btn small"
                aria-label="Dùng biểu mẫu"
              >
                <Icon name="clipboard" size={16} />
                <span className="ag-top-label">Dùng biểu mẫu</span>
              </Link>
            </div>
          </div>

          <div className="ag-thread" ref={threadRef}>
            {msgs.length === 0 ? (
              <Hero
                me={me}
                usage={usage}
                recent={recent}
                myClasses={myClasses}
                pickableClasses={PICKABLE_CLASSES}
                onStart={startWithFormat}
                onShowAll={showAllFormats}
                onOpenRecent={openRecent}
                onRedo={redo}
                onRedoOtherClass={redoOtherClass}
                onPlanForClass={(c) => void planForClass(c)}
                onQuickAsk={quickAsk}
              />
            ) : (
              <div className="ag-thread-inner" role="log" aria-live="polite" aria-relevant="additions">
                {msgs.map((m) =>
                  m.role === 'agent' && m.kind === 'followups' && (m.id !== lastId || working) ? null : m.role === 'user' ? (
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
                readOnly={working}
                aria-disabled={working}
                placeholder={
                  working
                    ? 'Mình đang làm, cô/thầy đợi một chút nhé…'
                    : canvasEntry
                      ? 'Nói điều cần chỉnh, soạn bài khác hoặc hỏi…'
                      : 'Gõ yêu cầu hoặc câu hỏi…'
                }
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
              <button type="submit" className="ag-send" aria-label="Gửi" disabled={working || !text.trim()}>
                <Icon name="send" />
              </button>
            </form>
            <p className="ag-composer-hint">
              Ví dụ: “soạn kế hoạch bài dạy định lí Pythagore lớp 7A2, 2 tiết, hoạt động nhóm”. Nội dung do AI soạn, cô/thầy cần đọc lại trước khi dạy.
            </p>
          </div>
        </section>

        {liveRun ? (
          <LiveCanvas
            title={liveRun.title ?? 'Bản soạn'}
            subtitle={subtitleFor(liveRun)}
            text={liveRun.streamText ?? ''}
            stageMessage={liveRun.stageMessage}
            seconds={secs}
            onCancel={cancelRun}
          />
        ) : (
          canvasEntry && (
            <Canvas
              entry={canvasEntry}
              busy={working}
              onClose={() => setCanvasId(null)}
              onText={(t) => setEntryText(canvasEntry.id, t)}
              onRegenerate={() => regenerate(canvasEntry)}
              onAccept={() => accept(canvasEntry)}
              onUndo={() => undoRefine(canvasEntry.id)}
            />
          )
        )}
      </div>
    </Shell>
  );
}
