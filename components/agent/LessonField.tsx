'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { LessonPicker } from './Cards';
import type { AtomLite } from './types';

/** Chọn MỘT bài bằng cách tìm theo tên (giáo viên không cần biết mã nguyên tử). */
export function LessonField({
  value,
  onChange,
  label = 'Bài dạy',
}: {
  value: AtomLite | null;
  onChange: (a: AtomLite | null) => void;
  label?: string;
}) {
  const [subject, setSubject] = useState('toan');
  const [grade, setGrade] = useState('10');

  if (value) {
    return (
      <div>
        <span className="ag-field-label">{label}</span>
        <div className="ag-card" style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>
            <span className="ag-lesson-title">{value.title}</span>
            <span className="ag-lesson-code">{value.code}</span>
          </span>
          <button type="button" className="ag-btn small" onClick={() => onChange(null)}>
            Đổi bài
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <span className="ag-field-label">{label}</span>
      <LessonPicker
        subject={subject}
        grade={grade}
        onSubject={setSubject}
        onGrade={setGrade}
        suggestions={[]}
        onPick={(a) => onChange(a)}
      />
    </div>
  );
}

/** Chọn NHIỀU bài (ví dụ đề kiểm tra nhiều bài): các bài đã chọn hiện thành thẻ, bấm để bỏ. */
export function LessonMultiField({
  value,
  onChange,
  label = 'Các bài trong phạm vi đề',
}: {
  value: AtomLite[];
  onChange: (a: AtomLite[]) => void;
  label?: string;
}) {
  const [subject, setSubject] = useState('toan');
  const [grade, setGrade] = useState('10');
  return (
    <div>
      <span className="ag-field-label">{label}</span>
      {value.length > 0 && (
        <div className="ag-chips" style={{ marginTop: 4 }} role="list" aria-label="Các bài đã chọn">
          {value.map((a) => (
            <span key={a.id} role="listitem" className="ag-chip" style={{ cursor: 'default' }}>
              {a.title}
              <button
                type="button"
                className="ag-link"
                style={{ textDecoration: 'none', minHeight: 24 }}
                aria-label={`Bỏ bài ${a.title}`}
                onClick={() => onChange(value.filter((x) => x.id !== a.id))}
              >
                <Icon name="x" size={16} />
              </button>
            </span>
          ))}
        </div>
      )}
      <LessonPicker
        subject={subject}
        grade={grade}
        onSubject={setSubject}
        onGrade={setGrade}
        suggestions={[]}
        onPick={(a) => {
          if (!value.some((x) => x.id === a.id)) onChange([...value, a]);
        }}
      />
      <p className="ag-note">Bấm vào một bài trong danh sách để thêm. Có thể chọn nhiều bài.</p>
    </div>
  );
}
