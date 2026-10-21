'use client';

import { useEffect, useState } from 'react';
import { cleanPedagogicalText } from '@/lib/text/clean';
import type { ClassProfile, GeneratedResource, KnowledgeNode } from '@/lib/types';

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
  const [history, setHistory] = useState<
    { role: 'teacher' | 'assistant'; text: string; mode?: string }[]
  >([
    {
      role: 'assistant',
      text: 'Chào thầy/cô. Tôi là Trợ lý Chuyên môn Trường Việt Anh. Thầy/cô cần tra cứu quy chế Công văn 5512, Thông tư 22/27, gợi ý hoạt động khởi động hay cách phân hóa bài tập cho lớp đang dạy?',
    },
  ]);
  const [suggestions, setSuggestions] = useState<string[]>([
    'Gợi ý hoạt động khởi động 5 phút đầu giờ tạo hứng thú',
    'Cách giao bài phân hóa cho nhóm học sinh Cơ bản và Nâng cao',
    'Gợi ý kết nối bài học này với môn học khác trong tuần',
    'Cách viết nhận xét học bạ cuối kỳ theo Thông tư 22',
  ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sendQuestion = async (qText?: string) => {
    const promptText = (qText ?? question).trim();
    if (!promptText || loading) return;

    setHistory((prev) => [...prev, { role: 'teacher', text: promptText }]);
    if (!qText) setQuestion('');
    setLoading(true);

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
            ? 'Trợ lý đang quá tải, thầy/cô vui lòng thử lại sau ít phút.'
            : res.status === 401
              ? 'Phiên làm việc đã hết hạn, vui lòng đăng nhập lại.'
              : data.error || `Trợ lý gặp lỗi (${res.status}), vui lòng thử lại sau.`;
        setHistory((prev) => [...prev, { role: 'assistant', text: msg }]);
        return;
      }
      setHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.reply || 'Đã tiếp nhận câu hỏi chuyên môn của thầy/cô.',
          mode: data.mode,
        },
      ]);
      if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setSuggestions(data.suggestions);
      }
    } catch {
      setHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'Không kết nối được máy chủ, vui lòng thử lại.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Trợ lý Chuyên môn Việt Anh"
        className="va-assistant-panel"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '88vh',
          background: 'var(--cream)',
          border: '1px solid var(--line)',
          borderRadius: '10px',
          boxShadow: '0 24px 60px rgba(13, 14, 43, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="studio-header">
          <div>
            <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--cta)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              TRƯỜNG VIỆT ANH · HỖ TRỢ SƯ PHẠM TRỰC TUYẾN
            </div>
            <h2 style={{ color: '#ffffff', fontSize: '19px', fontWeight: 800, marginTop: '2px' }}>
              Trợ lý Chuyên môn Việt Anh
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.76)', fontSize: '13.5px', marginTop: '2px' }}>
              {classProfile ? `Lớp ${classProfile.className} (${classProfile.campus})` : 'Toàn trường'}
              {primaryNode ? ` · Bài: ${primaryNode.title}` : ''}
            </p>
          </div>
          <button
            type="button"
            className="btn"
            style={{
              background: 'rgba(255,255,255,0.12)',
              color: '#ffffff',
              borderColor: 'rgba(255,255,255,0.25)',
            }}
            onClick={onClose}
          >
            Đóng
          </button>
        </header>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {history.map((item, idx) => (
            <div
              key={idx}
              style={{
                padding: '14px 16px',
                borderRadius: '8px',
                background: item.role === 'teacher' ? 'var(--navy)' : '#ffffff',
                border: item.role === 'teacher' ? 'none' : '1px solid var(--line)',
                borderLeft: item.role === 'assistant' ? '4px solid var(--gold)' : 'none',
                color: item.role === 'teacher' ? '#ffffff' : 'var(--ink)',
                marginLeft: item.role === 'teacher' ? '48px' : '0',
                marginRight: item.role === 'assistant' ? '24px' : '0',
                whiteSpace: 'pre-wrap',
                fontSize: '15.5px',
                lineHeight: 1.6,
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  fontSize: '12.5px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: item.role === 'teacher' ? 'var(--cta)' : 'var(--gold-text)',
                  marginBottom: '4px',
                }}
              >
                {item.role === 'teacher' ? 'Giáo viên' : 'Trợ lý Chuyên môn Việt Anh'}
              </div>
              <div>{cleanPedagogicalText(item.text)}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            padding: '14px 22px 18px',
            background: '#ffffff',
            borderTop: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div className="row-wrap">
            {suggestions.map((sug) => (
              <button
                key={sug}
                type="button"
                className="va-badge va-badge-gold"
                style={{ cursor: 'pointer', padding: '5px 10px', fontSize: '13px' }}
                onClick={() => void sendQuestion(sug)}
              >
                {sug}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendQuestion();
            }}
            className="va-assistant-form"
            style={{ display: 'flex', gap: '10px' }}
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Nhập câu hỏi về phương pháp dạy học, Công văn 5512, Thông tư 22..."
            />
            <button type="submit" className="btn btn-cta" disabled={loading}>
              {loading ? 'Đang xử lý...' : 'Gửi câu hỏi'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
