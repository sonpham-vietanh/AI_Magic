import { describe, expect, it } from 'vitest';
import { buildGammaOutline, buildNotebookSource, exportFileName, toBullets } from '@/lib/agent/exportText';
import { formatApiError, isAiAuthError } from '@/lib/ui/soanBai';
import { applyPrefs } from '@/lib/agent/prefs';
import { initialSlots } from '@/lib/agent/flow';

const sections = [
  { heading: 'Mục tiêu bài học', body: '- Phát biểu được mệnh đề\n- Xác định tính đúng sai' },
  { heading: 'Hoạt động 1: Khởi động', body: 'Giáo viên nêu tình huống.\nHọc sinh thảo luận cặp đôi.\nChốt khái niệm mệnh đề.\nGhi vở ví dụ.\nTrình bày nhanh.\nGiáo viên nhận xét chung.' },
  { heading: 'Câu hỏi củng cố', body: '1. Mệnh đề là gì?\n2. Cho ví dụ.' },
];

describe('exportText', () => {
  it('toBullets giới hạn 5 ý và bỏ ký hiệu đầu dòng', () => {
    const b = toBullets('- a b c\n• d e f\n1. g h i\n\nj k l\nm n o\np q r');
    expect(b).toHaveLength(5);
    expect(b[0]).toBe('a b c');
  });

  it('Gamma: mỗi mục một slide, ý dư thành ghi chú', () => {
    const g = buildGammaOutline({ title: 'KHBD: Mệnh đề', formatText: 'Kế hoạch bài dạy', text: '', sections });
    expect(g.startsWith('# KHBD: Mệnh đề')).toBe(true);
    expect(g.match(/^## Slide /gm)).toHaveLength(3);
    expect(g).toContain('Ghi chú cho giáo viên: Giáo viên nhận xét chung.');
  });

  it('Gamma: dùng thẻ slide thật khi có artifact slides', () => {
    const g = buildGammaOutline({
      title: 'Slide',
      text: '',
      artifacts: [{ kind: 'slides', title: 'S', data: { title: 'S', slides: [{ title: 'Mở đầu', bullets: ['A', 'B', 'C'], notes: 'Nói chậm' }] } }],
    });
    expect(g).toContain('## Slide 1: Mở đầu');
    expect(g).toContain('- C');
    expect(g).toContain('Ghi chú cho giáo viên: Nói chậm');
  });

  it('Gamma: tách từ text khi không có sections', () => {
    const g = buildGammaOutline({ title: 'T', text: '# Phần 1\nÝ một\nÝ hai\n# Phần 2\nÝ ba' });
    expect(g.match(/^## Slide /gm)).toHaveLength(2);
  });

  it('NotebookLM: có mục tiêu, nội dung, câu hỏi và không có ghi chú kỹ thuật', () => {
    const n = buildNotebookSource({ title: 'KHBD', text: '', sections, bloomLevels: ['Hiểu', 'Vận dụng'] });
    expect(n).toContain('## Mục tiêu');
    expect(n).toContain('- Phát biểu được mệnh đề');
    expect(n).toContain('## Nội dung');
    expect(n).toContain('### Hoạt động 1: Khởi động');
    expect(n).toContain('## Câu hỏi');
    expect(n).toContain('Mức tư duy: Hiểu → Vận dụng');
    expect(n).not.toContain('Slide');
  });

  it('NotebookLM: gom câu hỏi từ phiếu học tập', () => {
    const n = buildNotebookSource({
      title: 'P',
      text: 'Nội dung',
      artifacts: [{ kind: 'worksheet', title: 'P', data: { title: 'P', sections: [{ heading: 'A', items: [{ prompt: 'Câu một?' }] }], answerKey: [] } }],
    });
    expect(n).toContain('1. Câu một?');
  });

  it('tên tệp an toàn', () => {
    expect(exportFileName('Kế hoạch: Mệnh đề / logic', 'gamma')).toBe('Kế-hoạch-Mệnh-đề-logic-gamma.md');
    expect(exportFileName('///', 'x')).toBe('ban-soan-x.md');
  });
});

describe('lỗi AI đăng nhập', () => {
  it('nhận diện lỗi AI chưa đăng nhập/hết hạn', () => {
    expect(isAiAuthError(401, 'Unauthorized')).toBe(false);
    expect(isAiAuthError(502, 'ai_auth_expired')).toBe(true);
    expect(isAiAuthError(502, 'OAuth token expired, please login again')).toBe(true);
    expect(isAiAuthError(502, 'Dịch vụ AI lỗi')).toBe(false);
  });
  it('formatApiError tách riêng thông điệp', () => {
    const m = formatApiError(502, 'token expired');
    expect(m).toContain('đăng nhập');
    expect(m).not.toContain('tạm thời không phản hồi');
    expect(formatApiError(502)).toContain('tạm thời');
    expect(formatApiError(401)).toContain('Phiên đăng nhập của cô/thầy');
  });
});

describe('áp tuỳ chọn mặc định', () => {
  it('chỉ áp khi hợp lệ', () => {
    const s = applyPrefs(initialSlots(), { mon: 'vat_ly', khoi: '11', phongCach: 'hop_tac' });
    expect(s.subject).toBe('vat_ly');
    expect(s.grade).toBe('11');
    expect(s.phongCach).toBe('hop_tac');
    const bad = applyPrefs(initialSlots(), { mon: 'xyz', khoi: '99', phongCach: 'abc' });
    expect(bad.subject).toBe('toan');
    expect(bad.phongCach).toBeUndefined();
  });
  it('không đè lựa chọn đã có của giáo viên', () => {
    const base = { ...initialSlots(), phongCach: 'du_an' as const };
    expect(applyPrefs(base, { phongCach: 'hop_tac' }, { keepSubjectGrade: true }).phongCach).toBe('du_an');
    expect(applyPrefs(base, { mon: 'vat_ly' }, { keepSubjectGrade: true }).subject).toBe('toan');
  });
});
