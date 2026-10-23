'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import '@/app/ui-modal.css';
import { cleanPedagogicalText } from '@/lib/text/clean';
import { Icon } from '@/components/ui/icons';
import { formatApiError } from '@/lib/ui/soanBai';
import { useDialog } from '@/components/studio/useDialog';
import type { ClassProfile, GeneratedResource, KnowledgeNode } from '@/lib/types';

type Msg = {
  role: 'teacher' | 'assistant';
  text: string;
  mode?: string;
  error?: boolean;
};

const WELCOME: Msg = {
  role: 'assistant',
  text: 'Chào cô/thầy. Cô/thầy cần hỏi về quy chế (Công văn 5512, Thông tư 22), hoạt động khởi động hay cách phân hóa bài tập cho lớp đang dạy?',
};

const DEFAULT_SUGGESTIONS = [
  'Gợi ý hoạt động khởi động 5 phút đầu giờ',
  'Cách giao bài phân hóa cho nhóm Cơ bản và Nâng cao',
  'Kết nối bài học này với môn học khác',
  'Cách viết nhận xét học bạ cuối kỳ theo Thông tư 22',
];

export function AssistantDrawer({
  open,
  onClose,
  classProfile,
  primaryNode,
  currentResource,
}: {
  open: boolean;
  onClose: () => void;
  classProfile?: ClassProfile;
  primaryNode?: KnowledgeNode;
  currentResource?: GeneratedResource | null;
}) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Msg[]>([WELCOME]);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const handleEscape = useCallback(() => {
    onCloseRef.current();
  }, []);
  useDialog(dialogRef, open, handleEscape);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, loading, open]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [question, open]);

  if (!open) return null;

  const sendQuestion = async (qText?: string) => {
    const promptText = (qText ?? question).trim();
    if (!promptText || loading) return;

    setHistory((prev) => [...prev, { role: 'teacher', text: promptText }]);
    if (!qText) setQuestion('');
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          question: promptText,
          classId: classProfile?.id,
          knowledgeNodeId: primaryNode?.id,
          currentResource: currentResource || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reply?: string;
        suggestions?: string[];
        mode?: string;
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        const msg =
          res.status === 429
            ? 'Trợ lý đang quá tải, cô/thầy vui lòng thử lại sau ít phút.'
            : res.status === 401
              ? 'Phiên làm việc đã hết hạn, vui lòng tải lại trang rồi thử lại.'
              : formatApiError(res.status, res.status >= 500 ? undefined : data.error);
        setHistory((prev) => [...prev, { role: 'assistant', text: msg, error: true }]);
        return;
      }
      setHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.reply || 'Đã tiếp nhận câu hỏi chuyên môn của cô/thầy.',
          mode: data.mode,
        },
      ]);
      if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setSuggestions(data.suggestions);
      }
    } catch {
      if (ctrl.signal.aborted) return;
      setHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'Cô/thầy kiểm tra kết nối mạng rồi hỏi lại giúp em nhé.',
          error: true,
        },
      ]);
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setLoading(false);
    }
  };

  const scope = [
    classProfile ? `Lớp ${classProfile.className}` : 'Toàn trường',
    primaryNode ? primaryNode.title : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="md-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="md-assist-title"
        className="md-assist"
        tabIndex={-1}
      >
        <header className="md-assist-head">
          <div style={{ minWidth: 0 }}>
            <h2 id="md-assist-title">Hỏi đáp chuyên môn</h2>
            <p>{scope}</p>
          </div>
          <button
            type="button"
            className="ag-iconbtn"
            aria-label="Đóng hỏi đáp"
            title="Đóng (Esc)"
            onClick={onClose}
          >
            <Icon name="x" />
          </button>
        </header>

        <div
          className="md-thread"
          ref={threadRef}
          role="log"
          aria-live="polite"
          aria-label="Cuộc trò chuyện"
        >
          {history.map((item, idx) =>
            item.role === 'teacher' ? (
              <div key={idx} className="ag-msg user">
                <div className="ag-bubble">{item.text}</div>
              </div>
            ) : (
              <div
                key={idx}
                className={`ag-msg${item.error ? ' md-msg-err' : ''}`}
              >
                <div className="ag-avatar">
                  <img src="/logo-crest.webp" alt="" />
                </div>
                <div className="ag-body">
                  <div className="ag-text">{cleanPedagogicalText(item.text)}</div>
                </div>
              </div>
            ),
          )}
          {loading && (
            <div className="ag-msg">
              <div className="ag-avatar">
                <img src="/logo-crest.webp" alt="" />
              </div>
              <div className="ag-body">
                <div className="md-typing" role="status">
                  <span className="ag-spin" aria-hidden="true" />
                  Đang trả lời...
                </div>
              </div>
            </div>
          )}
        </div>

        {suggestions.length > 0 && (
          <div className="ag-chips" aria-label="Câu hỏi gợi ý">
            {suggestions.map((sug) => (
              <button
                key={sug}
                type="button"
                className="ag-chip"
                disabled={loading}
                onClick={() => void sendQuestion(sug)}
              >
                {sug}
              </button>
            ))}
          </div>
        )}

        <form
          className="ag-composer-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            void sendQuestion();
          }}
        >
          <div className="ag-composer">
            <label htmlFor="md-assist-q" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
              Câu hỏi của cô/thầy
            </label>
            <textarea
              id="md-assist-q"
              ref={inputRef}
              rows={1}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void sendQuestion();
                }
              }}
              placeholder="Hỏi về phương pháp dạy, quy chế..."
            />
            <button
              type="submit"
              className="ag-send"
              aria-label="Gửi câu hỏi"
              disabled={loading || !question.trim()}
            >
              <Icon name="send" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
