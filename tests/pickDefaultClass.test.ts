import { describe, expect, it } from 'vitest';
import { pickDefaultClass } from '../lib/classes/pickDefaultClass';
import type { ClassProfile } from '../lib/types';

const mk = (id: string, grade: string) => ({ id, className: id, grade }) as unknown as ClassProfile;
const classes = [mk('3A1', '3'), mk('7A1', '7'), mk('7A2', '7'), mk('10A1', '10')];

describe('pickDefaultClass', () => {
  it('chọn lớp đầu tiên của khối', () => {
    expect(pickDefaultClass(classes, '7', 'toan')?.id).toBe('7A1');
  });
  it('ưu tiên preferredId nếu cùng khối', () => {
    expect(pickDefaultClass(classes, '7', 'toan', '7A2')?.id).toBe('7A2');
  });
  it('bỏ qua preferredId khác khối hoặc không tồn tại', () => {
    expect(pickDefaultClass(classes, '7', 'toan', '3A1')?.id).toBe('7A1');
    expect(pickDefaultClass(classes, '7', 'toan', 'zzz')?.id).toBe('7A1');
  });
  it('khối không có lớp thì lấy lớp đầu tiên', () => {
    expect(pickDefaultClass(classes, '12')?.id).toBe('3A1');
  });
  it('danh sách rỗng trả về undefined', () => {
    expect(pickDefaultClass([], '7')).toBeUndefined();
  });
});
