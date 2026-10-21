'use client';

import { Icon, type IconName } from '@/components/ui/icons';

/** Tab "Công cụ lớp học": máy trộn đề và bảng tương tác. */
export function ClassroomTools({
  lessonTitle,
  className,
  questionsCount,
  socraticCount,
  onMixer,
  onBoard,
  onPickLesson,
}: {
  lessonTitle: string;
  className: string;
  questionsCount: number;
  socraticCount: number;
  onMixer: () => void;
  onBoard: () => void;
  onPickLesson: () => void;
}) {
  const items: {
    icon: IconName;
    title: string;
    desc: string;
    action: string;
    onClick: () => void;
  }[] = [
    {
      icon: 'exam',
      title: 'Máy trộn đề nhiều bài',
      desc: 'Chọn nhiều bài trong chương, hệ thống lập ma trận Thông tư 22, đề kiểm tra và đáp án.',
      action: 'Mở máy trộn đề',
      onClick: onMixer,
    },
    {
      icon: 'slides',
      title: 'Bảng tương tác lớp học',
      desc: `Chiếu lên TV: ${questionsCount} câu hỏi, gợi mở từng bậc (${socraticCount} kịch bản) và mô phỏng.`,
      action: 'Chiếu lên bảng',
      onClick: onBoard,
    },
  ];

  return (
    <section aria-label="Công cụ lớp học" className="cc-class">
      <div className="cc-current">
        <div>
          <span className="cc-eyebrow">Bài đang chọn</span>
          <p className="cc-current-title">{lessonTitle || 'Chưa chọn bài'}</p>
          {className && <p className="cc-meta">Áp dụng cho lớp {className}</p>}
        </div>
        <button type="button" className="ag-btn small" onClick={onPickLesson}>
          Đổi bài
        </button>
      </div>

      <ul className="cc-class-grid">
        {items.map((it) => (
          <li key={it.title}>
            <div className="cc-class-card">
              <span className="cc-class-ico">
                <Icon name={it.icon} size={24} />
              </span>
              <h3>{it.title}</h3>
              <p>{it.desc}</p>
              <button type="button" className="ag-btn dark" onClick={it.onClick}>
                {it.action}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
