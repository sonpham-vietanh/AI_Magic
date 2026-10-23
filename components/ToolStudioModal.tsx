'use client';

import { rovingRef, rovingKeyDown } from '@/components/resources/roving';
import { useCallback, useEffect, useRef, useState } from 'react';
import '@/app/ui-modal.css';
import { getCategoryMeta, SUBJECTS } from '@/lib/catalog';
import { cleanPedagogicalText } from '@/lib/text/clean';
import { CLASS_PROFILES } from '@/lib/classes';
import { pickDefaultClass } from '@/lib/classes/pickDefaultClass';
import { Icon } from '@/components/ui/icons';
import { formatApiError } from '@/lib/ui/soanBai';
import { DocBody } from '@/components/studio/DocBody';
import { QuestionBank } from '@/components/studio/QuestionBank';
import { useDialog } from '@/components/studio/useDialog';
import type {
  SupabaseAtom,
  SupabaseQuestion,
  SupabaseSocratic,
} from '@/lib/supabase';
import type {
  ClassProfile,
  GeneratedResource,
  GenerationRequest,
  GradeLevel,
  KnowledgeNode,
  PedagogicalTool,
  SubjectCode,
} from '@/lib/types';

const POST_ACTIONS: {
  action: NonNullable<GenerationRequest['postAction']>;
  label: string;
}[] = [
  { action: 'rut_ngan', label: 'Rút gọn 1 trang A4' },
  { action: 'tang_do_kho', label: 'Tăng độ khó' },
  { action: 'giam_do_kho', label: 'Hỗ trợ nhóm Cơ bản' },
  { action: 'tao_rubric', label: 'Thêm bảng tiêu chí chấm' },
  { action: 'tao_phieu_hoc_tap', label: 'Thêm phiếu học tập' },
  { action: 'song_ngu_anh_viet', label: 'Song ngữ Anh - Việt' },
  { action: 'them_hoat_dong_vui_ve', label: 'Thêm khởi động 5 phút' },
];

const AI_MODELS = [
  {
    id: 'cc/claude-haiku-4-5-20251001',
    label: 'Nhanh (khoảng 15-20 giây)',
  },
  {
    id: 'cc/claude-sonnet-5-5',
    label: 'Kỹ hơn (khoảng 35-50 giây)',
  },
];

const DATA_SOURCE_LABEL: Record<string, string> = {
  supabase_rich: 'Dùng dữ liệu thật của bài',
  class_profile: 'Dùng hồ sơ lớp',
  prompt_only: 'Chỉ theo ô nhập',
};

const LAST_CLASS_KEY = 'va:lastClassId';

function readLastClassId(): string | undefined {
  try {
    return window.localStorage.getItem(LAST_CLASS_KEY) || undefined;
  } catch {
    return undefined;
  }
}

function writeLastClassId(id: string) {
  try {
    window.localStorage.setItem(LAST_CLASS_KEY, id);
  } catch {
    /* localStorage không khả dụng */
  }
}

/** Nhãn thân thiện cho giáo viên; giá trị gốc chỉ để trong title. */
function friendlyModelLabel(modelUsed: string): string {
  return /^Live AI|^Google Gemini|claude|gemini/i.test(modelUsed)
    ? 'Trợ lý AI'
    : 'Mẫu soạn sẵn (AI không phản hồi)';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const BAD_NOTICE = /không|lỗi|hết hạn|quá tải|gián đoạn|đã hủy/i;

export function ToolStudioModal({
  tool,
  initialGrade,
  initialSubject,
  initialClassProfile,
  initialNode,
  teacherName,
  teacherEmail,
  onClose,
}: {
  tool: PedagogicalTool | null;
  initialGrade: GradeLevel;
  initialSubject: SubjectCode;
  initialClassProfile?: ClassProfile;
  initialNode?: KnowledgeNode;
  teacherName: string;
  teacherEmail: string;
  onClose: () => void;
}) {
  const [grade, setGrade] = useState<GradeLevel>(initialGrade);
  const [subject, setSubject] = useState<SubjectCode>(initialSubject);
  const [atomId, setAtomId] = useState<string>(initialNode?.id || 'KC-4402137');
  const [selectedModel, setSelectedModel] = useState<string>(AI_MODELS[0].id);
  const [inputs, setInputs] = useState<
    Record<string, string | number | boolean>
  >({});
  const [loading, setLoading] = useState(false);
  const [resource, setResource] = useState<GeneratedResource | null>(null);
  const [saveNotice, setSaveNotice] = useState<string>('');
  const [streamText, setStreamText] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [sbAtoms, setSbAtoms] = useState<SupabaseAtom[]>([]);
  const [atomQuestions, setAtomQuestions] = useState<SupabaseQuestion[]>([]);
  const [atomSocratic, setAtomSocratic] = useState<SupabaseSocratic[]>([]);
  const [rightTab, setRightTab] = useState<'document' | 'bank'>('document');
  const [step, setStep] = useState<'form' | 'result'>('form');
  const [isEditingDoc, setIsEditingDoc] = useState<boolean>(false);
  const [bankError, setBankError] = useState<string>('');
  const [autoTopic, setAutoTopic] = useState<string>('');
  const [classId, setClassId] = useState<string>('');
  const manualClassRef = useRef<string | undefined>(undefined);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const atomIdRef = useRef(atomId);
  const autoTopicRef = useRef('');
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    atomIdRef.current = atomId;
  }, [atomId]);
  useEffect(() => {
    autoTopicRef.current = autoTopic;
  }, [autoTopic]);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Lớp đi theo khối: ưu tiên lựa chọn thủ công gần nhất (nếu cùng khối).
  useEffect(() => {
    if (!manualClassRef.current) {
      manualClassRef.current = readLastClassId();
    }
    const preferred = manualClassRef.current ?? initialClassProfile?.id;
    setClassId(
      pickDefaultClass(CLASS_PROFILES, grade, subject, preferred)?.id ?? '',
    );
  }, [grade, subject, initialClassProfile?.id]);

  // Focus vào hộp thoại, bẫy Tab, ESC (đang chạy thì lần 1 hủy, lần 2 đóng).
  const toolOpen = Boolean(tool);
  const handleEscape = useCallback(() => {
    const running = abortRef.current;
    if (running && !running.signal.aborted) {
      running.abort();
      return true;
    }
    onCloseRef.current();
    return false;
  }, []);
  useDialog(dialogRef, toolOpen, handleEscape);

  // Prefill chủ đề từ bài được chọn; chỉ ghi đè khi GV chưa tự sửa.
  const applyAutoTopic = (title: string) => {
    const prevAuto = autoTopicRef.current;
    const defaultTopic = String(tool?.sampleInput.topic ?? '');
    setInputs((prev) => {
      const cur = String(prev.topic ?? '');
      const untouched = !cur || cur === defaultTopic || cur === prevAuto;
      return untouched ? { ...prev, topic: title } : prev;
    });
    autoTopicRef.current = title;
    setAutoTopic(title);
  };

  useEffect(() => {
    if (previewRef.current && loading) {
      previewRef.current.scrollTop = previewRef.current.scrollHeight;
    }
  }, [streamText, loading]);

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (!tool) return;
    setGrade(initialGrade);
    setSubject(initialSubject);
    setAtomId(initialNode?.id || 'KC-4402137');
    const nodeTitle = initialNode?.title || '';
    autoTopicRef.current = nodeTitle;
    setAutoTopic(nodeTitle);
    setInputs({
      ...tool.sampleInput,
      topic: nodeTitle || tool.sampleInput.topic || '',
      objectives:
        initialNode?.moetRequiredOutcomes?.join('; ') ||
        tool.sampleInput.objectives ||
        '',
    });
    setResource(null);
    setSaveNotice('');
    setRightTab('document');
    setStep('form');
    setIsEditingDoc(false);
  }, [tool, initialGrade, initialSubject, initialNode]);

  useEffect(() => {
    if (!tool) return;
    const ctrl = new AbortController();
    const params = new URLSearchParams({
      subject,
      grade,
      limit: '80',
    });
    fetch(`/api/supabase/knowledge?${params.toString()}`, {
      signal: ctrl.signal,
    })
      .then(async (r) => {
        const data = (await r.json().catch(() => null)) as {
          ok?: boolean;
          atoms?: SupabaseAtom[];
          error?: string;
        } | null;
        if (!r.ok || !data) {
          throw new Error(
            r.status === 429
              ? 'Hệ thống đang quá tải, vui lòng thử lại sau ít phút.'
              : formatApiError(r.status, r.status >= 500 ? undefined : data?.error),
          );
        }
        return data;
      })
      .then((data) => {
        const list = data.atoms || [];
        setBankError('');
        setSbAtoms(list);
        const cur = atomIdRef.current;
        if (list.length > 0 && !list.some((a) => a.id === cur)) {
          const first = list[0];
          setAtomId(first.id);
          applyAutoTopic(first.title);
          setInputs((prev) => ({
            ...prev,
            objectives: first.yeu_cau || prev.objectives || '',
          }));
        }
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setSbAtoms([]);
        setBankError(
          err instanceof Error ? err.message : 'Chưa tải được danh sách bài học.',
        );
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, grade, subject]);

  useEffect(() => {
    if (!tool || !atomId) return;
    const ctrl = new AbortController();
    fetch(`/api/supabase/knowledge?atomId=${encodeURIComponent(atomId)}`, {
      signal: ctrl.signal,
    })
      .then(async (r) => {
        const data = (await r.json().catch(() => null)) as {
          ok?: boolean;
          questions?: SupabaseQuestion[];
          socratic?: SupabaseSocratic[];
          error?: string;
        } | null;
        if (!r.ok || !data) {
          throw new Error(
            r.status === 429
              ? 'Hệ thống đang quá tải, vui lòng thử lại sau ít phút.'
              : formatApiError(r.status, r.status >= 500 ? undefined : data?.error),
          );
        }
        return data;
      })
      .then((data) => {
        if (data.ok) {
          setBankError('');
          setAtomQuestions(data.questions || []);
          setAtomSocratic(data.socratic || []);
        }
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setAtomQuestions([]);
        setAtomSocratic([]);
        setBankError(
          err instanceof Error
            ? err.message
            : 'Không tải được ngân hàng câu hỏi.',
        );
      });
    return () => ctrl.abort();
  }, [tool, atomId]);

  if (!tool) return null;

  const selectedSbAtom = sbAtoms.find((a) => a.id === atomId);
  const catMeta = getCategoryMeta(tool.category);
  const dataSourceLabel = tool.dataSource
    ? DATA_SOURCE_LABEL[tool.dataSource]
    : undefined;
  const experimental = tool.maturity === 'experimental';

  const handleGenerate = async (
    postAction?: GenerationRequest['postAction'],
  ) => {
    abortRef.current?.abort();
    const { topic: rawTopic, ...restInputs } = inputs;
    const topicText = String(rawTopic ?? '').trim();
    const sendInputs: Record<string, string | number | boolean> = {
      ...restInputs,
    };
    if (
      topicText &&
      topicText !== String(tool.sampleInput.topic ?? '').trim() &&
      topicText !== autoTopic.trim()
    ) {
      sendInputs.topic = topicText;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setSaveNotice('');
    setStreamText('');
    setRightTab('document');
    setIsEditingDoc(false);
    setStep('result');
    type Done = {
      resource?: GeneratedResource;
      warning?: string;
      saved?: { local?: boolean; supabase?: boolean };
    };
    const applyDone = (data: Done) => {
      if (!data.resource) return false;
      setResource(data.resource);
      const savedNote =
        data.saved && !data.saved.local && !data.saved.supabase
          ? 'nhưng chưa lưu được vào Kho tài nguyên.'
          : 'và đã lưu vào Kho tài nguyên.';
      setSaveNotice(
        `Soạn xong ${savedNote}${
          data.warning ? ` Lưu ý: ${data.warning}` : ''
        }`,
      );
      return true;
    };
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          toolId: tool.id,
          teacherName,
          teacherEmail,
          grade,
          subject,
          classId: classId || undefined,
          knowledgeNodeId: atomId,
          atomId,
          preferredModel: selectedModel,
          inputs: sendInputs,
          postAction,
          previousContent: resource?.markdownContent,
          stream: true,
        }),
      });
      const isSse = (response.headers.get('content-type') || '').includes(
        'text/event-stream',
      );
      if (response.ok && isSse && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let finished = false;
        const handle = (line: string) => {
          if (!line.startsWith('data:')) return;
          let evt: { type?: string; text?: string; error?: string } & Done;
          try {
            evt = JSON.parse(line.slice(5).trim());
          } catch {
            return;
          }
          if (evt.type === 'delta' && evt.text) {
            setStreamText((prev) => prev + evt.text);
          } else if (evt.type === 'done') {
            finished = true;
            if (!applyDone(evt)) setSaveNotice('Không thể tạo học liệu.');
          } else if (evt.type === 'error') {
            finished = true;
            setSaveNotice('Chưa tạo được học liệu. Cô/thầy thử lại sau ít phút nhé.');
          }
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split(/\r?\n/);
          buf = lines.pop() ?? '';
          lines.forEach(handle);
        }
        buf += decoder.decode();
        if (buf) handle(buf);
        if (!finished) setSaveNotice('Kết nối bị gián đoạn trước khi hoàn tất.');
        return;
      }
      const data = (await response.json().catch(() => ({}))) as Done & {
        ok?: boolean;
        error?: string;
      };
      if (response.ok && data.ok && data.resource) {
        applyDone(data);
      } else if (response.status === 429) {
        setSaveNotice(
          'Hệ thống đang quá tải, cô/thầy vui lòng thử lại sau ít phút.',
        );
      } else if (response.status === 401) {
        setSaveNotice('Phiên làm việc đã hết hạn, vui lòng tải lại trang rồi thử lại.');
      } else {
        setSaveNotice(formatApiError(response.status, response.status >= 500 ? undefined : data.error));
      }
    } catch {
      setSaveNotice(
        ctrl.signal.aborted ? 'Đã hủy biên soạn.' : 'Không kết nối được máy chủ. Cô/thầy kiểm tra mạng rồi thử lại nhé.',
      );
    } finally {
      if (abortRef.current === ctrl) {
        abortRef.current = null;
        setLoading(false);
        setStreamText('');
      }
    }
  };

  const handleInsertQuestionToDoc = (q: SupabaseQuestion, idx: number) => {
    const formatted = [
      `Câu hỏi ${idx + 1} (Mức độ ${q.do_kho}, DOK ${q.dok}): ${q.noi_dung}`,
      `a) Đáp án đúng: ${q.dap_an}`,
      `b) Hướng dẫn giải: ${q.loi_giai}`,
      Array.isArray(q.nhieu) && q.nhieu.length > 0
        ? `c) Lưu ý lỗi sai học sinh dễ mắc: ${q.nhieu
            .map((n) => `"${n.noiDung}" (${n.lyDo})`)
            .join('; ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    if (!resource) {
      setInputs((prev) => ({
        ...prev,
        objectives: `${String(prev.objectives || '')}\n\n[Đưa câu hỏi vào bài]:\n${formatted}`.trim(),
      }));
      setSaveNotice(
        'Đã chèn câu hỏi vào ô yêu cầu để AI lồng ghép vào bài soạn.',
      );
      return;
    }

    const updatedSections = [...resource.structuredSections];
    const bankIdx = updatedSections.findIndex((s) =>
      s.heading.includes('Bài tập & Câu hỏi Đánh giá Chèn thêm'),
    );
    if (bankIdx >= 0) {
      updatedSections[bankIdx] = {
        ...updatedSections[bankIdx],
        body: `${updatedSections[bankIdx].body}\n\n${formatted}`,
      };
    } else {
      updatedSections.push({
        heading: 'Bài tập & Câu hỏi Đánh giá Chèn thêm từ Kho Trường Việt Anh',
        body: formatted,
      });
    }
    setResource({
      ...resource,
      structuredSections: updatedSections,
      markdownContent: `${resource.markdownContent}\n\n${formatted}`,
    });
    setRightTab('document');
    setSaveNotice('Đã chèn câu hỏi vào cuối bản soạn.');
  };

  const handleInsertSocraticToDoc = (s: SupabaseSocratic, idx: number) => {
    const formatted = [
      `Tình huống Socratic ${idx + 1}: Khi học sinh trả lời sai "${s.wrong_answer}" (Bản chất lỗi sai: ${s.misconception})`,
      `Bước 1 (Hỏi khơi gợi): ${s.bac_1}`,
      `Bước 2 (Hỏi định hướng): ${s.bac_2}`,
      `Bước 3 (Hỏi phản biện): ${s.bac_3}`,
      `Bước 4 (Chốt kiến thức đúng): ${s.bac_4}`,
    ].join('\n');

    if (!resource) {
      setInputs((prev) => ({
        ...prev,
        objectives: `${String(prev.objectives || '')}\n\n[Lồng ghép kịch bản Socratic]:\n${formatted}`.trim(),
      }));
      setSaveNotice('Đã đưa kịch bản Socratic vào ô yêu cầu cho bài soạn.');
      return;
    }

    const updatedSections = [...resource.structuredSections];
    updatedSections.push({
      heading: `Kịch bản Sửa lỗi sai trên lớp (Socratic 4 Bậc — Tình huống ${idx + 1})`,
      body: formatted,
    });
    setResource({
      ...resource,
      structuredSections: updatedSections,
      markdownContent: `${resource.markdownContent}\n\n${formatted}`,
    });
    setRightTab('document');
    setSaveNotice('Đã chèn kịch bản Socratic vào bản soạn.');
  };

  const handleUpdateSection = (
    index: number,
    field: 'heading' | 'body',
    value: string,
  ) => {
    if (!resource) return;
    const nextSections = resource.structuredSections.map((sec, i) =>
      i === index ? { ...sec, [field]: value } : sec,
    );
    const nextMarkdown = nextSections
      .map((s) => `## ${s.heading}\n\n${s.body}`)
      .join('\n\n');
    setResource({
      ...resource,
      structuredSections: nextSections,
      markdownContent: nextMarkdown,
    });
  };

  const handleDownloadWord = () => {
    if (!resource) return;
    const htmlDoc = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="vi">
<head><meta charset="utf-8"><title>${escapeHtml(resource.title)}</title>
<style>
  body { font-family: 'Times New Roman', Arial, sans-serif; font-size: 13pt; line-height: 1.5; color: #000000; }
  h1 { font-size: 15pt; text-transform: uppercase; margin-bottom: 8px; }
  h2 { font-size: 13pt; margin-top: 14px; margin-bottom: 6px; }
  .meta { border-bottom: 1px solid #ccc; padding-bottom: 10px; margin-bottom: 14px; }
  pre { white-space: pre-wrap; font-family: inherit; margin: 0; }
</style>
</head>
<body>
  <div class="meta">
    <b>TRƯỜNG TIỂU HỌC, THCS & THPT VIỆT ANH</b><br/>
    <b>Tài liệu:</b> ${escapeHtml(resource.title)}<br/>
    <b>Giáo viên:</b> ${escapeHtml(resource.teacher.name)} · <b>Khối:</b> ${escapeHtml(String(resource.grade))}<br/>
    <b>Căn cứ chuyên môn:</b> ${escapeHtml(tool.moetStandardRef)}
  </div>
  ${resource.structuredSections
    .map(
      (s) =>
        `<h2>${escapeHtml(s.heading)}</h2><pre>${escapeHtml(s.body)}</pre>`,
    )
    .join('\n')}
</body></html>`;
    const blob = new Blob(['﻿', htmlDoc], {
      type: 'application/msword;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tool.slug}-khoi-${resource.grade}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    setSaveNotice('Đã tải về file Word (.doc).');
  };

  const handleDownloadMarkdown = () => {
    if (!resource) return;
    const blob = new Blob([resource.markdownContent], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tool.slug}-khoi-${resource.grade}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setSaveNotice('Đã tải về file Markdown (.md).');
  };

  const handleCopy = async () => {
    if (!resource) return;
    try {
      await navigator.clipboard.writeText(resource.markdownContent);
      setSaveNotice('Đã sao chép nội dung.');
    } catch {
      setSaveNotice('Không sao chép được, cô/thầy thử lại giúp.');
    }
  };

  const setField = (id: string, value: string) =>
    setInputs((prev) => ({ ...prev, [id]: value }));

  const noticeText = bankError || saveNotice;
  const noticeBad = Boolean(bankError) || BAD_NOTICE.test(saveNotice);
  const classOptions = CLASS_PROFILES.filter((c) => c.grade === grade);
  const hasStream = loading && streamText.length > 0;

  return (
    <div
      className="md-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="md-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="md-tool-title"
        tabIndex={-1}
      >
        {/* ĐẦU */}
        <header className="md-head no-print">
          <div className="md-head-main">
            <div className="md-kicker">{catMeta.name}</div>
            <h2 className="md-title" id="md-tool-title">
              {tool.name}
            </h2>
            <p className="md-desc">{tool.shortDescription}</p>
            <div className="md-tags">
              {experimental && (
                <span className="md-tag warn" title={tool.maturityNote}>
                  <Icon name="alert" size={16} />
                  Thử nghiệm
                </span>
              )}
              {dataSourceLabel && (
                <span className="md-tag">
                  <Icon name="info" size={16} />
                  {dataSourceLabel}
                </span>
              )}
            </div>
            {experimental && tool.maturityNote && (
              <p className="md-hint">{tool.maturityNote}</p>
            )}
          </div>
          <button
            type="button"
            className="ag-iconbtn"
            aria-label="Đóng hộp thoại"
            title="Đóng (Esc)"
            onClick={onClose}
          >
            <Icon name="x" />
          </button>
        </header>

        {/* BƯỚC (điện thoại) */}
        <div className="md-steps no-print" role="tablist" ref={rovingRef} onKeyDown={rovingKeyDown} aria-label="Các bước">
          <button
            type="button"
            role="tab"
            className="ag-tab"
            aria-selected={step === 'form'}
            onClick={() => setStep('form')}
          >
            1. Nhập yêu cầu
          </button>
          <button
            type="button"
            role="tab"
            className="ag-tab"
            aria-selected={step === 'result'}
            onClick={() => setStep('result')}
          >
            2. Xem kết quả
          </button>
        </div>

        <div className="md-body" data-step={step}>
          {/* TRÁI: BIỂU MẪU */}
          <section className="md-form-pane no-print" aria-label="Biểu mẫu">
            <div className="md-form-scroll">
              <div className="md-group">
                <h3 className="md-group-title">Bài dạy</h3>
                <div className="md-row2 md-fld">
                  <div>
                    <label className="ag-field-label" htmlFor="md-grade">
                      Khối
                    </label>
                    <select
                      id="md-grade"
                      className="ag-field"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value as GradeLevel)}
                    >
                      {['6', '7', '8', '9', '10', '11', '12'].map((g) => (
                        <option key={g} value={g}>
                          Khối {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="ag-field-label" htmlFor="md-subject">
                      Môn
                    </label>
                    <select
                      id="md-subject"
                      className="ag-field"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value as SubjectCode)}
                    >
                      {SUBJECTS.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="md-fld">
                  <label className="ag-field-label" htmlFor="md-class">
                    Lớp
                  </label>
                  <select
                    id="md-class"
                    className="ag-field"
                    value={classId}
                    onChange={(e) => {
                      manualClassRef.current = e.target.value;
                      setClassId(e.target.value);
                      writeLastClassId(e.target.value);
                    }}
                  >
                    {classOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.className}
                      </option>
                    ))}
                    {classOptions.length === 0 &&
                      CLASS_PROFILES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.className} (Khối {c.grade})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="md-fld">
                  <label className="ag-field-label" htmlFor="md-atom">
                    Bài học
                  </label>
                  <select
                    id="md-atom"
                    className="ag-field"
                    value={atomId}
                    onChange={(e) => {
                      const nextAtomId = e.target.value;
                      setAtomId(nextAtomId);
                      const foundAtom = sbAtoms.find((a) => a.id === nextAtomId);
                      if (foundAtom) {
                        applyAutoTopic(foundAtom.title);
                        setInputs((prev) => ({
                          ...prev,
                          objectives: foundAtom.yeu_cau || prev.objectives || '',
                        }));
                      }
                    }}
                  >
                    {sbAtoms.length === 0 && (
                      <option value={atomId}>Đang tải danh sách bài...</option>
                    )}
                    {sbAtoms.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                  </select>
                  {selectedSbAtom &&
                    (selectedSbAtom.yeu_cau || selectedSbAtom.quan_niem_sai) && (
                      <details className="md-atom">
                        <summary>Yêu cầu cần đạt và lỗi hay gặp</summary>
                        <p>
                          {selectedSbAtom.chapter} · {selectedSbAtom.lesson}
                        </p>
                        {selectedSbAtom.yeu_cau && (
                          <p>
                            <b>Cần đạt:</b> {selectedSbAtom.yeu_cau}
                          </p>
                        )}
                        {selectedSbAtom.quan_niem_sai && (
                          <p className="warn">
                            <b>Học sinh hay sai:</b> {selectedSbAtom.quan_niem_sai}
                          </p>
                        )}
                      </details>
                    )}
                </div>
              </div>

              <div className="md-group">
                <h3 className="md-group-title">Yêu cầu của cô/thầy</h3>
                {tool.inputFields.map((field) => {
                  const fid = `md-f-${field.id}`;
                  return (
                    <div key={field.id} className="md-fld">
                      <label className="ag-field-label" htmlFor={fid}>
                        {field.label}
                        {field.required && (
                          <span className="md-req" aria-hidden="true">
                            {' '}
                            *
                          </span>
                        )}
                      </label>
                      {field.type === 'textarea' ? (
                        <textarea
                          id={fid}
                          className="ag-field"
                          rows={4}
                          value={String(inputs[field.id] ?? '')}
                          placeholder={field.placeholder}
                          onChange={(e) => setField(field.id, e.target.value)}
                        />
                      ) : field.type === 'select' && field.options ? (
                        <select
                          id={fid}
                          className="ag-field"
                          value={String(
                            inputs[field.id] ?? field.defaultValue ?? '',
                          )}
                          onChange={(e) => setField(field.id, e.target.value)}
                        >
                          {field.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={fid}
                          className="ag-field"
                          type={field.type === 'number' ? 'number' : 'text'}
                          value={String(inputs[field.id] ?? '')}
                          placeholder={field.placeholder}
                          onChange={(e) => setField(field.id, e.target.value)}
                        />
                      )}
                      {field.helpText && (
                        <span className="md-hint">{field.helpText}</span>
                      )}
                      {field.id === 'topic' &&
                        autoTopic &&
                        String(inputs.topic ?? '') === autoTopic && (
                          <span className="md-hint">
                            Lấy theo bài đã chọn, cô/thầy có thể sửa.
                          </span>
                        )}
                    </div>
                  );
                })}
              </div>

              <details className="md-adv">
                <summary>Tùy chọn nâng cao</summary>
                <label className="ag-field-label" htmlFor="md-model">
                  Tốc độ soạn
                </label>
                <select
                  id="md-model"
                  className="ag-field"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  {AI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </details>
            </div>

            <div className="md-form-foot">
              <button
                type="button"
                className="ag-btn primary"
                disabled={loading}
                onClick={() => void handleGenerate()}
              >
                {loading ? (
                  <>
                    <span className="ag-spin" aria-hidden="true" />
                    Đang soạn...
                  </>
                ) : (
                  <>
                    <Icon name="sparkles" size={18} />
                    {resource ? 'Soạn lại' : 'Biên soạn'}
                  </>
                )}
              </button>
              {loading && (
                <button
                  type="button"
                  className="ag-btn small ghost md-cancel"
                  onClick={() => abortRef.current?.abort()}
                >
                  Hủy
                </button>
              )}
            </div>
          </section>

          {/* PHẢI: KẾT QUẢ */}
          <section className="md-result-pane" aria-label="Kết quả">
            <div className="md-tabbar no-print">
              <div className="ag-tabs" role="tablist" ref={rovingRef} onKeyDown={rovingKeyDown}>
                <button
                  type="button"
                  role="tab"
                  className="ag-tab"
                  aria-selected={rightTab === 'document'}
                  onClick={() => setRightTab('document')}
                >
                  Bản soạn
                </button>
                <button
                  type="button"
                  role="tab"
                  className="ag-tab"
                  aria-selected={rightTab === 'bank'}
                  onClick={() => setRightTab('bank')}
                >
                  Câu hỏi có sẵn ({atomQuestions.length + atomSocratic.length})
                </button>
              </div>
              <div
                className={`md-notice${noticeBad ? ' bad' : ''}`}
                role={noticeBad ? 'alert' : 'status'}
                aria-live="polite"
              >
                {noticeText}
              </div>
            </div>

            {rightTab === 'document' && resource && !loading && (
              <div className="md-toolbar no-print">
                <button
                  type="button"
                  className="ag-btn small primary"
                  onClick={handleDownloadWord}
                >
                  <Icon name="download" size={16} />
                  Tải Word
                </button>
                <button
                  type="button"
                  className="ag-btn small"
                  aria-pressed={isEditingDoc}
                  onClick={() => setIsEditingDoc((p) => !p)}
                >
                  <Icon name={isEditingDoc ? 'check' : 'edit'} size={16} />
                  {isEditingDoc ? 'Xong chỉnh sửa' : 'Chỉnh sửa'}
                </button>
                <button
                  type="button"
                  className="ag-btn small"
                  onClick={() => window.print()}
                >
                  <Icon name="print" size={16} />
                  In
                </button>
                <button
                  type="button"
                  className="ag-btn small"
                  onClick={() => void handleCopy()}
                >
                  <Icon name="clipboard" size={16} />
                  Sao chép
                </button>
                <button
                  type="button"
                  className="ag-btn small ghost"
                  onClick={handleDownloadMarkdown}
                >
                  Tải .md
                </button>
              </div>
            )}

            <div className="md-scroll" ref={previewRef}>
              {rightTab === 'bank' ? (
                <QuestionBank
                  questions={atomQuestions}
                  socratic={atomSocratic}
                  onInsertQuestion={handleInsertQuestionToDoc}
                  onInsertSocratic={handleInsertSocraticToDoc}
                />
              ) : loading ? (
                <>
                  <div className="md-live no-print" role="status">
                    <span className="ag-spin" aria-hidden="true" />
                    <span>
                      Đang soạn... {elapsed} giây
                      {hasStream ? ` · ${streamText.length} ký tự` : ''}
                    </span>
                    <button
                      type="button"
                      className="ag-btn small"
                      onClick={() => abortRef.current?.abort()}
                    >
                      Hủy
                    </button>
                  </div>
                  <div className="md-paper md-cursor" aria-live="off">
                    {hasStream ? (
                      <DocBody text={streamText} />
                    ) : (
                      <p className="ag-line">Đang chờ AI bắt đầu viết...</p>
                    )}
                  </div>
                </>
              ) : !resource ? (
                <div className="md-empty">
                  <h3>Bản soạn sẽ gồm</h3>
                  <p>
                    Điền yêu cầu ở bên trái rồi bấm Biên soạn. Kết quả hiện ở đây.
                  </p>
                  <ol>
                    {tool.outputSections.map((sec, idx) => (
                      <li key={idx}>{sec}</li>
                    ))}
                  </ol>
                  {step === 'result' && (
                    <div className="ag-chips">
                      <button
                        type="button"
                        className="ag-chip"
                        onClick={() => setStep('form')}
                      >
                        Quay lại nhập yêu cầu
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="md-refine no-print">
                    <span className="ag-label">Chỉnh nhanh bằng AI</span>
                    <div className="ag-chips" style={{ marginTop: 0 }}>
                      {POST_ACTIONS.map((item) => (
                        <button
                          key={item.action}
                          type="button"
                          className="ag-chip"
                          disabled={loading}
                          onClick={() => void handleGenerate(item.action)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div id="tool-studio-a4-preview" className="md-paper md-print">
                    <h2 className="md-doc-title">{resource.title}</h2>
                    <p className="md-doc-meta">
                      Khối {resource.grade} · {resource.teacher.name} ·{' '}
                      {friendlyModelLabel(resource.modelUsed)}
                    </p>
                    {resource.moetComplianceChecklist.length > 0 && (
                      <div className="md-checks no-print">
                        {resource.moetComplianceChecklist.map((chk, idx) => (
                          <span key={idx} className="md-tag" title={chk.note}>
                            <Icon name="check" size={14} />
                            {chk.criterion}
                          </span>
                        ))}
                      </div>
                    )}

                    {resource.structuredSections.map((sec, idx) => (
                      <div key={idx} className="md-sec">
                        {isEditingDoc ? (
                          <>
                            <label
                              className="ag-field-label"
                              htmlFor={`md-sec-h-${idx}`}
                            >
                              Tiêu đề mục {idx + 1}
                            </label>
                            <input
                              id={`md-sec-h-${idx}`}
                              type="text"
                              className="ag-field md-edit-in"
                              value={sec.heading}
                              onChange={(e) =>
                                handleUpdateSection(idx, 'heading', e.target.value)
                              }
                            />
                            <label
                              className="ag-field-label"
                              htmlFor={`md-sec-b-${idx}`}
                            >
                              Nội dung mục {idx + 1}
                            </label>
                            <textarea
                              id={`md-sec-b-${idx}`}
                              className="ag-field md-edit-ta"
                              rows={Math.max(4, sec.body.split('\n').length)}
                              value={sec.body}
                              onChange={(e) =>
                                handleUpdateSection(idx, 'body', e.target.value)
                              }
                            />
                          </>
                        ) : (
                          <>
                            <h3>{cleanPedagogicalText(sec.heading)}</h3>
                            <DocBody text={cleanPedagogicalText(sec.body)} />
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
