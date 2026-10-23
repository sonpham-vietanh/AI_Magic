import { describe, expect, it } from 'vitest';
import {
  chapterInfo,
  compareAtoms,
  displayTitle,
  groupByChapter,
  normalizeForSearch,
  parseAtomCode,
  pushRecent,
  readRecent,
  searchAtoms,
  type LessonAtom,
} from '@/lib/ui/lessonList';

const A = (code: string, title: string, chapter: string, lesson: string, grade = 7, extra: Partial<LessonAtom> = {}): LessonAtom => ({
  id: code,
  code,
  title,
  subject: 'toan',
  grade,
  chapter,
  lesson,
  ord: 10,
  ...extra,
});

const ATOMS: LessonAtom[] = [
  A('TO07-C04-D03', 'Định lí Pythagore (giới thiệu, áp dụng)', 'Chương IV: Tam giác bằng nhau', 'TH bằng nhau tam giác vuông'),
  A('TO07-C04-D04', 'Áp dụng Pythagore vào bài toán đo đạc', 'Chương IV: Tam giác bằng nhau', 'TH bằng nhau tam giác vuông'),
  A('TO07-C04-D01', 'Ba trường hợp bằng nhau của tam giác vuông', 'Chương IV: Tam giác bằng nhau', 'TH bằng nhau tam giác vuông'),
  A('TO07-C01-A01', 'Khái niệm số hữu tỉ', 'Chương I: Số hữu tỉ', 'Tập hợp các số hữu tỉ'),
  A('TO07-C10-A01', 'Biến cố trong trò chơi', 'Chương X: Xác suất', 'Biến cố'),
  A('TO10-C06-B02', 'Định lí côsin', 'Chương VI: Hệ thức lượng trong tam giác', 'Hệ thức lượng', 10),
  A('TO10-C06-B01', 'Định lí sin', 'Chương VI: Hệ thức lượng trong tam giác', 'Hệ thức lượng', 10),
  A('TO12-C02-A01', 'Phương trình mặt phẳng', 'Chương II: Phương trình mặt phẳng', 'Mặt phẳng', 12),
  A('VL10-C01-A01', 'Chuyển động thẳng đều', 'Chương 1: Động học', 'Chuyển động thẳng', 10, { subject: 'vat_ly' }),
];

describe('chuẩn hoá và đồng nghĩa', () => {
  it('bỏ dấu, hoa thường, dấu câu', () => {
    expect(normalizeForSearch('  ĐỊNH LÍ  Py-ta-go! ')).toBe('dinh li pythagore');
  });
  it('các cách viết Pythagore quy về một dạng', () => {
    for (const s of ['pitago', 'Pythagore', 'py-ta-go', 'py ta go', 'Pythagoras', 'PiTaGo']) {
      expect(normalizeForSearch(s)).toBe('pythagore');
    }
  });
  it('lí/lý và côsin/cosine', () => {
    expect(normalizeForSearch('định lý')).toBe(normalizeForSearch('định lí'));
    expect(normalizeForSearch('cosine')).toBe(normalizeForSearch('côsin'));
  });
  it('viết tắt phổ biến', () => {
    expect(normalizeForSearch('pt bậc 2')).toBe('phuong trinh bac hai');
  });
});

describe('mã, chương, tên hiển thị', () => {
  it('đọc mã TO07-C04-D03', () => {
    expect(parseAtomCode('TO07-C04-D03')).toEqual({ chapterNo: 4, group: 'D', item: 3 });
    expect(parseAtomCode('lạ')).toEqual({ chapterNo: null, group: '', item: null });
  });
  it('nhãn chương đổi số La Mã sang số thường', () => {
    expect(chapterInfo('Chương IV: Tam giác bằng nhau').label).toBe('Chương 4 · Tam giác bằng nhau');
    expect(chapterInfo('Chương 12: Mặt cầu').label).toBe('Chương 12 · Mặt cầu');
    expect(chapterInfo('Unit 3: Music', 'TA07-U03-A01').label).toBe('Unit 3 · Music');
  });
  it('chương rỗng không để trống khó hiểu', () => {
    expect(chapterInfo('', 'TO07-C05-A01').label).toBe('Chương 5');
    expect(chapterInfo('', undefined).label).toBe('Chưa phân chương');
  });
  it('tên hiển thị không bao giờ là mã', () => {
    expect(displayTitle({ title: 'TO07-C04-D03', lesson: 'Pythagore', chapter: '' })).toBe('Pythagore');
    expect(displayTitle({ title: '', lesson: '', chapter: '' })).toBe('Bài chưa đặt tên');
    expect(displayTitle({ title: 'Hàm số', lesson: '', chapter: '' })).toBe('Hàm số');
  });
});

describe('xếp theo chương và gom theo bài', () => {
  it('xếp chương IV trước chương X', () => {
    const order = ATOMS.filter((a) => a.grade === 7).sort(compareAtoms).map((a) => a.code);
    expect(order).toEqual(['TO07-C01-A01', 'TO07-C04-D01', 'TO07-C04-D03', 'TO07-C04-D04', 'TO07-C10-A01']);
  });
  it('khối tăng dần', () => {
    const grades = [...ATOMS].sort(compareAtoms).map((a) => Number(a.grade));
    expect(grades).toEqual([...grades].sort((a, b) => a - b));
  });
  it('gom các điểm tri thức cùng bài thành một nhóm', () => {
    const g = groupByChapter(ATOMS.filter((a) => a.grade === 7));
    expect(g.map((c) => c.label)).toEqual(['Chương 1 · Số hữu tỉ', 'Chương 4 · Tam giác bằng nhau', 'Chương 10 · Xác suất']);
    const c4 = g[1];
    expect(c4.lessons).toHaveLength(1);
    expect(c4.lessons[0].label).toBe('TH bằng nhau tam giác vuông');
    expect(c4.lessons[0].atoms.map((a) => a.code)).toEqual(['TO07-C04-D01', 'TO07-C04-D03', 'TO07-C04-D04']);
    expect(c4.count).toBe(3);
  });
  it('không làm mất atom nào', () => {
    expect(groupByChapter(ATOMS).reduce((n, c) => n + c.count, 0)).toBe(ATOMS.length);
  });
});

describe('tìm kiếm chéo khối/môn', () => {
  it('"pitago" không dấu tìm ra bài lớp 7 trước', () => {
    const hits = searchAtoms(ATOMS, 'pitago');
    expect(hits[0].atom.code).toBe('TO07-C04-D03');
    expect(hits.map((h) => h.atom.code)).toContain('TO07-C04-D04');
  });
  it('"dinh li py-ta-go" khớp cả cụm', () => {
    expect(searchAtoms(ATOMS, 'dinh li py-ta-go')[0].atom.code).toBe('TO07-C04-D03');
    expect(searchAtoms(ATOMS, 'định lý Pythagore')[0].atom.code).toBe('TO07-C04-D03');
  });
  it('định lí sin/côsin của lớp 10 không lẫn vào kết quả Pythagore', () => {
    const codes = searchAtoms(ATOMS, 'định lí pitago').map((h) => h.atom.code);
    expect(codes).not.toContain('TO10-C06-B01');
  });
  it('mọi từ khoá đều phải khớp', () => {
    expect(searchAtoms(ATOMS, 'pitago hoá học')).toEqual([]);
  });
  it('khớp ở tên bài xếp trên khớp ở tên chương', () => {
    const hits = searchAtoms(ATOMS, 'tam giác');
    expect(hits[0].atom.title.toLowerCase()).toContain('tam giác');
    expect(hits[hits.length - 1].atom.title.toLowerCase()).not.toContain('tam giác');
  });
  it('không phân biệt hoa thường', () => {
    expect(searchAtoms(ATOMS, 'ĐỊNH LÍ SIN')[0].atom.code).toBe('TO10-C06-B01');
    expect(searchAtoms(ATOMS, 'cosin')[0].atom.code).toBe('TO10-C06-B02');
  });
  it('tìm theo mã kỹ thuật vẫn được (quản trị)', () => {
    expect(searchAtoms(ATOMS, 'TO07-C04-D03')[0].atom.code).toBe('TO07-C04-D03');
  });
  it('khối ưu tiên chỉ cộng nhẹ, không thêm bài không khớp', () => {
    const hits = searchAtoms(ATOMS, 'định lí', { preferGrade: '10' });
    expect(hits[0].atom.grade).toBe(10);
    expect(hits.length).toBe(3);
  });
  it('giới hạn số kết quả và rỗng khi không có từ khoá', () => {
    expect(searchAtoms(ATOMS, 'bài', { limit: 1 }).length).toBeLessThanOrEqual(1);
    expect(searchAtoms(ATOMS, '   ')).toEqual([]);
    expect(searchAtoms(ATOMS, '???')).toEqual([]);
  });
});

describe('bài gần đây', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it('đẩy lên đầu, không trùng, tối đa 8', () => {
    const s = mem();
    for (let i = 0; i < 12; i++) pushRecent({ id: `a${i}`, code: `c${i}`, title: `t${i}` }, s);
    pushRecent({ id: 'a5', code: 'c5', title: 't5' }, s);
    const list = readRecent(s);
    expect(list).toHaveLength(8);
    expect(list[0].id).toBe('a5');
    expect(new Set(list.map((x) => x.id)).size).toBe(8);
  });
  it('dữ liệu hỏng hoặc lưu trữ bị chặn thì trả rỗng, không ném lỗi', () => {
    expect(readRecent({ getItem: () => '{không phải json' })).toEqual([]);
    expect(
      readRecent({
        getItem: () => {
          throw new Error('chặn');
        },
      }),
    ).toEqual([]);
    expect(() =>
      pushRecent(
        { id: 'x', code: 'x', title: 'x' },
        {
          getItem: () => null,
          setItem: () => {
            throw new Error('đầy');
          },
        },
      ),
    ).not.toThrow();
  });
});

describe('mã không theo kiểu TO07-C04-D03', () => {
  it('xếp theo mã khi không đọc được số chương (Sinh học, Oxford)', () => {
    const mk = (code: string): LessonAtom => ({ id: code, code, title: code, subject: 'sinh_hoc', grade: 12, chapter: 'Phần Bốn: Di truyền học', lesson: 'x', ord: 0 });
    const order = ['S12B10_001', 'S12B2_002', 'S12B2_001', 'S12B1_001'].map(mk).sort(compareAtoms).map((a) => a.code);
    expect(order).toEqual(['S12B1_001', 'S12B2_001', 'S12B2_002', 'S12B10_001']);
  });
});

describe('tên bài do giáo viên tự nhập', () => {
  it('mã hoá an toàn, giải mã lại đúng, không quá 128 ký tự', async () => {
    const { encodeFreeLesson, decodeFreeLesson, isFreeLesson } = await import('@/lib/ui/lessonList');
    const id = encodeFreeLesson('  Định luật Ôm   cho đoạn mạch ');
    expect(id).toMatch(/^tu-do:[A-Za-z0-9_-]+$/);
    expect(id.length).toBeLessThanOrEqual(128);
    expect(isFreeLesson(id)).toBe(true);
    expect(decodeFreeLesson(id)).toBe('Định luật Ôm cho đoạn mạch');
    const long = encodeFreeLesson('Đ'.repeat(200));
    expect(long.length).toBeLessThanOrEqual(128);
    expect(decodeFreeLesson(long)!.length).toBeGreaterThan(10);
    expect(decodeFreeLesson('KC-123')).toBeNull();
    expect(decodeFreeLesson('tu-do:***')).toBeNull();
  });
});
