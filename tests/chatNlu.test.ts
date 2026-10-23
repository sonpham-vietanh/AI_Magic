import { describe, expect, it } from 'vitest';
import { initialSlots } from '@/lib/agent/flow';
import { parseIntent } from '@/lib/agent/intent';
import { buildUnderstanding, classifyMessage, missingSteps } from '@/lib/agent/nlu';

const NO_RESULT = { hasResult: false };
const WITH_RESULT = { hasResult: true };

describe('hiểu câu gõ tự nhiên', () => {
  it('điền đủ môn, khối, lớp, số tiết, phong cách, dạng sản phẩm từ một câu', () => {
    const i = parseIntent('soạn kế hoạch bài dạy định lí Pythagore lớp 7A2, 2 tiết, hoạt động nhóm');
    expect(i.format).toBe('ke_hoach');
    expect(i.grade).toBe('7');
    expect(i.className).toBe('7A2');
    expect(i.soTiet).toBe(2);
    expect(i.phongCach).toBe('hop_tac');
    expect(i.lessonQuery).toBe('dinh li pythagore');
    expect(i.lessonQueryRaw).toBe('định lí pythagore');
  });

  it('nhận môn nói rõ, không nhầm "định lí" là môn Lý', () => {
    expect(parseIntent('soạn slide môn Toán lớp 8 bài hàm số').subject).toBe('toan');
    expect(parseIntent('soạn slide định lí Pythagore').subject).toBeUndefined();
    expect(parseIntent('giáo án vật lý lớp 10 chuyển động thẳng').subject).toBe('vat_ly');
    expect(parseIntent('soạn quiz môn tiếng Anh lớp 9 unit 3').subject).toBe('tieng_anh');
    expect(parseIntent('soạn quiz môn tiếng Anh lớp 9 unit 3').ngonNgu).toBeUndefined();
  });

  it('nhận số bài và số chương', () => {
    const i = parseIntent('soạn giáo án bài 4 chương 2 môn toán lớp 7');
    expect(i.lessonNo).toBe(4);
    expect(i.chapterNo).toBe(2);
    expect(i.grade).toBe('7');
    expect(i.subject).toBe('toan');
    expect(i.lessonQuery).toBe('');
  });

  it('nhận dạng sản phẩm Bộ tiết dạy', () => {
    expect(parseIntent('soạn bộ tiết dạy bài hàm số bậc hai').format).toBe('bo_tiet_day');
  });

  it('vẫn giữ hành vi cũ: tên bài và dạng sản phẩm', () => {
    const i = parseIntent('soạn kế hoạch bài dạy bài mệnh đề logic');
    expect(i.format).toBe('ke_hoach');
    expect(i.lessonQuery).toBe('menh de logic');
  });

  it('"Mình hiểu / Chưa rõ" liệt kê đúng điều câu gõ nói và điều còn thiếu', () => {
    const i = parseIntent('soạn kế hoạch bài dạy lớp 7A2, 2 tiết, hoạt động nhóm');
    const slots = { ...initialSlots(), format: i.format, grade: '7', phongCach: i.phongCach };
    const u = buildUnderstanding(i, slots);
    const labels = u.understood.map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(['Sản phẩm', 'Lớp', 'Số tiết', 'Phong cách']));
    expect(u.unclear).toEqual(['bài dạy', 'mức tư duy của lớp']);
    expect(missingSteps(slots)).toEqual(['bai', 'bloom']);
  });
});

describe('phân loại SOẠN / HỎI / CHỈNH', () => {
  it('câu soạn rõ ràng là soạn', () => {
    expect(classifyMessage('soạn kế hoạch bài dạy bài mệnh đề logic', NO_RESULT).mode).toBe('soan');
    expect(classifyMessage('làm cho tôi bộ slide hàm số bậc hai', NO_RESULT).mode).toBe('soan');
  });

  it('sau khi có bản soạn, các câu chỉnh tự động thành chỉnh', () => {
    for (const t of ['rút còn 35 phút', 'thêm hoạt động nhóm', 'đổi ví dụ cho lớp yếu', 'viết lại ngắn hơn', 'Bớt phần khởi động đi']) {
      expect(classifyMessage(t, WITH_RESULT).mode, t).toBe('chinh');
    }
  });

  it('chưa có bản soạn thì câu chỉnh không được hiểu là chỉnh', () => {
    const c = classifyMessage('rút còn 35 phút', NO_RESULT);
    expect(c.mode).toBe('khong_ro');
    expect(c.refineWithoutResult).toBe(true);
  });

  it('yêu cầu tạo thêm sản phẩm khác vẫn là soạn, dù đang có bản soạn', () => {
    expect(classifyMessage('thêm phiếu học tập cho bài này', WITH_RESULT).mode).not.toBe('chinh');
    expect(classifyMessage('soạn bài khác', WITH_RESULT).mode).not.toBe('chinh');
  });

  it('các câu hỏi sẵn của hỏi đáp chuyên môn được nhận là hỏi', () => {
    for (const q of [
      'Gợi ý hoạt động khởi động 5 phút đầu giờ',
      'Cách giao bài phân hóa cho nhóm Cơ bản và Nâng cao',
      'Kết nối bài học này với môn học khác',
      'Cách viết nhận xét học bạ cuối kỳ theo Thông tư 22',
      'Thông tư 22 quy định gì về nhận xét?',
      'Tại sao phải dùng thang Bloom?',
    ]) {
      expect(classifyMessage(q, NO_RESULT).mode, q).toBe('hoi');
    }
  });

  it('câu hỏi có dấu hỏi khi đang có bản soạn vẫn là hỏi nếu không phải yêu cầu chỉnh', () => {
    expect(classifyMessage('Bloom là gì?', WITH_RESULT).mode).toBe('hoi');
  });

  it('cụm từ trần không rõ ý thì hỏi lại; đang chờ chọn bài thì coi là tên bài', () => {
    expect(classifyMessage('mệnh đề logic', NO_RESULT).mode).toBe('khong_ro');
    expect(classifyMessage('mệnh đề logic', { hasResult: false, waitingLesson: true }).mode).toBe('soan');
  });

  it('lệnh điều hướng được giữ như trước', () => {
    expect(classifyMessage('mở trang duyệt bản chuẩn', NO_RESULT).intent.command).toBe('duyet');
  });
});
