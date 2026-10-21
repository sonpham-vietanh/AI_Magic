import { describe, expect, it } from 'vitest';
import {
  bloomPreview,
  buildFinalText,
  buildParams,
  formatApiError,
  formatGuardrail,
  textToSections,
  validateForm,
  type SoanBaiForm,
} from '@/lib/ui/soanBai';

const base: SoanBaiForm = {
  ngayDay: '2026-10-21',
  baiDayId: 'a1',
  bloomThapNhat: 'hieu',
  ngonNgu: 'vi',
  phongCach: 'kham_pha',
  formatDauRa: 'ke_hoach',
  classId: '',
  suKien: { bat: false, tieuDe: '', url: '', ngayDang: '', noiDung: '' },
};

describe('soanBai helpers', () => {
  it('bloomPreview luôn có Phân tích', () => {
    expect(bloomPreview('nho')).toEqual(['Nhớ', 'Hiểu', 'Vận dụng', 'Phân tích']);
    expect(bloomPreview('hieu')).toEqual(['Hiểu', 'Vận dụng', 'Phân tích', 'Đánh giá']);
    expect(bloomPreview('van_dung')).toEqual(['Vận dụng', 'Phân tích', 'Đánh giá', 'Sáng tạo']);
    expect(bloomPreview('')).toEqual([]);
  });
  it('validateForm', () => {
    expect(validateForm(base)).toEqual({});
    const e = validateForm({ ...base, ngayDay: '', baiDayId: '', bloomThapNhat: '' });
    expect(Object.keys(e)).toEqual(['ngayDay', 'baiDayId', 'bloomThapNhat']);
    const e2 = validateForm({ ...base, suKien: { ...base.suKien, bat: true } });
    expect(e2.suKienTieuDe && e2.suKienUrl && e2.suKienNgay).toBeTruthy();
  });
  it('buildParams chỉ gửi sự kiện khi bật', () => {
    expect(buildParams(base).suKienThoiSu).toBeUndefined();
    const p = buildParams(
      { ...base, suKien: { bat: true, tieuDe: ' T ', url: 'https://vnexpress.net/x', ngayDang: '2026-10-19', noiDung: '' } },
      { regenerationOf: 'r1' },
    );
    expect(p.suKienThoiSu).toEqual({ tieuDe: 'T', url: 'https://vnexpress.net/x', ngayDang: '2026-10-19' });
    expect(p.regenerationOf).toBe('r1');
  });
  it('formatApiError', () => {
    expect(formatApiError(429)).toContain('quá nhiều');
    expect(formatApiError(422, 'a; b')).toContain('- b');
    expect(formatGuardrail([])).toHaveLength(2);
  });
  it('buildFinalText và textToSections', () => {
    const secs = [
      { heading: 'Mục tiêu', body: 'A' },
      { heading: 'Hoạt động', body: 'B' },
    ];
    const t = buildFinalText(secs);
    expect(t).toBe('Mục tiêu\nA\n\nHoạt động\nB');
    expect(textToSections(t, ['Mục tiêu', 'Hoạt động'])).toEqual(secs);
    expect(buildFinalText([], 'md')).toBe('md');
  });
});
