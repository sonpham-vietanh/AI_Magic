import { describe, expect, it } from 'vitest';
import {
  clearStep,
  followUpFormats,
  initialSlots,
  nextStep,
  summaryRows,
  todayISO,
  toParams,
  type AgentSlots,
} from '@/lib/agent/flow';
import { matchLessons, parseIntent, pickConfident, stripDiacritics } from '@/lib/agent/intent';

const NOW = new Date('2026-10-21T20:30:00Z'); // 03:30 ngày 22/10 theo giờ Việt Nam

function full(over: Partial<AgentSlots> = {}): AgentSlots {
  return {
    ...initialSlots(NOW),
    format: 'ke_hoach',
    baiDayId: 'KC-3566611',
    baiTitle: 'Khái niệm mệnh đề logic',
    bloom: 'hieu',
    phongCach: 'kham_pha',
    ...over,
  };
}

describe('luồng hội thoại (xác định)', () => {
  it('todayISO tính theo giờ Việt Nam (UTC+7)', () => {
    expect(todayISO(NOW)).toBe('2026-10-22');
  });

  it('hỏi đúng thứ tự cố định rồi mới xác nhận', () => {
    let s = initialSlots(NOW);
    expect(nextStep(s)).toBe('format');
    s = { ...s, format: 'ke_hoach' };
    expect(nextStep(s)).toBe('bai');
    s = { ...s, baiDayId: 'x', baiTitle: 'X' };
    expect(nextStep(s)).toBe('bloom');
    s = { ...s, bloom: 'nho' };
    expect(nextStep(s)).toBe('phongCach');
    s = { ...s, phongCach: 'hop_tac' };
    expect(nextStep(s)).toBe('confirm');
  });

  it('quiz và đề kiểm tra bỏ qua câu hỏi phong cách', () => {
    for (const format of ['quiz', 'de_kiem_tra'] as const) {
      const s = full({ format, phongCach: undefined });
      expect(nextStep(s)).toBe('confirm');
      expect(summaryRows(s).some((r) => r.step === 'phongCach')).toBe(false);
      const p = toParams(s);
      expect(p.ok).toBe(true);
      if (p.ok) expect(p.params.phongCach).toBe('truyen_thong');
    }
  });

  it('bấm "Sửa" xoá đúng một bước và hỏi lại đúng bước đó', () => {
    const s = clearStep(full(), 'bloom');
    expect(s.bloom).toBeUndefined();
    expect(s.format).toBe('ke_hoach');
    expect(nextStep(s)).toBe('bloom');
    const t = clearStep(full(), 'bai');
    expect(t.baiDayId).toBeUndefined();
    expect(t.baiTitle).toBeUndefined();
  });

  it('toParams khớp schema máy chủ và luôn có bậc Phân tích trong tóm tắt', () => {
    const p = toParams(full(), { teacher: { name: 'Cô Lan' }, regenerationOf: 'run_1' });
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.params.bloomThapNhat).toBe('hieu');
      expect(p.params.regenerationOf).toBe('run_1');
    }
    for (const bloom of ['nho', 'hieu', 'van_dung'] as const) {
      expect(summaryRows(full({ bloom }))[2].value).toContain('Phân tích');
    }
  });

  it('toParams từ chối thiếu bài hoặc ngày sai, báo rõ tham số nào', () => {
    const noBai = toParams(full({ baiDayId: undefined }));
    expect(noBai.ok).toBe(false);
    const badDate = toParams(full({ ngayDay: '2026-02-31' }));
    expect(badDate.ok).toBe(false);
    if (!badDate.ok) expect(badDate.error).toContain('ngayDay');
  });

  it('gợi ý tiếp theo không lặp lại sản phẩm vừa làm', () => {
    const f = followUpFormats('quiz').map((x) => x.value);
    expect(f).not.toContain('quiz');
    expect(f.length).toBe(3);
  });
});

describe('hiểu câu gõ tự do (luật từ khoá)', () => {
  it('bỏ dấu tiếng Việt', () => {
    expect(stripDiacritics('Đề kiểm tra Hàm số')).toBe('de kiem tra ham so');
  });

  it('tách sản phẩm và từ khoá bài', () => {
    const i = parseIntent('Soạn kế hoạch bài dạy bài mệnh đề logic');
    expect(i.format).toBe('ke_hoach');
    expect(i.lessonQuery).toBe('menh de logic');
  });

  it('nhận phong cách, ngôn ngữ và bậc Bloom khi có từ dẫn', () => {
    const i = parseIntent('tạo slide song ngữ phong cách trò chơi bloom hiểu cho bài định lí sin');
    expect(i.format).toBe('slide');
    expect(i.ngonNgu).toBe('song_ngu');
    expect(i.phongCach).toBe('tro_choi');
    expect(i.bloom).toBe('hieu');
    expect(i.lessonQuery).toContain('dinh');
  });

  it('"vận dụng" trong tên bài KHÔNG bị hiểu là bậc Bloom', () => {
    const i = parseIntent('soạn quiz bài vận dụng định lí cosin');
    expect(i.bloom).toBeUndefined();
    expect(i.lessonQuery).toContain('van dung');
  });

  it('"đề kiểm tra" ưu tiên hơn "kiểm tra"; nhận lệnh điều hướng', () => {
    expect(parseIntent('làm đề kiểm tra hàm số bậc hai').format).toBe('de_kiem_tra');
    expect(parseIntent('mở trang duyệt bản chuẩn').command).toBe('duyet');
    expect(parseIntent('bắt đầu lại').command).toBe('reset');
  });

  const LESSONS = [
    { id: 'a', code: 'TO10-C01-A01', title: 'Khái niệm mệnh đề logic' },
    { id: 'b', code: 'TO10-C01-A02', title: 'Mệnh đề phủ định' },
    { id: 'c', code: 'TO10-C03-B04', title: 'Định lí sin a/sinA=b/sinB=c/sinC=2R' },
  ];

  it('chỉ tự chọn bài khi khớp rõ ràng và duy nhất', () => {
    expect(pickConfident(matchLessons('menh de logic', LESSONS))?.id).toBe('a');
    expect(pickConfident(matchLessons('menh de', LESSONS))).toBeNull(); // hai bài cùng khớp
    expect(pickConfident(matchLessons('khong lien quan', LESSONS))).toBeNull();
  });

  it('khớp theo mã bài', () => {
    expect(matchLessons('to10-c03-b04', LESSONS)[0]?.lesson.id).toBe('c');
  });
});
