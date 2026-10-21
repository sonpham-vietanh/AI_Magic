const act = (n: number, name: string) =>
  `### Hoạt động ${n}: ${name}\na) Mục tiêu: x\nb) Nội dung: y\nc) Sản phẩm: z\nd) Tổ chức thực hiện: w\n`;

export const BLOOMS = ['Hiểu', 'Vận dụng', 'Phân tích', 'Đánh giá'];

export const FULL_KHBD =
  '# KẾ HOẠCH BÀI DẠY\n\n## I. Mục tiêu\n1. Kiến thức: a\n2. Năng lực: b\n3. Phẩm chất: c\nBloom: Hiểu, Vận dụng, Phân tích, Đánh giá.\n\n' +
  '## II. Thiết bị dạy học và học liệu\n- máy chiếu\n\n## III. Tiến trình dạy học\n' +
  act(1, 'Mở đầu') +
  act(2, 'Hình thành kiến thức mới') +
  act(3, 'Luyện tập') +
  act(4, 'Vận dụng');

/** Thiếu hoạt động Vận dụng, thiếu phẩm chất, không nhắc Bloom. */
export const THIEU_KHBD =
  '# KẾ HOẠCH BÀI DẠY\n\n## I. Mục tiêu\n1. Kiến thức: a\n2. Năng lực: b\n\n## II. Thiết bị dạy học và học liệu\n- x\n\n## III. Tiến trình dạy học\n' +
  act(1, 'Mở đầu') +
  act(2, 'Hình thành kiến thức mới') +
  act(3, 'Luyện tập');
