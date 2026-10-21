'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { CAMPUS_LIST, CLASS_PROFILES } from '@/lib/classes';
import { mergeNotes, type ClassNoteItem } from '@/lib/ui/notes';

const LS_KEY = 'va-class-notes-v1';

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
  thi_giac: 'Thị giác (Sơ đồ, hình ảnh)',
  thinh_giac: 'Thính giác (Thảo luận, nghe giảng)',
  van_dong: 'Vận động (Thực hành, mô hình)',
  doc_viet: 'Đọc - Viết (Ghi chép, tài liệu)',
};

export default function ClassProfilesPage() {
  const [campusFilter, setCampusFilter] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>(
    CLASS_PROFILES[0].id,
  );
  const [teacherNote, setTeacherNote] = useState<string>('');
  const [customNotes, setCustomNotes] = useState<Record<string, ClassNoteItem[]>>({});
  const [notesLoading, setNotesLoading] = useState<boolean>(false);
  const [notesError, setNotesError] = useState<string>('');
  const [saveBanner, setSaveBanner] = useState<string>('');
  const [saveFailed, setSaveFailed] = useState<boolean>(false);

  const filteredClasses = CLASS_PROFILES.filter(
    (c) => campusFilter === 'all' || c.campus === campusFilter,
  );
  const activeClass =
    CLASS_PROFILES.find((c) => c.id === selectedClassId) ||
    filteredClasses[0] ||
    CLASS_PROFILES[0];

  const activeClassId = activeClass.id;
  useEffect(() => {
    const ctrl = new AbortController();
    setNotesLoading(true);
    setNotesError('');
    fetch(`/api/classes?classId=${encodeURIComponent(activeClassId)}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { notes?: { id: string; note: string; createdAt?: string }[] };
      })
      .then((data) => {
        const server = (data.notes || []).map((n) => ({
          id: n.id,
          note: n.note,
          createdAt: n.createdAt,
        }));
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
          `Không tải được ghi chú đã lưu (${err instanceof Error ? err.message : 'lỗi'}). Đang hiển thị ghi chú lưu tạm trên trình duyệt.`,
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

  const totalStudentsAll = CLASS_PROFILES.reduce((acc, c) => acc + c.studentCount, 0);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const noteText = teacherNote.trim();
    if (!noteText) return;

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
    setSaveBanner(`Đã lưu ghi chú sư phạm cho Lớp ${activeClass.className}.`);

    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_note',
          classId: activeClass.id,
          note: noteText,
        }),
      });
      if (res.ok) {
        writeLocalNotes(
          activeClass.id,
          readLocalNotes(activeClass.id).filter((n) => n.id !== localNote.id),
        );
      } else {
        setSaveFailed(true);
        setSaveBanner(
          res.status === 429
            ? 'Máy chủ đang bận, ghi chú mới chỉ lưu tạm trên trình duyệt. Vui lòng thử lại sau.'
            : 'Không đồng bộ được ghi chú lên máy chủ, ghi chú mới chỉ lưu tạm trên trình duyệt.',
        );
      }
    } catch {
      setSaveFailed(true);
      setSaveBanner(
        'Không kết nối được máy chủ, ghi chú mới chỉ lưu tạm trên trình duyệt.',
      );
    }
  };

  return (
    <Shell
      title="Hồ sơ Lớp học (Class DNA)"
      subtitle="Quản lý đặc điểm nhận thức, phân bổ 3 nhóm năng lực và lưu ý hỗ trợ cá nhân hóa cho từng lớp tại Cơ sở AHT & Cơ sở BT."
      rightActions={
        <Link
          href={`/?classId=${activeClass.id}`}
          className="btn btn-cta"
        >
          Áp dụng Lớp {activeClass.className} vào Kho Công cụ →
        </Link>
      }
    >
      <div className="stack" style={{ gap: '20px' }}>
        {/* THANH BỘ LỌC CƠ SỞ & THỐNG KÊ NHANH */}
        <section className="va-card-accent">
          <div className="row-between">
            <div className="row-wrap">
              <button
                type="button"
                className={`va-tab ${campusFilter === 'all' ? 'active' : ''}`}
                onClick={() => setCampusFilter('all')}
              >
                <span>Tất cả cơ sở</span>
                <span className="va-tab-count">{CLASS_PROFILES.length} lớp</span>
              </button>
              {CAMPUS_LIST.map((cp) => {
                const count = CLASS_PROFILES.filter((c) => c.campus === cp).length;
                return (
                  <button
                    key={cp}
                    type="button"
                    className={`va-tab ${campusFilter === cp ? 'active' : ''}`}
                    onClick={() => {
                      setCampusFilter(cp);
                      const firstInCampus = CLASS_PROFILES.find((c) => c.campus === cp);
                      if (firstInCampus) setSelectedClassId(firstInCampus.id);
                    }}
                  >
                    <span>{cp}</span>
                    <span className="va-tab-count">{count} lớp</span>
                  </button>
                );
              })}
            </div>

            <div className="row-wrap">
              <span className="va-badge va-badge-navy">
                Tổng số: {totalStudentsAll} học sinh
              </span>
              <span className="va-badge va-badge-green">
                Bảo mật định danh học sinh (VA-2026-NNNNN)
              </span>
            </div>
          </div>
        </section>

        {/* BỐ CỤC 2 CỘT: DANH SÁCH LỚP & HỒ SƠ CHI TIẾT */}
        <div
          className="grid-2"
          style={{ gridTemplateColumns: '350px minmax(0, 1fr)', alignItems: 'start', gap: '22px' }}
        >
          {/* CỘT TRÁI: DANH SÁCH LỚP */}
          <aside className="card stack" style={{ padding: '18px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 800 }}>
              Danh sách Lớp học ({filteredClasses.length})
            </h2>

            <div className="stack" style={{ gap: '10px' }}>
              {filteredClasses.map((cls) => {
                const isSelected = cls.id === activeClass.id;
                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => {
                      setSelectedClassId(cls.id);
                      setSaveBanner('');
                    }}
                    className={`va-list-item ${isSelected ? 'active' : ''}`}
                  >
                    <div className="row-between" style={{ marginBottom: '4px' }}>
                      <strong style={{ fontSize: '16.5px', color: 'var(--navy)' }}>
                        Lớp {cls.className} (Khối {cls.grade})
                      </strong>
                      <span className="va-badge va-badge-gold">
                        {cls.studentCount} HS
                      </span>
                    </div>

                    <div style={{ fontSize: '13.5px', color: 'var(--muted)' }}>
                      {cls.campus} · GVCN: {cls.homeroomTeacher.name}
                    </div>

                    {/* Thanh tỷ lệ 3 nhóm học lực */}
                    <div
                      style={{
                        display: 'flex',
                        height: '6px',
                        borderRadius: '3px',
                        overflow: 'hidden',
                        marginTop: '10px',
                        background: 'var(--line)',
                      }}
                    >
                      {cls.groups.map((g) => (
                        <div
                          key={g.tier}
                          style={{
                            width: `${g.percentage}%`,
                            background:
                              g.tier === 'co_ban'
                                ? '#E0B90C'
                                : g.tier === 'chuan'
                                  ? '#14153A'
                                  : '#1E7F4F',
                          }}
                          title={`${g.label}: ${g.count} HS (${g.percentage}%)`}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* CỘT PHẢI: HỒ SƠ CHI TIẾT LỚP ĐANG CHỌN */}
          <div className="stack" style={{ gap: '20px' }}>
            {/* THẺ 1: TỔNG QUAN ĐẶC ĐIỂM LỚP HỌC */}
            <section className="card stack" style={{ padding: '26px 28px', gap: '14px' }}>
              <div className="row-between">
                <div>
                  <div className="va-crumb">
                    {activeClass.campus} · GVCN: {activeClass.homeroomTeacher.name} ({activeClass.homeroomTeacher.email})
                  </div>
                  <h2 style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px' }}>
                    Hồ sơ Sư phạm Lớp {activeClass.className} ({activeClass.studentCount} học sinh)
                  </h2>
                  <div className="va-rule" style={{ marginTop: '8px' }} />
                </div>

                <Link
                  href={`/?classId=${activeClass.id}`}
                  className="btn btn-cta"
                >
                  Soạn học liệu cho Lớp {activeClass.className} →
                </Link>
              </div>

              <p style={{ fontSize: '16px', color: 'var(--ink)', lineHeight: 1.6 }}>
                {activeClass.classDynamicSummary}
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '12px',
                  paddingTop: '8px',
                }}
              >
                <div style={{ background: 'var(--cream)', border: '1px solid var(--line)', borderRadius: '6px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--gold-text)', textTransform: 'uppercase' }}>
                    Năng lực Tiếng Anh (IELTS/CEFR)
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--navy)', marginTop: '4px' }}>
                    {activeClass.englishProficiencyLevel}
                  </div>
                </div>

                <div style={{ background: 'var(--cream)', border: '1px solid var(--line)', borderRadius: '6px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--gold-text)', textTransform: 'uppercase' }}>
                    Biên độ tập trung tối ưu
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--navy)', marginTop: '4px' }}>
                    ~{activeClass.attentionSpanMinutes} phút / hoạt động
                  </div>
                </div>

                <div style={{ background: 'var(--cream)', border: '1px solid var(--line)', borderRadius: '6px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--gold-text)', textTransform: 'uppercase' }}>
                    Chủ đề học sinh hứng thú
                  </div>
                  <div className="row-wrap" style={{ marginTop: '6px' }}>
                    {activeClass.dominantInterests.map((interest, idx) => (
                      <span key={idx} className="va-badge" style={{ background: '#ffffff' }}>
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* THẺ 2: PHÂN HÓA 3 NHÓM NĂNG LỰC HỌC SINH */}
            <section className="card stack" style={{ padding: '24px 28px', gap: '16px' }}>
              <div>
                <div className="va-crumb">CƠ SỞ PHÂN HÓA HỌC LIỆU 3 MỨC ĐỘ</div>
                <h3 style={{ fontSize: '19px', fontWeight: 800 }}>
                  Phân nhóm năng lực học tập trong Lớp {activeClass.className}
                </h3>
              </div>

              <div className="grid-3">
                {activeClass.groups.map((grp) => {
                  const borderColor =
                    grp.tier === 'co_ban'
                      ? 'var(--gold)'
                      : grp.tier === 'chuan'
                        ? 'var(--navy)'
                        : 'var(--success)';
                  return (
                    <div
                      key={grp.tier}
                      style={{
                        background: 'var(--cream)',
                        border: '1px solid var(--line)',
                        borderTop: `4px solid ${borderColor}`,
                        borderRadius: '8px',
                        padding: '16px 18px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      <div className="row-between">
                        <strong style={{ fontSize: '16.5px', color: 'var(--navy)' }}>
                          {grp.label}
                        </strong>
                        <span className="va-badge va-badge-navy">
                          {grp.count} HS ({grp.percentage}%)
                        </span>
                      </div>

                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--gold-text)', textTransform: 'uppercase', marginBottom: '4px' }}>
                          Đặc điểm nhận thức:
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '14.5px', lineHeight: 1.55 }}>
                          {grp.characteristics.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--navy)', textTransform: 'uppercase', marginBottom: '4px' }}>
                          Chiến lược giao bài phù hợp:
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '14.5px', lineHeight: 1.55 }}>
                          {grp.recommendedStrategies.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>

                      <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--line)' }}>
                        <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                          Mã định danh mẫu: {grp.sampleStudentCodes.join(', ')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* THẺ 3: HỌC SINH CẦN LƯU Ý ĐẶC BIỆT & GHI CHÚ GIÁO VIÊN */}
            <section className="card stack" style={{ padding: '24px 28px', gap: '16px' }}>
              <div>
                <div className="va-crumb">CÁ NHÂN HÓA & HỖ TRỢ TRÊN LỚP</div>
                <h3 style={{ fontSize: '19px', fontWeight: 800 }}>
                  Học sinh cần giáo viên lưu ý hỗ trợ thêm ({activeClass.specialSupportStudents.length} học sinh)
                </h3>
              </div>

              <div className="grid-2">
                {activeClass.specialSupportStudents.map((st) => (
                  <div
                    key={st.studentCode}
                    style={{
                      background: 'var(--cream)',
                      border: '1px solid var(--line)',
                      borderLeft: '4px solid var(--gold)',
                      borderRadius: '8px',
                      padding: '16px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      fontSize: '15px',
                    }}
                  >
                    <div className="row-between">
                      <span className="va-badge va-badge-navy" style={{ fontFamily: 'monospace', fontSize: '13.5px' }}>
                        Mã HS: {st.studentCode}
                      </span>
                      <span className="va-badge va-badge-gold">
                        {LEARNING_STYLE_LABELS[st.learningStyle] || st.learningStyle}
                      </span>
                    </div>
                    <div>
                      <strong style={{ color: 'var(--navy)' }}>Điểm mạnh:</strong> {st.strengths}
                    </div>
                    <div>
                      <strong style={{ color: 'var(--navy)' }}>Khó khăn cần tháo gỡ:</strong> {st.supportNeeded}
                    </div>
                    <div
                      style={{
                        background: '#ffffff',
                        border: '1px solid var(--line)',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        color: 'var(--success)',
                        fontWeight: 600,
                      }}
                    >
                      Biện pháp sư phạm: {st.pedagogicalAccommodation}
                    </div>
                  </div>
                ))}
              </div>

              {/* FORM THÊM GHI CHÚ SƯ PHẠM */}
              <form
                onSubmit={(e) => void handleAddNote(e)}
                style={{
                  marginTop: '8px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--line)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <label htmlFor="teacher-note-input" style={{ fontWeight: 800, color: 'var(--navy)' }}>
                  Bổ sung ghi chú quan sát sư phạm cho Lớp {activeClass.className}:
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    id="teacher-note-input"
                    type="text"
                    value={teacherNote}
                    onChange={(e) => setTeacherNote(e.target.value)}
                    aria-label="Ghi chú quan sát sư phạm"
                    placeholder="Nhập nhận xét tình hình học tập của lớp trong tuần để AI tự động lưu ý khi soạn bài..."
                  />
                  <button type="submit" className="btn btn-navy">
                    Lưu ghi chú
                  </button>
                </div>

                {saveBanner && (
                  <div
                    className={`va-badge ${saveFailed ? '' : 'va-badge-green'}`}
                    role={saveFailed ? 'alert' : undefined}
                    style={{
                      alignSelf: 'flex-start',
                      ...(saveFailed
                        ? { whiteSpace: 'normal', color: '#b42318' }
                        : {}),
                    }}
                  >
                    {saveFailed ? '⚠' : '✓'} {saveBanner}
                  </div>
                )}

                {notesLoading && (
                  <div role="status" style={{ fontSize: '14px', color: 'var(--muted)' }}>
                    Đang tải ghi chú đã lưu...
                  </div>
                )}
                {notesError && (
                  <div role="alert" style={{ fontSize: '14px', color: '#b42318' }}>
                    {notesError}
                  </div>
                )}
                {(customNotes[activeClass.id] || []).length > 0 && (
                  <div className="stack" style={{ gap: '6px', marginTop: '4px' }}>
                    {(customNotes[activeClass.id] || []).map((n) => (
                      <div
                        key={n.id}
                        style={{
                          background: 'var(--success-bg)',
                          color: 'var(--success)',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          fontSize: '14.5px',
                          fontWeight: 600,
                        }}
                      >
                        Ghi chú giáo viên: {n.note}
                      </div>
                    ))}
                  </div>
                )}
              </form>
            </section>
          </div>
        </div>
      </div>
    </Shell>
  );
}
