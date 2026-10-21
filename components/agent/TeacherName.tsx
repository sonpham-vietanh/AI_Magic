'use client';

import { useEffect, useState } from 'react';
import { readActor, writeActor } from '@/lib/agent/actor';

/** Tên cô/thầy lưu ở localStorage 'va.actor'. `ready` là false cho tới khi đọc xong (tránh nhấp nháy). */
export function useActor(): [string, (v: string) => void, boolean] {
  const [name, setName] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setName(readActor());
    setReady(true);
  }, []);
  const save = (v: string) => {
    const clean = v.trim().slice(0, 100);
    setName(clean);
    writeActor(clean);
  };
  return [name, save, ready];
}

/** Ô nhỏ hỏi một lần "Tên cô/thầy"; đã có tên thì hiện gọn kèm nút Sửa. */
export function TeacherName({ value, onSave, ready }: { value: string; onSave: (v: string) => void; ready: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  if (!ready) return null;

  if (value && !editing) {
    return (
      <div className="ag-who">
        <span>
          Cô/thầy: <strong>{value}</strong>
        </span>
        <button
          type="button"
          className="ag-link"
          aria-label="Sửa tên cô/thầy"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
        >
          Sửa
        </button>
      </div>
    );
  }

  return (
    <form
      className="ag-who ag-who-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        onSave(draft);
        setEditing(false);
      }}
    >
      <label htmlFor="ag-who-input">Tên cô/thầy</label>
      <input
        id="ag-who-input"
        className="ag-field"
        value={draft}
        maxLength={100}
        autoComplete="name"
        placeholder="Ví dụ: Cô Lan"
        onChange={(e) => setDraft(e.target.value)}
      />
      <button type="submit" className="ag-btn small" disabled={!draft.trim()}>
        Lưu
      </button>
      {editing && (
        <button type="button" className="ag-link" onClick={() => setEditing(false)}>
          Huỷ
        </button>
      )}
    </form>
  );
}
