import type { SupabaseQuestion, SupabaseSocratic } from '@/lib/supabase';

/** Kho câu hỏi và kịch bản Socratic có sẵn của bài: thêm vào bản soạn bằng 1 cú bấm. */
export function QuestionBank({
  questions,
  socratic,
  onInsertQuestion,
  onInsertSocratic,
}: {
  questions: SupabaseQuestion[];
  socratic: SupabaseSocratic[];
  onInsertQuestion: (q: SupabaseQuestion, idx: number) => void;
  onInsertSocratic: (s: SupabaseSocratic, idx: number) => void;
}) {
  return (
    <div>
      <h3 className="md-sec-title">Câu hỏi có sẵn ({questions.length})</h3>
      {questions.length === 0 ? (
        <p className="md-muted">Bài này chưa có câu hỏi đính kèm.</p>
      ) : (
        questions.map((q, idx) => (
          <article key={q.id} className="md-q">
            <div className="md-q-head">
              <span className="md-tag">
                Câu {idx + 1} · Độ khó {q.do_kho} · DOK {q.dok}
              </span>
              <button
                type="button"
                className="ag-btn small"
                onClick={() => onInsertQuestion(q, idx)}
              >
                Đưa vào bài soạn
              </button>
            </div>
            <p className="md-q-text">{q.noi_dung}</p>
            <p className="md-q-line">
              <b>Đáp án:</b> {q.dap_an}
            </p>
            <p className="md-q-line">
              <b>Lời giải:</b> {q.loi_giai}
            </p>
            {Array.isArray(q.nhieu) && q.nhieu.length > 0 && (
              <p className="md-q-line warn">
                <b>Lỗi học sinh hay chọn:</b>{' '}
                {q.nhieu.map((n) => `"${n.noiDung}" (${n.lyDo})`).join(' | ')}
              </p>
            )}
          </article>
        ))
      )}

      <h3 className="md-sec-title">Kịch bản hỏi gợi mở khi học sinh trả lời sai ({socratic.length})</h3>
      {socratic.length === 0 ? (
        <p className="md-muted">Bài này chưa có kịch bản gợi mở.</p>
      ) : (
        socratic.map((s, idx) => (
          <article key={s.id} className="md-q">
            <div className="md-q-head">
              <span className="md-tag">
                Tình huống {idx + 1}: HS trả lời &ldquo;{s.wrong_answer}&rdquo;
              </span>
              <button
                type="button"
                className="ag-btn small"
                onClick={() => onInsertSocratic(s, idx)}
              >
                Đưa vào giáo án
              </button>
            </div>
            <p className="md-q-line">
              <b>Học sinh hiểu nhầm:</b> {s.misconception}
            </p>
            <p className="md-q-line">
              <b>Bước 1, khơi gợi:</b> {s.bac_1}
            </p>
            <p className="md-q-line">
              <b>Bước 2, định hướng:</b> {s.bac_2}
            </p>
            <p className="md-q-line">
              <b>Bước 3, phản biện:</b> {s.bac_3}
            </p>
            <p className="md-q-line">
              <b>Bước 4, chốt kiến thức:</b> {s.bac_4}
            </p>
          </article>
        ))
      )}
    </div>
  );
}
