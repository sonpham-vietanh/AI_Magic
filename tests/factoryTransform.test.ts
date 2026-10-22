import { describe, expect, it } from 'vitest';
import { checkArtifact } from '@/lib/resources/check';
import {
  buildKhbdFromStandard,
  hasRichFactorySource,
  transformFactoryToArtifact,
  type FactorySource,
} from '@/lib/resources/factoryTransform';
import type { ArtifactKind } from '@/lib/resources/types';
import { checkKhbdStructure } from '@/lib/workflows/validators';

const ALL_KINDS: ArtifactKind[] = [
  'text',
  'infographic',
  'mindmap',
  'video',
  'tranh_luan',
  'podcast',
  'slides',
  'worksheet',
];

const richSource: FactorySource = {
  atomId: 'atom_toan_10_1',
  atomCode: 'TOAN10-C1-B1',
  title: 'Mệnh đề và mệnh đề chứa biến',
  subject: 'Toán',
  grade: '10',
  atom: {
    code: 'TOAN10-C1-B1',
    title: 'Mệnh đề và mệnh đề chứa biến',
    yeu_cau: 'Nhận biết mệnh đề toán học, xác định tính đúng sai và phủ định mệnh đề.',
    quan_niem_sai: 'Học sinh nhầm câu cảm thán hoặc câu hỏi là mệnh đề logic.',
  },
  packages: [
    {
      id: 'pkg_l1',
      level: 1,
      bloom: 'Nhớ - Hiểu',
      status: 'approved',
      fields: {
        objective: 'Phát biểu đúng định nghĩa mệnh đề và lấy được ví dụ thực tế.',
        explanation:
          'Mệnh đề logic là một câu khẳng định có tính đúng hoặc sai rõ ràng, không thể vừa đúng vừa sai.',
        example: '"Số 15 chia hết cho 3" là một mệnh đề đúng.',
        counterExample: '"Hôm nay trời đẹp quá!" không phải là mệnh đề vì không xác định được đúng sai.',
        commonMistake: 'Nhầm mệnh đề chứa biến x + 2 > 5 là mệnh đề khi chưa gán giá trị cụ thể cho x.',
        strategy: 'Yêu cầu học sinh tự đặt câu hỏi: Câu này có trả lời Đúng hoặc Sai dứt khoát được không?',
      },
    },
    {
      id: 'pkg_l2',
      level: 2,
      bloom: 'Vận dụng',
      status: 'approved',
      fields: {
        objective: 'Lập được mệnh đề phủ định và xét tính đúng sai của mệnh đề kéo theo.',
      },
    },
    {
      id: 'pkg_l3',
      level: 3,
      bloom: 'Phân tích',
      status: 'approved',
      fields: {
        objective: 'Phân tích điều kiện cần và đủ trong các định lý toán học.',
      },
    },
  ],
  questions: [
    {
      id: 'q1',
      noi_dung: 'Trong các câu sau, câu nào là mệnh đề toán học?',
      dap_an: 'A. 2 là số nguyên tố chẵn duy nhất.',
      loi_giai: 'Vì đây là khẳng định đúng trong toán học.',
      do_kho: 'Nhận biết',
    },
    {
      id: 'q2',
      noi_dung: 'Nêu mệnh đề phủ định của mệnh đề: "Mọi hình vuông đều là hình chữ nhật".',
      dap_an: 'Tồn tại ít nhất một hình vuông không phải là hình chữ nhật.',
      loi_giai: 'Phủ định của lượng từ với mọi là tồn tại.',
      do_kho: 'Thông hiểu',
    },
    {
      id: 'q3',
      noi_dung: 'Xét tính đúng sai của mệnh đề P(n): "n^2 + 1 chia hết cho 4" với n là số tự nhiên.',
      dap_an: 'Mệnh đề sai với mọi số tự nhiên n.',
      loi_giai: 'Số chính phương chia 4 chỉ dư 0 hoặc 1 nên n^2 + 1 chia 4 dư 1 hoặc 2.',
      do_kho: 'Vận dụng',
    },
  ],
  socratic: [
    {
      wrong_answer: 'x + 3 = 7 là mệnh đề đúng',
      misconception: 'Chưa phân biệt mệnh đề và mệnh đề chứa biến',
      bac_1: 'Theo em, nếu chưa biết giá trị của x thì ta có khẳng định chắc chắn x + 3 = 7 đúng hay sai không?',
      bac_2: 'Thử thay x = 4 và x = 5 vào câu trên, tính đúng sai thay đổi như thế nào?',
      bac_3: 'Vậy một khẳng định mà tính đúng sai phụ thuộc vào biến x được gọi là gì?',
      bac_4: 'Chốt lại: Khi nào mệnh đề chứa biến mới trở thành một mệnh đề thực sự?',
    },
  ],
  edges: [
    {
      relation: 'prerequisite',
      remediation_hint: 'Ôn lại tập hợp số tự nhiên và tính chia hết.',
      linkedAtom: {
        code: 'TIN10-B2',
        title: 'Biểu thức logic trong lập trình',
        subject: 'Tin học',
        grade: 10,
      },
    },
  ],
};

describe('factoryTransform (Zero-Token Resource Transformer)', () => {
  it('nhận diện đúng nguồn dữ liệu có gói kiến thức Factory thực sự', () => {
    expect(hasRichFactorySource(null)).toBe(false);
    expect(hasRichFactorySource({ packages: ['chỉ là chuỗi đơn giản'] })).toBe(false);
    expect(hasRichFactorySource(richSource)).toBe(true);
  });

  it.each(ALL_KINDS)(
    'chuyển hóa trực tiếp sang dạng %s đạt 100%% kiểm tra cấu trúc (checkArtifact)',
    (kind) => {
      const artifact = transformFactoryToArtifact(kind, richSource);
      expect(artifact).not.toBeNull();
      expect(artifact!.kind).toBe(kind);
      const checks = checkArtifact(artifact!);
      const failed = checks.filter((c) => !c.ok);
      expect(failed).toEqual([]);
    },
  );

  it('dựng Kế hoạch bài dạy chuẩn Công văn 5512 đạt 100% checkKhbdStructure', () => {
    const blooms = ['Nhớ', 'Hiểu', 'Vận dụng', 'Phân tích'];
    const md = buildKhbdFromStandard(richSource, blooms, 'Lớp 10A1 (30 học sinh)');
    const checks = checkKhbdStructure(md, blooms);
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(md).toContain('KẾ HOẠCH BÀI DẠY');
    expect(md).toContain('Mệnh đề logic là một câu khẳng định');
  });
});
