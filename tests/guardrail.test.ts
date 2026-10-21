import { describe, expect, it } from 'vitest';
import { NEWS_WHITELIST, checkNewsEvent } from '@/lib/guardrails/news';

const now = new Date('2026-10-21T12:00:00Z');
const old = '2026-10-18T12:00:00Z';
const mk = (o: Partial<Parameters<typeof checkNewsEvent>[0]> = {}) =>
  checkNewsEvent({ tieuDe: 'Giá xăng giảm', url: 'https://vnexpress.net/a-1.html', ngayDang: old, ...o }, now);

describe('guardrail thời sự', () => {
  it('whitelist hợp lệ và luôn requiresApproval', () => {
    for (const d of NEWS_WHITELIST) {
      const r = mk({ url: `https://www.${d}/x` });
      expect(r.ok).toBe(true);
      expect(r.requiresApproval).toBe(true);
    }
  });
  it('chặn tấn công hậu tố/chuỗi con và http', () => {
    expect(mk({ url: 'https://evil-vnexpress.net.attacker.com/a' }).ok).toBe(false);
    expect(mk({ url: 'https://vnexpress.net.evil.com/a' }).ok).toBe(false);
    expect(mk({ url: 'https://notvnexpress.net/a' }).ok).toBe(false);
    expect(mk({ url: 'https://evil.com/vnexpress.net' }).ok).toBe(false);
    expect(mk({ url: 'http://vnexpress.net/a' }).ok).toBe(false);
    expect(mk({ url: 'khong-phai-url' }).ok).toBe(false);
  });
  it('quy tắc 48 giờ với đồng hồ giả', () => {
    expect(mk({ ngayDang: '2026-10-19T12:00:01Z' }).ok).toBe(false);
    expect(mk({ ngayDang: '2026-10-19T12:00:00Z' }).ok).toBe(true);
    expect(mk({ ngayDang: '2026-10-20T12:00:00Z' }).ok).toBe(false);
    expect(mk({ ngayDang: '2026-10-22T12:00:00Z' }).ok).toBe(false);
    expect(mk({ ngayDang: 'hôm qua' }).ok).toBe(false);
  });
  it('chủ đề bị loại, có và không dấu', () => {
    const bad = [
      'Bài về TÌNH DỤC',
      'tinh duc tuoi teen',
      'Chính trị thế giới',
      'chinh tri',
      'Tôn giáo',
      'ton giao',
      'Vấn đề dân tộc',
      'Chủ quyền Hoàng Sa',
      'Biển Đông căng thẳng',
      'truong sa',
      'Đánh giá nhân vật lịch sử Trần Hưng Đạo',
    ];
    for (const t of bad) {
      const r = mk({ tieuDe: t });
      expect(r.ok, t).toBe(false);
      expect(r.reasons.length).toBeGreaterThan(0);
    }
    expect(mk({ noiDung: 'bàn về chính trị' }).ok).toBe(false);
    expect(mk({ tieuDe: 'Học sinh đạt giải Toán quốc tế' }).ok).toBe(true);
  });
});
