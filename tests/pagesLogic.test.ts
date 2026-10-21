import { describe, expect, it } from 'vitest';
import { classifySearchQuery } from '@/lib/ui/searchQuery';
import { keepSelection, mergeNotes } from '@/lib/ui/notes';

describe('classifySearchQuery', () => {
  it('rỗng', () => expect(classifySearchQuery('  ')).toEqual({ kind: 'empty' }));
  it('mã KC', () =>
    expect(classifySearchQuery(' kc-4402137 ')).toEqual({ kind: 'atomId', atomId: 'KC-4402137' }));
  it('mã TO07 là text', () =>
    expect(classifySearchQuery('TO07-C01')).toEqual({ kind: 'text', q: 'TO07-C01' }));
  it('KC- kèm chữ là text', () =>
    expect(classifySearchQuery('KC-12ab').kind).toBe('text'));
});

describe('mergeNotes', () => {
  it('bỏ trùng', () => {
    const r = mergeNotes(
      [{ id: 'a', note: 'x' }],
      [{ id: 'l1', note: 'x' }, { id: 'l2', note: 'y' }],
    );
    expect(r.map((n) => n.note)).toEqual(['x', 'y']);
  });
});

describe('keepSelection', () => {
  it('null khi không có trong danh sách', () => {
    expect(keepSelection([{ id: 'a' }], 'b')).toBeNull();
    expect(keepSelection([], 'a')).toBeNull();
    expect(keepSelection([{ id: 'a' }], 'a')).toEqual({ id: 'a' });
  });
});
