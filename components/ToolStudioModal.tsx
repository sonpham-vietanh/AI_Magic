'use client';

import { useEffect, useRef, useState } from 'react';
import { getCategoryMeta, SUBJECTS } from '@/lib/catalog';
import { cleanPedagogicalText } from '@/lib/engine/smartGenerator';
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
  { action: 'tang_do_kho', label: 'Tăng độ khó (Vận dụng cao)' },
  { action: 'giam_do_kho', label: 'Hỗ trợ nhóm Cơ bản' },
  { action: 'tao_rubric', label: '+ Bảng tiêu chí chấm điểm' },
  { action: 'tao_phieu_hoc_tap', label: '+ Phiếu học tập trên lớp' },
  { action: 'song_ngu_anh_viet', label: 'Song ngữ Anh - Việt' },
  { action: 'them_hoat_dong_vui_ve', label: '+ Hoạt động khởi động 5 phút' },
];

const AI_MODELS = [
  {
    id: 'cc/claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5 (Tốc độ nhanh ~15–20 giây)',
  },
  {
    id: 'cc/claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5 (Phân tích sâu ~35–50 giây)',
  },
];

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
  const [isEditingDoc, setIsEditingDoc] = useState<boolean>(false);
  const [bankError, setBankError] = useState<string>('');
  const atomIdRef = useRef(atomId);
  useEffect(() => {
    atomIdRef.current = atomId;
  }, [atomId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.scrollTop = previewRef.current.scrollHeight;
    }
  }, [streamText]);

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
    setInputs({
      ...tool.sampleInput,
      topic: initialNode?.title || tool.sampleInput.topic || '',
      objectives:
        initialNode?.moetRequiredOutcomes?.join('; ') ||
        tool.sampleInput.objectives ||
        '',
    });
    setResource(null);
    setSaveNotice('');
    setRightTab('document');
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
              : data?.error || `Không tải được danh sách bài học (${r.status}).`,
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
          setInputs((prev) => ({
            ...prev,
            topic: `[${first.code}] ${first.title}`,
            objectives: first.yeu_cau || prev.objectives || '',
          }));
        }
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setSbAtoms([]);
        setBankError(
          err instanceof Error ? err.message : 'Không tải được danh sách bài học.',
        );
      });
    return () => ctrl.abort();
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
              : data?.error || `Không tải được ngân hàng câu hỏi (${r.status}).`,
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

  useEffect(() => {
    if (!tool) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tool, onClose]);

  if (!tool) return null;

  const selectedSbAtom = sbAtoms.find((a) => a.id === atomId);
  const catMeta = getCategoryMeta(tool.category);

  const handleGenerate = async (
    postAction?: GenerationRequest['postAction'],
  ) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setSaveNotice('');
    setStreamText('');
    setRightTab('document');
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
          ? 'nhưng chưa lưu được vào Kho Tài nguyên.'
          : '& lưu vào Kho Tài nguyên.';
      setSaveNotice(
        `Đã biên soạn bằng ${data.resource.modelUsed} ${savedNote}${
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
          classId: initialClassProfile?.id,
          knowledgeNodeId: atomId,
          atomId,
          preferredModel: selectedModel,
          inputs,
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
            setSaveNotice(evt.error || 'Không thể tạo học liệu.');
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
          'Hệ thống đang quá tải, thầy/cô vui lòng thử lại sau ít phút.',
        );
      } else if (response.status === 401) {
        setSaveNotice('Phiên làm việc đã hết hạn, vui lòng đăng nhập lại.');
      } else {
        setSaveNotice(data.error || 'Không thể tạo học liệu.');
      }
    } catch {
      setSaveNotice(
        ctrl.signal.aborted ? 'Đã hủy biên soạn.' : 'Lỗi kết nối máy chủ.',
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
        'Đã chèn câu hỏi vào ô Yêu cầu đầu vào để AI lồng ghép vào bài soạn!',
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
    setSaveNotice('Đã chèn câu hỏi trực tiếp vào cuối trang giấy A4!');
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
      setSaveNotice(
        'Đã đưa kịch bản Socratic vào yêu cầu đầu vào cho bài soạn!',
      );
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
    setSaveNotice('Đã chèn kịch bản Socratic vào trang giấy A4!');
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
<head><meta charset="utf-8"><title>${resource.title}</title>
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
    <b>Tài liệu:</b> ${resource.title}<br/>
    <b>Giáo viên:</b> ${resource.teacher.name} · <b>Khối:</b> ${resource.grade}<br/>
    <b>Căn cứ chuyên môn:</b> ${tool.moetStandardRef}
  </div>
  ${resource.structuredSections
    .map(
      (s) =>
        `<h2>${s.heading}</h2><pre>${s.body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`,
    )
    .join('\n')}
</body></html>`;
    const blob = new Blob(['\ufeff', htmlDoc], {
      type: 'application/msword;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tool.slug}-khoi-${resource.grade}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    setSaveNotice('Đã tải về file Word (.doc) sẵn sàng in ấn.');
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
    await navigator.clipboard.writeText(resource.markdownContent);
    setSaveNotice('Đã sao chép toàn bộ nội dung vào bộ nhớ tạm.');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="studio-modal" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <header className="studio-header">
          <div>
            <div className="row-wrap" style={{ marginBottom: '6px' }}>
              <span
                style={{
                  background: 'var(--cta)',
                  color: 'var(--navy)',
                  fontWeight: 800,
                  fontSize: '12px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  textTransform: 'uppercase',
                }}
              >
                {catMeta.name}
              </span>
              <span
                style={{
                  background: 'rgba(255,255,255,0.14)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '12.5px',
                  padding: '2px 9px',
                  borderRadius: '4px',
                }}
              >
                {tool.moetStandardRef}
              </span>
              {selectedSbAtom && (
                <span
                  style={{
                    background: 'rgba(59, 209, 127, 0.2)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    padding: '2px 9px',
                    borderRadius: '4px',
                  }}
                >
                  Bài dạy: {selectedSbAtom.code} ({atomQuestions.length} câu hỏi · {atomSocratic.length} kịch bản Socratic)
                </span>
              )}
            </div>
            <h2 style={{ color: '#ffffff', fontSize: '20px', fontWeight: 800 }}>
              {tool.name}
            </h2>
          </div>

          <div className="row-wrap">
            {resource && (
              <>
                <button
                  type="button"
                  className="btn btn-cta"
                  onClick={handleDownloadWord}
                >
                  Tải file Word (.doc)
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setIsEditingDoc((prev) => !prev)}
                  style={{
                    background: isEditingDoc ? 'var(--gold)' : undefined,
                    color: isEditingDoc ? 'var(--navy)' : undefined,
                    fontWeight: 700,
                  }}
                >
                  {isEditingDoc ? '✓ Xong chỉnh sửa' : 'Chỉnh sửa trực tiếp'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => window.print()}
                >
                  In / Xuất PDF A4
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void handleCopy()}
                >
                  Sao chép
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={handleDownloadMarkdown}
                >
                  Tải .md
                </button>
              </>
            )}
            <button
              type="button"
              className="btn"
              style={{
                background: 'rgba(255,255,255,0.12)',
                color: '#ffffff',
                borderColor: 'rgba(255,255,255,0.28)',
              }}
              onClick={onClose}
            >
              Đóng [ESC]
            </button>
          </div>
        </header>

        {/* 2-COLUMN SPLIT BODY */}
        <div className="studio-body">
          {/* LEFT PANE: SUPABASE ATOM CONTEXT + INPUT FORM */}
          <aside className="studio-form-pane">
            <div
              style={{
                background: 'var(--cream)',
                border: '1px solid var(--line)',
                borderLeft: '4px solid var(--gold)',
                borderRadius: '6px',
                padding: '14px 16px',
              }}
            >
              <div className="va-crumb" style={{ marginBottom: '8px' }}>
                1. CHỌN BÀI DẠY & CHẾ ĐỘ AI BIÊN SOẠN
              </div>

              <div className="stack" style={{ gap: '10px' }}>
                <div className="grid-2" style={{ gap: '10px' }}>
                  <div className="field">
                    <label>Khối lớp</label>
                    <select
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
                  <div className="field">
                    <label>Môn học</label>
                    <select
                      value={subject}
                      onChange={(e) =>
                        setSubject(e.target.value as SubjectCode)
                      }
                    >
                      {SUBJECTS.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label>Bài học / Đơn vị kiến thức ({sbAtoms.length} bài)</label>
                  <select
                    value={atomId}
                    onChange={(e) => {
                      const nextAtomId = e.target.value;
                      setAtomId(nextAtomId);
                      const foundAtom = sbAtoms.find(
                        (a) => a.id === nextAtomId,
                      );
                      if (foundAtom) {
                        setInputs((prev) => ({
                          ...prev,
                          topic: `[${foundAtom.code}] ${foundAtom.title}`,
                          objectives:
                            foundAtom.yeu_cau || prev.objectives || '',
                        }));
                      }
                    }}
                  >
                    {sbAtoms.map((a) => (
                      <option key={a.id} value={a.id}>
                        [{a.code}] {a.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Bộ não AI xử lý trực tiếp</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    {AI_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedSbAtom && (
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid var(--line)',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      fontSize: '13px',
                      lineHeight: 1.5,
                      display: 'grid',
                      gap: '5px',
                    }}
                  >
                    <div>
                      <b style={{ color: 'var(--navy)' }}>
                        {selectedSbAtom.code} ({selectedSbAtom.bloom} · DOK{' '}
                        {selectedSbAtom.dok}):
                      </b>{' '}
                      {selectedSbAtom.chapter} · {selectedSbAtom.lesson}
                    </div>
                    {selectedSbAtom.yeu_cau && (
                      <div>
                        <b>Yêu cầu cần đạt:</b> {selectedSbAtom.yeu_cau}
                      </div>
                    )}
                    {selectedSbAtom.quan_niem_sai && (
                      <div style={{ color: 'var(--gold-text)' }}>
                        <b>⚠️ Lỗi sai HS hay mắc:</b>{' '}
                        {selectedSbAtom.quan_niem_sai}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="va-crumb" style={{ marginTop: '4px' }}>
              2. YÊU CẦU CỤ THỂ CỦA GIÁO VIÊN CHO TIẾT NÀY
            </div>

            {tool.inputFields.map((field) => (
              <div key={field.id} className="field">
                <label>{field.label}</label>
                {field.type === 'textarea' ? (
                  <textarea
                    value={String(inputs[field.id] ?? '')}
                    placeholder={field.placeholder}
                    onChange={(e) =>
                      setInputs((prev) => ({
                        ...prev,
                        [field.id]: e.target.value,
                      }))
                    }
                  />
                ) : field.type === 'select' && field.options ? (
                  <select
                    value={String(
                      inputs[field.id] ?? field.defaultValue ?? '',
                    )}
                    onChange={(e) =>
                      setInputs((prev) => ({
                        ...prev,
                        [field.id]: e.target.value,
                      }))
                    }
                  >
                    {field.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={String(inputs[field.id] ?? '')}
                    placeholder={field.placeholder}
                    onChange={(e) =>
                      setInputs((prev) => ({
                        ...prev,
                        [field.id]: e.target.value,
                      }))
                    }
                  />
                )}
              </div>
            ))}

            <button
              type="button"
              className="btn btn-cta"
              style={{
                width: '100%',
                minHeight: '48px',
                fontSize: '16px',
                marginTop: '6px',
              }}
              disabled={loading}
              onClick={() => void handleGenerate()}
            >
              {loading
                ? 'AI đang biên soạn bài dạy (~15–20 giây)...'
                : 'Biên soạn Học liệu bằng AI ngay →'}
            </button>
            {loading && (
              <div className="stack" style={{ gap: '6px' }}>
                <div
                  className="row-between"
                  style={{ fontSize: '13px', color: 'var(--muted)' }}
                >
                  <span>
                    Đang nhận nội dung từ AI... {elapsed} giây
                    {streamText ? ` · ${streamText.length} ký tự` : ''}
                  </span>
                  <button
                    type="button"
                    className="btn"
                    style={{ minHeight: '28px', padding: '2px 10px' }}
                    onClick={() => abortRef.current?.abort()}
                  >
                    Hủy
                  </button>
                </div>
                <div
                  ref={previewRef}
                  aria-live="off"
                  style={{
                    maxHeight: '220px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontSize: '13px',
                    lineHeight: 1.5,
                    background: '#ffffff',
                    border: '1px dashed var(--line)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                  }}
                >
                  {streamText || 'Đang chờ AI bắt đầu viết...'}
                </div>
              </div>
            )}
          </aside>

          {/* RIGHT PANE: TABS FOR A4 DOCUMENT & INSTANT LESSON QUESTION BANK */}
          <div className="studio-preview-pane">
            <div
              className="row-between no-print"
              style={{
                maxWidth: '860px',
                margin: '0 auto 14px auto',
                background: '#ffffff',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--line)',
              }}
            >
              <div className="row-wrap">
                <button
                  type="button"
                  className={`va-tab ${rightTab === 'document' ? 'active' : ''}`}
                  onClick={() => setRightTab('document')}
                >
                  1. Bản thảo Giáo án / Học liệu A4
                </button>
                <button
                  type="button"
                  className={`va-tab ${rightTab === 'bank' ? 'active' : ''}`}
                  onClick={() => setRightTab('bank')}
                >
                  2. Kho Câu hỏi & Kịch bản Socratic có sẵn của bài này
                  <span className="va-tab-count">
                    {atomQuestions.length + atomSocratic.length}
                  </span>
                </button>
              </div>
              {saveNotice && (
                <span className="va-badge va-badge-green">{saveNotice}</span>
              )}
              {bankError && (
                <span
                  role="alert"
                  className="va-badge"
                  style={{ whiteSpace: 'normal', color: '#b42318' }}
                >
                  {bankError}
                </span>
              )}
            </div>

            {rightTab === 'bank' ? (
              <div
                className="stack"
                style={{ maxWidth: '860px', margin: '0 auto', gap: '16px' }}
              >
                <div className="card stack" style={{ gap: '12px' }}>
                  <div className="row-between">
                    <div>
                      <div className="va-crumb">
                        NGÂN HÀNG CÂU HỎI ĐÁNH GIÁ CỦA BÀI {selectedSbAtom?.code}
                      </div>
                      <h3 style={{ fontSize: '18px', fontWeight: 800 }}>
                        {atomQuestions.length} Câu hỏi có sẵn (Kèm đáp án, lời giải & phân tích lỗi sai học sinh)
                      </h3>
                    </div>
                  </div>

                  {atomQuestions.length === 0 ? (
                    <p style={{ color: 'var(--muted)' }}>
                      Chưa có câu hỏi đính kèm cho mã bài này.
                    </p>
                  ) : (
                    <div className="stack" style={{ gap: '12px' }}>
                      {atomQuestions.map((q, idx) => (
                        <div
                          key={q.id}
                          style={{
                            border: '1px solid var(--line)',
                            borderRadius: '8px',
                            padding: '14px 16px',
                            background: 'var(--cream)',
                          }}
                        >
                          <div
                            className="row-between"
                            style={{ marginBottom: '8px' }}
                          >
                            <div className="row-wrap">
                              <span className="va-badge va-badge-navy">
                                Câu {idx + 1} ({q.id})
                              </span>
                              <span className="va-badge va-badge-gold">
                                Độ khó: {q.do_kho} · DOK {q.dok}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="btn btn-cta"
                              style={{ minHeight: '32px', padding: '4px 12px', fontSize: '13px' }}
                              onClick={() => handleInsertQuestionToDoc(q, idx)}
                            >
                              + Đưa câu này vào bài soạn
                            </button>
                          </div>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: '15px',
                              marginBottom: '8px',
                            }}
                          >
                            {q.noi_dung}
                          </div>
                          <div
                            style={{
                              fontSize: '14px',
                              display: 'grid',
                              gap: '4px',
                            }}
                          >
                            <div>
                              <b style={{ color: 'var(--green)' }}>
                                ✓ Đáp án đúng:
                              </b>{' '}
                              {q.dap_an}
                            </div>
                            <div>
                              <b>Hướng dẫn giải:</b> {q.loi_giai}
                            </div>
                            {Array.isArray(q.nhieu) && q.nhieu.length > 0 && (
                              <div style={{ color: 'var(--gold-text)' }}>
                                <b>Phân tích bẫy/lỗi sai học sinh hay chọn:</b>{' '}
                                {q.nhieu
                                  .map((n) => `"${n.noiDung}" (${n.lyDo})`)
                                  .join(' | ')}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card stack" style={{ gap: '12px' }}>
                  <div>
                    <div className="va-crumb">
                      KỊCH BẢN HỎI ĐÁP SOCRATIC 4 BẬC (DÙNG KHI HỌC SINH TRẢ LỜI SAI TRÊN LỚP)
                    </div>
                    <h3 style={{ fontSize: '18px', fontWeight: 800 }}>
                      {atomSocratic.length} Kịch bản gợi mở từng bước giúp học sinh tự phát hiện lỗi sai
                    </h3>
                  </div>

                  {atomSocratic.length === 0 ? (
                    <p style={{ color: 'var(--muted)' }}>
                      Chưa có kịch bản Socratic cho bài học này.
                    </p>
                  ) : (
                    <div className="stack" style={{ gap: '12px' }}>
                      {atomSocratic.map((s, idx) => (
                        <div
                          key={s.id}
                          style={{
                            border: '1px solid var(--line)',
                            borderRadius: '8px',
                            padding: '14px 16px',
                            background: '#ffffff',
                          }}
                        >
                          <div
                            className="row-between"
                            style={{ marginBottom: '8px' }}
                          >
                            <span className="va-badge va-badge-gold">
                              Tình huống {idx + 1}: Khi HS trả lời sai &ldquo;
                              {s.wrong_answer}&rdquo;
                            </span>
                            <button
                              type="button"
                              className="btn"
                              style={{ minHeight: '32px', padding: '4px 12px', fontSize: '13px' }}
                              onClick={() => handleInsertSocraticToDoc(s, idx)}
                            >
                              + Đưa kịch bản này vào giáo án
                            </button>
                          </div>
                          <div
                            style={{
                              fontSize: '14px',
                              marginBottom: '8px',
                              color: 'var(--muted)',
                            }}
                          >
                            <b>Nguyên nhân gốc rễ học sinh hiểu nhầm:</b>{' '}
                            {s.misconception}
                          </div>
                          <div
                            style={{
                              display: 'grid',
                              gap: '6px',
                              fontSize: '14px',
                              background: 'var(--cream)',
                              padding: '10px 12px',
                              borderRadius: '6px',
                            }}
                          >
                            <div>
                              <b>Bước 1 (Khơi gợi):</b> {s.bac_1}
                            </div>
                            <div>
                              <b>Bước 2 (Định hướng):</b> {s.bac_2}
                            </div>
                            <div>
                              <b>Bước 3 (Phản biện):</b> {s.bac_3}
                            </div>
                            <div>
                              <b style={{ color: 'var(--navy)' }}>
                                Bước 4 (Chốt kiến thức):
                              </b>{' '}
                              {s.bac_4}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : !resource ? (
              <div
                className="doc-paper"
                style={{
                  padding: '44px 40px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '18px',
                }}
              >
                <div>
                  <div className="va-crumb">
                    BẢN XEM TRƯỚC CẤU TRÚC TÀI LIỆU
                  </div>
                  <h3
                    style={{
                      fontSize: '22px',
                      fontWeight: 800,
                      marginTop: '4px',
                    }}
                  >
                    {tool.name}
                  </h3>
                  <div
                    className="va-rule"
                    style={{ marginTop: '8px', marginBottom: '12px' }}
                  />
                  <p style={{ color: 'var(--muted)', fontSize: '15.5px' }}>
                    {tool.vietAnhValueAdd}
                  </p>
                </div>

                {loading ? (
                  <div
                    style={{
                      background: 'var(--cream)',
                      border: '2px solid var(--gold)',
                      borderRadius: '8px',
                      padding: '24px',
                      display: 'grid',
                      gap: '10px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '17px',
                        fontWeight: 800,
                        color: 'var(--navy)',
                      }}
                    >
                      ⏳ Hệ thống AI đang biên soạn học liệu cho bài{' '}
                      {selectedSbAtom?.code || atomId}...
                    </div>
                    <div style={{ fontSize: '14.5px', color: 'var(--muted)', lineHeight: 1.7 }}>
                      ✓ Bước 1: Đã nạp Yêu cầu cần đạt & Lỗi sai thường gặp của học sinh từ Kho Tri thức
                      <br />✓ Bước 2: Đã nạp {atomQuestions.length} câu hỏi đánh giá & {atomSocratic.length} kịch bản Socratic 4 bậc
                      <br />⚡ Bước 3: Model <b>{selectedModel}</b> đang viết chi tiết các hoạt động dạy học chuẩn {tool.moetStandardRef}...
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      background: 'var(--cream)',
                      border: '1px solid var(--line)',
                      borderRadius: '6px',
                      padding: '16px 20px',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        color: 'var(--navy)',
                        marginBottom: '8px',
                      }}
                    >
                      Các phần sẽ được AI biên soạn đầy đủ kèm dữ liệu thực của bài học:
                    </div>
                    <ol
                      style={{
                        margin: 0,
                        paddingLeft: '20px',
                        lineHeight: 1.7,
                      }}
                    >
                      {tool.outputSections.map((sec, idx) => (
                        <li key={idx} style={{ fontWeight: 600 }}>
                          {sec}
                        </li>
                      ))}
                      <li
                        style={{ fontWeight: 700, color: 'var(--gold-text)' }}
                      >
                        Phụ lục: {atomQuestions.length} Câu hỏi Đánh giá &{' '}
                        {atomSocratic.length} Kịch bản Socratic 4 Bậc của bài{' '}
                        {selectedSbAtom?.code}
                      </li>
                    </ol>
                  </div>
                )}

                <div className="row-between" style={{ paddingTop: '8px' }}>
                  <div style={{ fontSize: '14px', color: 'var(--muted)' }}>
                    Đang gắn với bài{' '}
                    <b>
                      {selectedSbAtom
                        ? `[${selectedSbAtom.code}] ${selectedSbAtom.title}`
                        : atomId}
                    </b>{' '}
                    (Khối {grade}).
                  </div>
                  <div className="row-wrap">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setRightTab('bank')}
                    >
                      Xem ngay {atomQuestions.length} câu hỏi có sẵn
                    </button>
                    <button
                      type="button"
                      className="btn btn-cta"
                      style={{ minHeight: '44px', paddingInline: '24px' }}
                      disabled={loading}
                      onClick={() => void handleGenerate()}
                    >
                      {loading
                        ? 'Đang biên soạn...'
                        : `Bấm để AI soạn ngay bài ${selectedSbAtom?.code || `Khối ${grade}`} →`}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="stack"
                style={{ maxWidth: '860px', margin: '0 auto', gap: '16px' }}
              >
                {/* 7 NÚT TINH CHỈNH NHANH 1-CLICK */}
                <div className="card no-print" style={{ padding: '14px 18px' }}>
                  <div
                    className="row-between"
                    style={{ marginBottom: '10px' }}
                  >
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 800,
                        color: 'var(--gold-text)',
                        textTransform: 'uppercase',
                      }}
                    >
                      Tinh chỉnh & Mở rộng nhanh bằng AI (1-Click):
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                      Bấm nút bất kỳ để AI viết lại hoặc bổ sung thêm phần phụ lục
                    </span>
                  </div>
                  <div className="row-wrap">
                    {POST_ACTIONS.map((item) => (
                      <button
                        key={item.action}
                        type="button"
                        className="cat-tab"
                        style={{
                          minHeight: '34px',
                          padding: '5px 11px',
                          fontSize: '13.5px',
                        }}
                        disabled={loading}
                        onClick={() => void handleGenerate(item.action)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* THANH ĐỐI CHIẾU CHUẨN BỘ GD&ĐT */}
                <div className="card no-print" style={{ padding: '14px 18px' }}>
                  <div className="row-wrap">
                    <strong style={{ fontSize: '13.5px', color: 'var(--navy)' }}>
                      Kiểm định quy chế ({tool.moetStandardRef}):
                    </strong>
                    {resource.moetComplianceChecklist.map((chk, idx) => (
                      <span
                        key={idx}
                        className="va-badge va-badge-green"
                        title={chk.note}
                      >
                        ✓ {chk.criterion}
                      </span>
                    ))}
                  </div>
                </div>

                {/* TỜ GIẤY A4 HIỂN THỊ KẾT QUẢ */}
                <div id="tool-studio-a4-preview" className="doc-paper">
                  <div className="doc-header">
                    <div>
                      <div
                        style={{
                          fontWeight: 800,
                          color: 'var(--navy)',
                          fontSize: '15px',
                        }}
                      >
                        TRƯỜNG TIỂU HỌC, THCS & THPT VIỆT ANH
                      </div>
                      <div
                        style={{
                          fontSize: '13.5px',
                          color: 'var(--muted)',
                          marginTop: '3px',
                        }}
                      >
                        Khối lớp: <b>Khối {resource.grade}</b> · Giáo viên:{' '}
                        <b>{resource.teacher.name}</b>
                      </div>
                    </div>
                    <div
                      style={{
                        textAlign: 'right',
                        display: 'flex',
                        gap: '8px',
                        flexWrap: 'wrap',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <span className="va-badge va-badge-navy">
                        {resource.modelUsed}
                      </span>
                      <span className="va-badge va-badge-gold">
                        {tool.moetStandardRef}
                      </span>
                    </div>
                  </div>

                  <h2
                    style={{
                      fontSize: '21px',
                      fontWeight: 800,
                      marginBottom: '14px',
                    }}
                  >
                    {resource.title}
                  </h2>

                  {resource.structuredSections.map((sec, idx) => (
                    <div key={idx} className="section-block">
                      {isEditingDoc ? (
                        <div className="stack" style={{ gap: '8px' }}>
                          <input
                            type="text"
                            value={sec.heading}
                            onChange={(e) =>
                              handleUpdateSection(idx, 'heading', e.target.value)
                            }
                            style={{ fontWeight: 800, fontSize: '16px' }}
                          />
                          <textarea
                            value={sec.body}
                            rows={Math.max(4, sec.body.split('\n').length)}
                            onChange={(e) =>
                              handleUpdateSection(idx, 'body', e.target.value)
                            }
                            style={{ fontFamily: 'inherit', lineHeight: 1.6 }}
                          />
                        </div>
                      ) : (
                        <>
                          <h3>{cleanPedagogicalText(sec.heading)}</h3>
                          <div className="whitespace-pre">
                            {cleanPedagogicalText(sec.body)}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
