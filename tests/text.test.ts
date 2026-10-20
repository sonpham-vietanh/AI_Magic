import { describe, expect, it } from 'vitest';
import { cleanPedagogicalText } from '@/lib/engine/smartGenerator';
import { cleanFactoryText } from '@/lib/supabase';

describe('cleanPedagogicalText', () => {
  it('keeps a*b and -5', () => {
    const out = cleanPedagogicalText('Tính a*b khi x = -5');
    expect(out).toContain('a*b');
    expect(out).toContain('-5');
  });
  it('strips paired ** markers', () => {
    expect(cleanPedagogicalText('Đây là **quan trọng** nhé')).toBe('Đây là quan trọng nhé');
  });
  it('handles empty input', () => {
    expect(cleanPedagogicalText('')).toBe('');
  });
});

describe('cleanFactoryText', () => {
  it('converts \\frac{1}{2}', () => {
    const out = cleanFactoryText('\\frac{1}{2}');
    expect(out).not.toContain('\\frac');
    expect(out).toMatch(/1.*\/.*2/);
  });
  it('keeps "5$" style text sane', () => {
    const out = cleanFactoryText('Giá 5$ mỗi cái');
    expect(out).toContain('Giá');
    expect(out).toContain('5');
    expect(out).toContain('mỗi cái');
  });
  it('handles null/undefined', () => {
    expect(cleanFactoryText(null)).toBe('');
    expect(cleanFactoryText(undefined)).toBe('');
  });
});
