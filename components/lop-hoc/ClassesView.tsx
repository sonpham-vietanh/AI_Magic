'use client';

import { fetchJson, friendlyError } from '@/lib/ui/fetchJson';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { CAMPUS_LIST, CLASS_PROFILES } from '@/lib/classes';
import { mergeNotes, type ClassNoteItem } from '@/lib/ui/notes';

const LS_KEY = 'va-class-notes-v1';
const MAX_NOTE = 2000;

function readLocalNotes(classId: string): ClassNoteItem[] {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || '{}') as Record<string, ClassNoteItem[]>;
    return Array.isArray(all[classId]) ? all[classId] : [];
  } catch {
    return [];
  }
}

function writeLocalNotes(classId: string, notes: ClassNoteItem[]) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || '{}') as Record<string, ClassNoteItem[]>;
    all[classId] = notes.slice(-50);
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* bỏ qua */
  }
}

const LEARNING_STYLE_LABELS: Record<string, string> = {
  thi_giac: 'Học qua hình ảnh',
  thinh_giac: 'Học qua nghe, thảo luận',
  van_dong: 'Học qua vận động',
  doc_viet: 'Học qua đọc, viết',
};

const TIER_NAME: Record<string, string> = {
  co_ban: 'Cơ bản',
  chuan: 'Đạt chuẩn',
  nang_cao: 'Nâng cao',
};

const CAMPUS_SHORT: Record<string, string> = {
  'Cơ sở AHT (Gò Vấp)': 'AHT · Gò Vấp',
  'Cơ sở BT (Bình Tân)': 'BT · Bình Tân',
};

function formatWhen(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function ClassesView() {
  const [campusFilter, setCampusFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>(CLASS_PROFILES[0].id);
  const [teacherNote, setTeacherNote] = useState('');
  const [customNotes, setCustomNotes] = useState<Record<string, ClassNoteItem[]>>({});
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState('');
  const [saveBanner, setSaveBanner] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);

  const grades = Array.from(new Set(CLASS_PROFILES.map((c) => String(c.grade)))).sort(
    (a, b) => Number(a) - Number(b),
  );
  const filteredClasses = CLASS_PROFILES.filter(
    (c) =>
      (campusFilter === 'all' || c.campus === campusFilter) &&
      (gradeFilter === 'all' || String(c.grade) === gradeFilter),
  );
  const activeClass =
    CLASS_PROFILES.find((c) => c.id === selectedClassId) || filteredClasses[0] || CLASS_PROFILES[0];
  const activeClassId = activeClass.id;

  useEffect(() => {
    const ctrl = new AbortController();
    setNotesLoading(true);
    setNotesError('');
    fetchJson<{ notes?: { id: string; note: string; createdAt?: string }[] }>(
      `/api/classes?classId=${encodeURIComponent(activeClassId)}`,
      { signal: ctrl.signal },
    )
      .then((data) => {
        const server = (data.notes || []).map((n) => ({ id: n.id, note: n.note, createdAt: n.createdAt }));
        setCustomNotes((prev) => ({
          ...prev,
          [activeClassId]: mergeNotes(server, [
            ...readLocalNotes(activeClassId),
            ...(prev[activeClassId] || []),
          ]),
        }));
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setNotesError(
          `Chưa tải được ghi chú đã lưu (${friendlyError(err, 'lỗi kết nối')}). Đang hiện ghi chú lưu tạm trên trình duyệt.`,
        );
        setCustomNotes((prev) => ({
          ...prev,
          [activeClassId]: mergeNotes(prev[activeClassId] || [], readLocalNotes(activeClassId)),
        }));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setNotesLoading(false);
      });
    return () => ctrl.abort();
  }, [activeClassId]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const noteText = teacherNote.trim();
    if (!noteText || noteText.length > MAX_NOTE) return;

    const localNote: ClassNoteItem = {
      id: `local-${Date.now()}`,
      note: noteText,
      createdAt: new Date().toISOString(),
    };
    setCustomNotes((prev) => ({
      ...prev,
      [activeClass.id]: [...(prev[activeClass.id] || []), localNote],
    }));
    writeLocalNotes(activeClass.id, [...readLocalNotes(activeClass.id), localNote]);
    setTeacherNote('');
    setSaveFailed(false);
    setSaveBanner(`Đã ghi nhận ghi chú cho lớp ${activeClass.className}.`);

    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_note', classId: activeClass.id, note: noteText }),
      });
      if (res.ok) {
        writeLocalNotes(
          activeClass.id,
          readLocalNotes(activeClass.id).filter((n) => n.id !== localNote.id),
        );
        setSaveBanner(`Đã lưu lên máy chủ cho lớp ${activeClass.className}.`);
      } else {
        setSaveFailed(true);
        setSaveBanner(
          res.status === 429
            ? 'Máy chủ đang bận, ghi chú mới chỉ lưu tạm trên trình duyệt. Cô/thầy thử lại sau.'
            : 'Chưa gửi được lên máy chủ, ghi chú mới chỉ lưu tạm trên trình duyệt.',
        );
      }
    } catch {
      setSaveFailed(true);
      setSaveBanner('Không kết nối được máy chủ, ghi chú mới chỉ lưu tạm trên trình duyệt.');
    }
  };

  const campuses = CAMPUS_LIST.filter((cp) => filteredClasses.some((c) => c.campus === cp));
  const notes = customNotes[activeClass.id] || [];
  const over = teacherNote.length > MAX_NOTE;
  const canSave = teacherNote.trim().length > 0 && !over;

  return (
    <div className="hs-layout">
      <aside className="hs-side" aria-label="Danh sách lớp">
        <div className="hs-filters">
          <div className="hs-seg" role="group" aria-label="Lọc theo cơ sở">
            <button type="button" className="hs-pill" aria-pressed={campusFilter === 'all'} onClick={() => setCampusFilter('all')}>
              Mọi cơ sở
            </button>
            {CAMPUS_LIST.map((cp) => (
              <button
                key={cp}
                type="button"
                className="hs-pill"
                aria-pressed={campusFilter === cp}
                onClick={() => setCampusFilter(cp)}
              >
                {CAMPUS_SHORT[cp] || cp}
              </button>
            ))}
          </div>
          <label htmlFor="hs-grade" className="ag-field-label" style={{ margin: 0 }}>
            Khối
          </label>
          <select id="hs-grade" className="ag-field" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
            <option value="all">Mọi khối</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                Khối {g}
              </option>
            ))}
          </select>
        </div>

        {filteredClasses.length === 0 && <p className="hs-empty">Không có lớp phù hợp.</p>}
        {campuses.map((cp) => (
          <div key={cp}>
            <div className="hs-group-title">{CAMPUS_SHORT[cp] || cp}</div>
            <div className="hs-list">
              {filteredClasses
                .filter((c) => c.campus === cp)
                .map((cls) => (
                  <button
                    key={cls.id}
                    type="button"
                    className="hs-item"
                    aria-current={cls.id === activeClass.id}
                    onClick={() => {
                      setSelectedClassId(cls.id);
                      setSaveBanner('');
                    }}
                  >
                    <span className="hs-item-top">
                      <strong>Lớp {cls.className}</strong>
                      <span className="ag-note" style={{ margin: 0 }}>
                        {cls.studentCount} học sinh
                      </span>
                    </span>
                    <span className="hs-item-sub">GVCN: {cls.homeroomTeacher.name}</span>
                    <span className="hs-mini" aria-hidden="true">
                      {cls.groups.map((g) => (
                        <i key={g.tier} className={`hs-t-${g.tier}`} style={{ width: `${g.percentage}%` }} />
                      ))}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </aside>

      <div className="hs-main">
        <section className="ag-card hs-card" style={{ marginTop: 0 }}>
          <div className="hs-head">
            <div>
              <h2>Lớp {activeClass.className}</h2>
              <p>
                {CAMPUS_SHORT[activeClass.campus] || activeClass.campus} · GVCN {activeClass.homeroomTeacher.name} ·{' '}
                {activeClass.studentCount} học sinh
              </p>
            </div>
            <Link href={`/?classId=${encodeURIComponent(activeClass.id)}`} className="ag-btn primary">
              <Icon name="sparkles" size={18} aria-hidden="true" />
              Soạn bài cho lớp này
            </Link>
          </div>
          <p className="hs-summary" style={{ marginTop: 14 }}>
            {activeClass.classDynamicSummary}
          </p>
          <div className="hs-facts">
            <div className="hs-fact">
              <span>Trình độ tiếng Anh</span>
              <b>{activeClass.englishProficiencyLevel}</b>
            </div>
            <div className="hs-fact">
              <span>Tập trung tốt khoảng</span>
              <b>{activeClass.attentionSpanMinutes} phút mỗi hoạt động</b>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <span className="ag-field-label">Các em thích</span>
            <ul className="ag-chips" style={{ listStyle: 'none', padding: 0, margin: '4px 0 0' }}>
              {activeClass.dominantInterests.map((it) => (
                <li key={it} className="ag-chip" style={{ cursor: 'default', background: 'var(--gold-soft)' }}>
                  {it}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="ag-card hs-card" style={{ marginTop: 0 }}>
          <h3>Ba nhóm năng lực</h3>
          {activeClass.groups.map((g) => (
            <div key={g.tier} className="hs-tier">
              <div className="hs-tier-row">
                <strong>{TIER_NAME[g.tier] || g.label}</strong>
                <span>
                  {g.count} học sinh · {g.percentage}%
                </span>
              </div>
              <div
                className="hs-track"
                role="img"
                aria-label={`${TIER_NAME[g.tier] || g.label}: ${g.count} học sinh, ${g.percentage} phần trăm`}
              >
                <i className={`hs-t-${g.tier}`} style={{ width: `${g.percentage}%` }} />
              </div>
              <div className="hs-tier-hint">{g.label.replace(/^Nhóm [^(]*\(/, '').replace(/\)$/, '')}</div>
              <details>
                <summary>Đặc điểm và cách giao bài</summary>
                <h4>Đặc điểm</h4>
                <ul>
                  {g.characteristics.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
                <h4>Cách giao bài phù hợp</h4>
                <ul>
                  {g.recommendedStrategies.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </section>

        <section className="ag-card hs-card" style={{ marginTop: 0 }}>
          <h3>Học sinh cần hỗ trợ thêm ({activeClass.specialSupportStudents.length})</h3>
          {activeClass.specialSupportStudents.length === 0 ? (
            <p className="hs-empty" style={{ padding: 0 }}>
              Lớp chưa có em nào cần lưu ý đặc biệt.
            </p>
          ) : (
            <ul className="hs-support">
              {activeClass.specialSupportStudents.map((st) => (
                <li key={st.studentCode}>
                  <span className="hs-code">{st.studentCode}</span>
                  <span className="hs-style">{LEARNING_STYLE_LABELS[st.learningStyle] || st.learningStyle}</span>
                  <p>
                    <b>Điểm mạnh:</b> {st.strengths}
                  </p>
                  <p>
                    <b>Khó khăn:</b> {st.supportNeeded}
                  </p>
                  <p className="hs-fix">Cách hỗ trợ: {st.pedagogicalAccommodation}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ag-card hs-card" style={{ marginTop: 0 }}>
          <h3>Ghi chú của chủ nhiệm</h3>
          <form className="hs-form" onSubmit={(e) => void handleAddNote(e)}>
            <label htmlFor="hs-note" className="ag-field-label">
              Cô/thầy nhận xét tình hình lớp. Trợ lý sẽ lưu ý khi soạn bài.
            </label>
            <textarea
              id="hs-note"
              className="ag-field"
              rows={3}
              value={teacherNote}
              onChange={(e) => setTeacherNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSave) {
                  e.preventDefault();
                  void handleAddNote(e);
                }
              }}
              placeholder="Ví dụ: Tuần này lớp làm việc nhóm tốt, cần thêm bài tập vận dụng."
              aria-describedby="hs-note-count"
            />
            <div className="hs-form-foot">
              <span id="hs-note-count" className={`hs-count ${over ? 'over' : ''}`}>
                {teacherNote.length}/{MAX_NOTE} ký tự
              </span>
              <button type="submit" className="ag-btn dark" disabled={!canSave}>
                Lưu ghi chú
              </button>
            </div>
          </form>

          <div aria-live="polite">
            {saveBanner && (
              <div className={`ag-alert ${saveFailed ? 'warn' : 'ok'}`} role={saveFailed ? 'alert' : 'status'}>
                <Icon name={saveFailed ? 'alert' : 'check'} size={18} aria-hidden="true" />
                <span>{saveBanner}</span>
              </div>
            )}
            {notesLoading && (
              <div role="status" className="ag-note">
                Đang tải ghi chú đã lưu...
              </div>
            )}
            {notesError && (
              <div className="ag-alert warn" role="alert">
                <Icon name="alert" size={18} aria-hidden="true" />
                <span>{notesError}</span>
              </div>
            )}
          </div>

          {notes.length === 0 && !notesLoading ? (
            <p className="hs-empty">Chưa có ghi chú nào cho lớp này.</p>
          ) : (
            <ol className="hs-timeline" aria-label="Các ghi chú">
              {[...notes].reverse().map((n) => {
                const temp = n.id.startsWith('local-');
                return (
                  <li key={n.id} className={temp ? 'temp' : ''}>
                    <div className="hs-note-meta">
                      {formatWhen(n.createdAt) && <span>{formatWhen(n.createdAt)}</span>}
                      <span className={`ag-status ${temp ? 'draft' : 'ok'}`}>
                        {temp ? 'Chỉ lưu tạm trên trình duyệt' : 'Đã lưu trên máy chủ'}
                      </span>
                    </div>
                    <p className="hs-note-text">{n.note}</p>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
