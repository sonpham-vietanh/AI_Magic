import { describe, expect, it } from 'vitest';
import { computeStatuses, SERVICES } from '@/lib/integrations/catalog';

describe('trạng thái dịch vụ ngoài', () => {
  it('không có biến môi trường thì chưa cấu hình (trừ nguồn tin không cần khoá)', () => {
    const st = computeStatuses({});
    const byId = Object.fromEntries(st.map((s) => [s.id, s]));
    expect(byId.llm.configured).toBe(false);
    expect(byId.gamma.state).toBe('chua_cau_hinh');
    expect(byId['news-whitelist'].state).toBe('dang_dung');
  });

  it('có khoá nhưng chưa nối mã thì báo đã cấu hình nhưng chưa nối', () => {
    const st = computeStatuses({ GAMMA_API_KEY: 'x' });
    expect(st.find((s) => s.id === 'gamma')?.state).toBe('da_cau_hinh_chua_noi');
    expect(computeStatuses({ OPENAI_API_KEY: 'k' }).find((s) => s.id === 'llm')?.state).toBe('dang_dung');
  });

  it('chuỗi rỗng/khoảng trắng không tính là đã cấu hình', () => {
    expect(computeStatuses({ GAMMA_API_KEY: '   ' }).find((s) => s.id === 'gamma')?.configured).toBe(false);
  });

  it('KHÔNG lộ giá trị biến môi trường', () => {
    const secrets = {
      OPENAI_API_KEY: 'sk-SECRET-111',
      GAMMA_API_KEY: 'gamma-SECRET-222',
      CANVA_API_KEY: 'canva-SECRET-333',
      GEMINI_NOTEBOOK_API_KEY: 'nb-SECRET-444',
      TTS_API_KEY: 'tts-SECRET-555',
    };
    const json = JSON.stringify(computeStatuses(secrets));
    expect(json).not.toContain('SECRET');
    for (const s of computeStatuses(secrets)) expect(typeof s.configured).toBe('boolean');
  });

  it('mọi dịch vụ đều có dòng thay thế trung thực', () => {
    for (const d of SERVICES) expect(d.fallback.length).toBeGreaterThan(10);
  });
});
