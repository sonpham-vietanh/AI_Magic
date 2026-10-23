import { describe, expect, it } from 'vitest';
import { fold, rankItems } from '@/components/studio/quickSearchLogic';
import {
  HOC_BA_MINUTES_PER_STUDENT,
  SAVING_MINUTES,
  formatApprox,
  formatDuration,
  minutesFor,
  summarizeSavings,
} from '@/lib/stats/savings';

const NOW = Date.parse('2026-10-23T10:00:00Z');
const day = (n: number) => new Date(NOW - n * 86400000).toISOString();

describe('summarizeSavings', () => {
  it('cộng phút theo dạng và chia tuần, tháng, tổng', () => {
    const s = summarizeSavings(
      [
        { createdAt: day(1), format: 'ke_hoach', lessonKey: 'a' },
        { createdAt: day(2), format: 'slide', lessonKey: 'a' },
        { createdAt: day(20), format: 'quiz', lessonKey: 'b' },
        { createdAt: day(90), format: 'de_kiem_tra', lessonKey: 'c' },
      ],
      NOW,
    );
    expect(s.week).toEqual({ minutes: SAVING_MINUTES.ke_hoach + SAVING_MINUTES.slide, count: 2 });
    expect(s.month.minutes).toBe(SAVING_MINUTES.ke_hoach + SAVING_MINUTES.slide + SAVING_MINUTES.quiz);
    expect(s.total.count).toBe(4);
    expect(s.byFormat.slide.count).toBe(1);
  });

  it('cùng bài, cùng dạng, cùng ngày chỉ tính một lần', () => {
    const s = summarizeSavings(
      [
        { createdAt: day(1), format: 'ke_hoach', lessonKey: 'a' },
        { createdAt: day(1), format: 'ke_hoach', lessonKey: 'a' },
      ],
      NOW,
    );
    expect(s.total.count).toBe(1);
  });

  it('dạng lạ vẫn được tính mức mặc định, ngày hỏng bị bỏ qua', () => {
    expect(minutesFor('khong-biet')).toBeGreaterThan(0);
    const s = summarizeSavings([{ createdAt: 'hỏng', format: 'quiz' }], NOW);
    expect(s.total.count).toBe(0);
  });

  it('định dạng thời gian dễ đọc', () => {
    expect(formatDuration(45)).toBe('45 phút');
    expect(formatDuration(150)).toBe('2 giờ 30 phút');
    expect(formatApprox(210)).toBe('≈ 3,5 giờ');
    expect(formatApprox(120)).toBe('≈ 2 giờ');
    expect(HOC_BA_MINUTES_PER_STUDENT).toBe(3);
  });
});

describe('tìm nhanh không dấu', () => {
  it('khớp không dấu, xếp khớp đầu cụm lên trước, cần đủ mọi từ', () => {
    const p = { fold, rank: rankItems };
    expect(p.fold('Định lí Pythagore Đà Nẵng')).toBe('dinh li pythagore da nang');
    const items = [
      { label: 'Lịch sử của tôi' },
      { label: 'Nhận xét học bạ', keywords: 'hoc ba' },
      { label: 'Học liệu đã lưu' },
    ];
    expect(p.rank(items, 'hoc ba')[0].label).toBe('Nhận xét học bạ');
    expect(p.rank(items, 'lich su').map((x) => x.label)).toEqual(['Lịch sử của tôi']);
    expect(p.rank(items, 'khong co gi')).toEqual([]);
    expect(p.rank(items, 'hoc lieu')[0].label).toBe('Học liệu đã lưu');
  });
});
