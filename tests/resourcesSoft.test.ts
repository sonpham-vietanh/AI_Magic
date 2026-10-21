import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/engine/llmClient', () => ({ callLiveLlm: vi.fn() }));

import { callLiveLlm } from '@/lib/engine/llmClient';
import { checkArtifact, generateArtifact, type Artifact, type GenContext } from '@/lib/resources';

const llm = vi.mocked(callLiveLlm);
const ctx: GenContext = {
  title: 'Mệnh đề logic',
  language: 'vi',
  bloomLevels: ['Nhớ', 'Hiểu', 'Vận dụng', 'Phân tích'],
  grounding: 'Mệnh đề là câu khẳng định đúng hoặc sai.',
};
const ok = (content: string) => ({ ok: true, content, modelUsed: 'mock' });
const words = (n: number) => Array.from({ length: n }, () => 'chữ').join(' ');

// Podcast hợp lệ về cấu trúc nhưng ngắn hơn nhiều so với thời lượng khai báo (AI hay viết ngắn).
const shortPodcast = () => ({
  title: 'Podcast mệnh đề',
  durationMin: 4,
  hosts: ['Lan', 'Minh'],
  lines: [
    { speaker: 'Lan', text: words(30) },
    { speaker: 'Minh', text: words(30) },
    { speaker: 'Lan', text: words(30) },
  ],
});

// Video khai báo 3 phút nhưng các cảnh chỉ cộng được 160 giây.
const shortVideo = () => ({
  title: 'Video mệnh đề',
  totalMin: 3,
  scenes: [
    { n: 1, durationSec: 60, visual: 'Mở đầu', narration: 'Xin chào' },
    { n: 2, durationSec: 60, visual: 'Ví dụ', narration: 'Ví dụ một' },
    { n: 3, durationSec: 40, visual: 'Kết', narration: 'Tạm biệt' },
  ],
});

describe('kiểm tra độ dài là lỗi MỀM, không làm hỏng cả sản phẩm', () => {
  beforeEach(() => llm.mockReset());

  it('podcast ngắn hơn khai báo: thử lại 1 lần rồi vẫn nhận sản phẩm', async () => {
    llm.mockResolvedValue(ok(JSON.stringify(shortPodcast())));
    const r = await generateArtifact('podcast', ctx);
    expect(r.ok).toBe(true);
    expect(llm).toHaveBeenCalledTimes(2); // lần đầu thử lại kèm lỗi cụ thể
    if (r.ok) {
      const fails = checkArtifact(r.value as Artifact).filter((c) => !c.ok);
      expect(fails.map((f) => f.id)).toEqual(['pc.duration']); // độ lệch vẫn được báo ở tab kiểm tra cấu trúc
    }
  });

  it('video lệch tổng thời lượng: vẫn nhận sản phẩm, dấu ✗ còn đó', async () => {
    llm.mockResolvedValue(ok(JSON.stringify(shortVideo())));
    const r = await generateArtifact('video', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const fails = checkArtifact(r.value as Artifact).filter((c) => !c.ok);
      expect(fails.map((f) => f.id)).toEqual(['vd.sum']);
    }
  });

  it('lần thử lại sửa được thì dùng bản đã sửa', async () => {
    const fixed = { ...shortPodcast(), lines: Array.from({ length: 8 }, (_, i) => ({ speaker: i % 2 ? 'Minh' : 'Lan', text: words(75) })) };
    llm.mockResolvedValueOnce(ok(JSON.stringify(shortPodcast()))).mockResolvedValueOnce(ok(JSON.stringify(fixed)));
    const r = await generateArtifact('podcast', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(checkArtifact(r.value as Artifact).every((c) => c.ok)).toBe(true);
  });

  it('lỗi CỨNG (số người dẫn sai) vẫn bị từ chối sau thử lại', async () => {
    const bad = { ...shortPodcast(), hosts: ['A', 'B', 'C'] };
    llm.mockResolvedValue(ok(JSON.stringify(bad)));
    const r = await generateArtifact('podcast', ctx);
    expect(r.ok).toBe(false);
  });
});
