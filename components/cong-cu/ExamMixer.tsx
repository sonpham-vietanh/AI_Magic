'use client';

import { useMemo, useState } from 'react';
import type { SupabaseAtom } from '@/lib/supabase';
import { Icon } from '@/components/ui/icons';
import { Modal } from './Modal';
import { SearchIcon } from './shared';

export function ExamMixer({
  atoms,
  selected,
  onSelected,
  onRun,
  onClose,
}: {
  atoms: SupabaseAtom[];
  selected: string[];
  onSelected: (ids: string[]) => void;
  onRun: () => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return atoms;
    return atoms.filter((a) => `${a.title} ${a.code} ${a.chapter}`.toLowerCase().includes(q));
  }, [atoms, filter]);

  return (
    <Modal
      size="md"
      eyebrow="Máy trộn đề"
      title="Chọn các bài đưa vào đề"
      onClose={onClose}
      footer={
        <>
          <span className="cc-foot-count" role="status">
            Đã chọn {selected.length} bài
          </span>
          <button
            type="button"
            className="ag-btn primary"
            disabled={selected.length === 0}
            onClick={onRun}
          >
            <Icon name="exam" size={20} />
            Trộn đề và lập ma trận
          </button>
        </>
      }
    >
      <p className="ag-note cc-mixer-note">
        Hệ thống rút câu hỏi thật của các bài đã chọn để lập ma trận Thông tư 22, đề kiểm tra và đáp án.
      </p>
      <div className="cc-search">
        <label className="ag-field-label" htmlFor="cc-mixer-filter">
          Lọc trong danh sách
        </label>
        <div className="cc-search-box">
          <SearchIcon />
          <input
            id="cc-mixer-filter"
            type="search"
            className="ag-field"
            placeholder="Tên bài hoặc chương"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      <ul className="cc-mixer-list">
        {shown.length === 0 && <li className="ag-empty-note cc-pad">Không có bài phù hợp.</li>}
        {shown.map((a) => {
          const checked = selected.includes(a.id);
          return (
            <li key={a.id}>
              <label className={`cc-mixer-row${checked ? ' checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    onSelected(
                      e.target.checked ? [...selected, a.id] : selected.filter((id) => id !== a.id),
                    )
                  }
                />
                <span className="cc-mixer-text">
                  <span className="ag-lesson-title">{a.title}</span>
                  <span className="ag-lesson-code">{a.chapter}</span>
                </span>
                {a.hasFactoryPackage && <span className="ag-status ok">Có gói gốc</span>}
              </label>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
