import { describe, expect, it } from 'vitest';
import { lineDiffRatio } from '@/lib/signals';

describe('độ lệch chỉ tính khác biệt NỘI DUNG', () => {
  const base = 'KẾ HOẠCH BÀI DẠY\nI. Mục tiêu\nNhận biết mệnh đề.\n\nII. Tiến trình\nHoạt động 1';

  it('khác nhau chỉ ở dòng trống và khoảng trắng thì coi như không sửa', () => {
    const reflowed = 'KẾ HOẠCH BÀI DẠY\n\nI. Mục tiêu   \nNhận  biết mệnh đề.\nII. Tiến trình\n\n\nHoạt động 1\n\n';
    expect(lineDiffRatio(base, reflowed)).toBe(0);
  });

  it('đổi CRLF và xuống dòng cuối không tính là sửa', () => {
    expect(lineDiffRatio(base, base.replace(/\n/g, '\r\n') + '\r\n')).toBe(0);
  });

  it('sửa một dòng thì có độ lệch dương và nhỏ', () => {
    const edited = base.replace('Nhận biết mệnh đề.', 'Nhận biết và phân loại mệnh đề.');
    const r = lineDiffRatio(base, edited);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(0.5);
  });

  it('xoá hẳn nội dung thì độ lệch lớn', () => {
    expect(lineDiffRatio(base, 'Hoàn toàn khác')).toBeGreaterThan(0.8);
  });
});
