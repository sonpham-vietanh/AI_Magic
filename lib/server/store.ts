import { join } from 'node:path';
import { readJsonStrict, writeJsonAtomic } from './safeJson';
import type { GeneratedResource, MajorOsUsageEvent } from '../types';

interface StoreData {
  resources: GeneratedResource[];
  usageEvents: MajorOsUsageEvent[];
}

const STORE_FILE = join(process.cwd(), '.data', 'teaching-studio-store.json');

const SEED_RESOURCES: GeneratedResource[] = [
  {
    id: 'res_seed_toan7_thongke',
    createdAt: '2026-10-15T08:30:00+07:00',
    toolId: 'khbd-5512',
    toolName: 'Kế hoạch bài dạy chuẩn Công văn 5512 (4 Hoạt động)',
    category: 'ke_hoach_bai_day',
    teacher: {
      email: 'lan.nguyen@truongvietanh.com',
      name: 'Nguyễn Thị Lan',
    },
    grade: '7',
    subject: 'toan',
    classId: 'class-7a1-aht',
    className: '7A1',
    knowledgeNodeId: 'kg-7-toan-thong-ke-bieu-do',
    linkedNodeIds: ['kg-7-khtn-quang-hop-ho-hap-te-bao', 'kg-7-ngu-van-van-ban-thong-tin-thuyet-minh', 'kg-7-tin-hoc-bang-tinh-dien-tu'],
    title: 'Kế hoạch bài dạy CV 5512: Thu thập, Phân loại dữ liệu & Biểu đồ (Lớp 7A1 - Liên môn KHTN, Tin học, Ngữ văn)',
    markdownContent: `# KẾ HOẠCH BÀI DẠY CHUẨN CÔNG VĂN 5512\n> **Môn:** Toán 7 · **Lớp:** 7A1 (Cơ sở AHT — 30 HS) · **GV:** Nguyễn Thị Lan\n\n## I. Mục tiêu bài học (GDPT 2018)\n- Thực hiện và lý giải được việc thu thập, phân loại dữ liệu thực tế tại lớp 7A1.\n- Đọc và vẽ được biểu đồ hình quạt tròn, biểu đồ đoạn thẳng; kết nối trực tiếp với số liệu thí nghiệm Quang hợp (KHTN 7) và thực hành Excel (Tin học 7).\n\n## II. Tiến trình 4 Hoạt động (Công văn 5512)\n- **Hoạt động 1 (Mở đầu - 6 phút):** Khảo sát nhanh trực tiếp tại lớp 7A1 về thời gian ngủ và môn thể thao yêu thích (Bóng rổ, Robotics).\n- **Hoạt động 2 (Hình thành kiến thức - 15 phút):** Phân loại dữ liệu định tính và định lượng.\n- **Hoạt động 3 (Luyện tập phân hóa 3 mức - 14 phút):** Nhóm Cơ bản (5 HS, hỗ trợ mã VA-2026-00417, VA-2026-00422), Nhóm Chuẩn (17 HS), Nhóm Nâng cao (8 HS).\n- **Hoạt động 4 (Vận dụng Liên môn - 10 phút):** Chuyển bảng dữ liệu sang giờ Tin học 7 để vẽ biểu đồ và viết đoạn văn thuyết minh Ngữ văn 7.`,
    structuredSections: [
      {
        heading: 'I. Mục tiêu bài học (GDPT 2018)',
        body: 'Thực hiện và lý giải được việc thu thập, phân loại dữ liệu thực tế tại lớp 7A1; đọc và mô tả biểu đồ hình quạt tròn, biểu đồ đoạn thẳng.',
      },
      {
        heading: 'II. Tiến trình dạy học (4 Hoạt động CV 5512)',
        body: 'Đầy đủ 4 hoạt động Mở đầu - Hình thành kiến thức - Luyện tập - Vận dụng có gắn kết dữ liệu thực nghiệm KHTN 7 và Tin học 7.',
      },
    ],
    differentiationSummary: {
      coBan: '5 HS (17%): Bảng dữ liệu mẫu có sẵn cột phân loại, hỗ trợ hộp công thức trực quan cho mã HS VA-2026-00417.',
      chuan: '17 HS (56%): Khảo sát nhóm 4 người và lập bảng thống kê hoàn chỉnh.',
      nangCao: '8 HS (27%): Phát hiện dữ liệu bất hợp lý và thuyết trình nhận xét bằng Tiếng Anh (PET B1).',
    },
    crossSubjectHighlights: [
      {
        targetSubject: 'khtn',
        targetTopic: 'KHTN 7: Quang hợp ở thực vật & Hô hấp tế bào',
        integrationActivity: 'Sử dụng số liệu đếm bọt khí O₂ thoát ra theo khoảng cách ánh sáng để vẽ biểu đồ đoạn thẳng.',
      },
      {
        targetSubject: 'ngu_van',
        targetTopic: 'Ngữ văn 7: Văn bản thông tin & Bài văn thuyết minh',
        integrationActivity: 'Dùng biểu đồ vừa vẽ làm phương tiện phi ngôn ngữ trong bài viết thuyết minh.',
      },
    ],
    moetComplianceChecklist: [
      { criterion: 'Chuẩn Công văn 5512/BGDĐT-GDTrH', passed: true, note: 'Đủ 4 hoạt động × 4 bước.' },
      { criterion: 'Phân hóa theo Hồ sơ Lớp 7A1', passed: true, note: 'Khớp sĩ số 30 HS và mã hỗ trợ VA-2026-00417.' },
      { criterion: 'Liên kết Liên môn Knowledge Graph', passed: true, note: 'Kết nối Toán 7 - KHTN 7 - Ngữ văn 7 - Tin học 7.' },
    ],
    generationMode: 'smart_template',
    modelUsed: 'Việt Anh Smart Pedagogical Engine v2.0',
    estimatedMinutesSaved: 60,
  },
  {
    id: 'res_seed_thlm_khoi10_parabol',
    createdAt: '2026-10-15T10:15:00+07:00',
    toolId: 'thlm-knowledge-graph',
    toolName: 'Thiết kế Chủ đề Tích hợp Liên môn từ Knowledge Graph',
    category: 'tich_hop_lien_mon',
    teacher: {
      email: 'huy.hoang@truongvietanh.com',
      name: 'Hoàng Gia Huy',
    },
    grade: '10',
    subject: 'toan',
    classId: 'class-10a1-aht',
    className: '10A1',
    knowledgeNodeId: 'kg-10-toan-ham-so-bac-hai-va-menh-de',
    linkedNodeIds: ['kg-10-vat-ly-chuyen-dong-bien-doi-va-nem-xien', 'kg-10-gdcd-ung-dung-cung-cau-thi-truong', 'kg-10-tin-hoc-lap-trinh-python-du-lieu'],
    title: 'Chủ đề Liên môn Khối 10: Đường Parabol từ Quỹ đạo Bóng rổ (Vật lý) đến Tối ưu Lợi nhuận (GDKTPL) & Mô phỏng Python (Tin học)',
    markdownContent: `# CHỦ ĐỀ TÍCH HỢP LIÊN MÔN KHỐI 10 (LỚP 10A1)\n> **Các môn tích hợp:** Toán 10 × Vật lý 10 × GDKTPL 10 × Tin học 10\n\n## I. Sơ đồ Kết nối Knowledge Graph\n- **Toán 10:** Hàm số bậc hai y = ax² + bx + c và tọa độ đỉnh Parabol I(-b/2a; -Δ/4a).\n- **Vật lý 10:** Quỹ đạo chuyển động ném xiên của quả bóng rổ tại sân trường Việt Anh.\n- **GDKTPL 10:** Bài toán định giá bán sản phẩm hội chợ trường để hàm Lợi nhuận bậc hai đạt cực đại.\n- **Tin học 10:** Viết chương trình Python tự động tính đỉnh Parabol và mô phỏng quỹ đạo ném.`,
    structuredSections: [
      {
        heading: 'I. Sơ đồ Kết nối Knowledge Graph giữa 4 Môn học',
        body: 'Kết nối đồng bộ tuần 5–9 của Khối 10 giữa Toán học, Vật lý, Giáo dục Kinh tế & Pháp luật và Tin học Python.',
      },
      {
        heading: 'II. Tiến trình Hoạt động Thực nghiệm & Dự án Nhóm Lớp 10A1',
        body: 'Học sinh quay video cú ném bóng rổ, lập hàm bậc hai, chạy script Python kiểm chứng và giải bài toán tối ưu doanh thu.',
      },
    ],
    differentiationSummary: {
      coBan: '5 HS (18%): Minh họa trực quan sự dịch chuyển đỉnh Parabol trên GeoGebra cho mã HS VA-2026-00711.',
      chuan: '15 HS (53%): Giải bài toán quỹ đạo ném xiên và bài toán doanh thu cực đại.',
      nangCao: '8 HS (29%): Viết code Python mô phỏng và thuyết trình báo cáo song ngữ IELTS 6.0.',
    },
    crossSubjectHighlights: [
      {
        targetSubject: 'vat_ly',
        targetTopic: 'Vật lý 10: Chuyển động ném ngang và ném xiên',
        integrationActivity: 'Tìm độ cao cực đại và tầm bay xa bằng công thức đỉnh Parabol.',
      },
      {
        targetSubject: 'gdcd_gdktpl',
        targetTopic: 'GDKTPL 10: Cơ chế thị trường & Tối ưu Doanh thu - Lợi nhuận',
        integrationActivity: 'Xác định mức giá bán tối ưu cho gian hàng khởi nghiệp học sinh.',
      },
    ],
    moetComplianceChecklist: [
      { criterion: 'Dạy học tích hợp liên môn CT GDPT 2018', passed: true, note: '4 môn cùng khai thác 1 mô hình toán học.' },
      { criterion: 'Thấm nhuần triết lý Vui vẻ và Thực dụng', passed: true, note: 'Gắn với bóng rổ và khởi nghiệp học đường.' },
    ],
    generationMode: 'smart_template',
    modelUsed: 'Việt Anh Smart Pedagogical Engine v2.0',
    estimatedMinutesSaved: 75,
  },
  {
    id: 'res_seed_ktdg_vatly12_2025',
    createdAt: '2026-10-15T14:20:00+07:00',
    toolId: 'ktdg-dinh-dang-moi-2025',
    toolName: 'Bộ Câu hỏi Trắc nghiệm Đúng/Sai & Trả lời ngắn (Format Thi 2025+)',
    category: 'kiem_tra_danh_gia',
    teacher: {
      email: 'vinh.do@truongvietanh.com',
      name: 'Đỗ Quang Vinh',
    },
    grade: '12',
    subject: 'vat_ly',
    classId: 'class-12a1-aht',
    className: '12A1',
    knowledgeNodeId: 'kg-12-vat-ly-nhiet-hoc-va-khi-ly-tuong',
    linkedNodeIds: ['kg-12-toan-ung-dung-dao-ham-va-nguyen-ham-tich-phan'],
    title: 'Bộ Câu hỏi Đúng/Sai & Trả lời ngắn Định dạng 2025+: Khí lý tưởng & Nhiệt động lực học (Lớp 12A1)',
    markdownContent: `# ĐỀ LUYỆN TẬP ĐỊNH DẠNG MỚI 2025+ (LỚP 12A1)\n> **Môn:** Vật lý 12 · **Liên kết:** Toán 12 (Khảo sát hàm phân thức & Đạo hàm)\n\n## Phần I: Câu hỏi Trắc nghiệm Đúng/Sai (4 mệnh đề a, b, c, d)\n- **Câu 1 (Ngữ liệu thực tế):** Khảo sát áp suất lốp xe ô tô khi di chuyển trên cao tốc TP.HCM – Long Thành – Dầu Giây vào buổi trưa nắng nóng...\n\n## Phần II: Câu hỏi Trả lời ngắn\n- Tính công thực hiện của khối khí và hiệu suất động cơ nhiệt làm tròn đến chữ số thập phân thứ nhất.`,
    structuredSections: [
      {
        heading: 'Phần I: Câu hỏi Trắc nghiệm Đúng/Sai (Kèm ngữ liệu thực tế)',
        body: '4 câu chùm (16 mệnh đề) đi từ Nhận biết -> Thông hiểu -> Vận dụng -> Vận dụng cao.',
      },
      {
        heading: 'Phần II: Câu hỏi Trắc nghiệm Trả lời ngắn & Hướng dẫn chấm',
        body: '6 câu trả lời ngắn rèn kỹ năng tính toán chính xác và tránh bẫy đổi đơn vị.',
      },
    ],
    differentiationSummary: {
      coBan: '4 HS (16%): Nắm chắc điểm các mệnh đề a, b trong phần Đúng/Sai.',
      chuan: '13 HS (52%): Giải quyết trọn vẹn mệnh đề c và các câu trả lời ngắn tiêu chuẩn.',
      nangCao: '8 HS (32%): Chinh phục mệnh đề d và bài toán đồ thị liên kết Đạo hàm Toán 12.',
    },
    crossSubjectHighlights: [
      {
        targetSubject: 'toan',
        targetTopic: 'Toán 12: Khảo sát hàm số & Ứng dụng đạo hàm',
        integrationActivity: 'Phân tích độ dốc tiếp tuyến trên đồ thị đẳng nhiệt Hyperbol p = nRT/V.',
      },
    ],
    moetComplianceChecklist: [
      { criterion: 'Quyết định 4068/QĐ-BGDĐT (Định dạng đề thi 2025+)', passed: true, note: 'Chuẩn cấu trúc Đúng/Sai và Trả lời ngắn.' },
    ],
    generationMode: 'smart_template',
    modelUsed: 'Việt Anh Smart Pedagogical Engine v2.0',
    estimatedMinutesSaved: 55,
  },
];

const SEED_USAGE_EVENTS: MajorOsUsageEvent[] = [
  {
    id: 'evt_va_tr_0001',
    luc: '2026-10-15T08:30:12+07:00',
    nguoi: { email: 'lan.nguyen@truongvietanh.com', ten: 'Nguyễn Thị Lan' },
    tinh_nang: 'sinh_hoc_lieu',
    so_lan: 1,
    so_phut: 14,
    cong_cu_id: 'khbd-5512',
    mon_hoc: 'toan',
    khoi_lop: '7',
    lop_hoc: '7A1',
  },
  {
    id: 'evt_va_tr_0002',
    luc: '2026-10-15T08:42:05+07:00',
    nguoi: { email: 'lan.nguyen@truongvietanh.com', ten: 'Nguyễn Thị Lan' },
    hoc_sinh: { ma: 'VA-2026-00417' },
    tinh_nang: 'phan_hoa_lop_hoc',
    so_lan: 1,
    so_phut: 8,
    cong_cu_id: 'phht-phan-hoa-3-muc',
    mon_hoc: 'toan',
    khoi_lop: '7',
    lop_hoc: '7A1',
  },
  {
    id: 'evt_va_tr_0003',
    luc: '2026-10-15T10:15:30+07:00',
    nguoi: { email: 'huy.hoang@truongvietanh.com', ten: 'Hoàng Gia Huy' },
    tinh_nang: 'ket_noi_lien_mon',
    so_lan: 1,
    so_phut: 18,
    cong_cu_id: 'thlm-knowledge-graph',
    mon_hoc: 'toan',
    khoi_lop: '10',
    lop_hoc: '10A1',
  },
  {
    id: 'evt_va_tr_0004',
    luc: '2026-10-15T14:20:00+07:00',
    nguoi: { email: 'vinh.do@truongvietanh.com', ten: 'Đỗ Quang Vinh' },
    tinh_nang: 'sinh_hoc_lieu',
    so_lan: 1,
    so_phut: 15,
    cong_cu_id: 'ktdg-dinh-dang-moi-2025',
    mon_hoc: 'vat_ly',
    khoi_lop: '12',
    lop_hoc: '12A1',
  },
  {
    id: 'evt_va_tr_0005',
    luc: '2026-10-16T08:10:00+07:00',
    nguoi: { email: 'son.nguyen@truongvietanh.com', ten: 'Nguyễn Sơn' },
    tinh_nang: 'sinh_hoc_lieu',
    so_lan: 1,
    so_phut: 12,
    cong_cu_id: 'khbd-5e',
    mon_hoc: 'khtn',
    khoi_lop: '7',
    lop_hoc: '7A2',
  },
];

const MAX_USAGE_EVENTS = 5000;
const MAX_RESOURCES = 1000;

let mutexTail: Promise<unknown> = Promise.resolve();

/** Serialize read-modify-write cycles within this process. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutexTail.then(fn, fn);
  mutexTail = run.catch(() => undefined);
  return run;
}

function seedStore(): StoreData {
  return {
    resources: [...SEED_RESOURCES],
    usageEvents: [...SEED_USAGE_EVENTS],
  };
}

async function readStore(): Promise<StoreData> {
  // Chỉ "chưa có file" mới gieo dữ liệu mẫu; lỗi đọc khác ném lên (không ghi đè dữ liệu thật).
  const parsed = await readJsonStrict<Partial<StoreData> | null>(STORE_FILE, () => null);
  if (!parsed || typeof parsed !== 'object') return seedStore();
  return {
    resources: Array.isArray(parsed.resources) ? parsed.resources : [...SEED_RESOURCES],
    usageEvents: Array.isArray(parsed.usageEvents) ? parsed.usageEvents : [...SEED_USAGE_EVENTS],
  };
}

async function writeStore(data: StoreData): Promise<void> {
  await writeJsonAtomic(STORE_FILE, data);
}

export const listSavedResources = async (filter?: {
  subject?: string;
  grade?: string;
  classId?: string;
  category?: string;
}): Promise<GeneratedResource[]> => {
  const store = await readStore();
  return store.resources.filter((r) => {
    if (filter?.subject && filter.subject !== 'all' && r.subject !== filter.subject) return false;
    if (filter?.grade && filter.grade !== 'all' && r.grade !== filter.grade) return false;
    if (filter?.classId && filter.classId !== 'all' && r.classId !== filter.classId) return false;
    if (filter?.category && filter.category !== 'all' && r.category !== filter.category) return false;
    return true;
  });
};

export const saveGeneratedResource = async (
  resource: GeneratedResource,
): Promise<GeneratedResource> =>
  withLock(async () => {
    const store = await readStore();
    const existingIdx = store.resources.findIndex((r) => r.id === resource.id);
    if (existingIdx >= 0) {
      store.resources[existingIdx] = resource;
    } else {
      store.resources.unshift(resource);
    }
    if (store.resources.length > MAX_RESOURCES) {
      store.resources = store.resources.slice(0, MAX_RESOURCES);
    }
    await writeStore(store);
    return resource;
  });

export const recordUsageEvent = async (
  event: Omit<MajorOsUsageEvent, 'id' | 'luc'> & { id?: string; luc?: string },
): Promise<MajorOsUsageEvent> =>
  withLock(async () => {
  const store = await readStore();
  const tzOffsetMs = 7 * 60 * 60 * 1000;
  const localIso = new Date(Date.now() + tzOffsetMs).toISOString().replace('Z', '+07:00');
  const fullEvent: MajorOsUsageEvent = {
    id: event.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    luc: event.luc || localIso,
    nguoi: event.nguoi,
    hoc_sinh: event.hoc_sinh,
    tinh_nang: event.tinh_nang,
    so_lan: event.so_lan ?? 1,
    so_phut: event.so_phut,
    cong_cu_id: event.cong_cu_id,
    mon_hoc: event.mon_hoc,
    khoi_lop: event.khoi_lop,
    lop_hoc: event.lop_hoc,
  };
  store.usageEvents.push(fullEvent);
  if (store.usageEvents.length > MAX_USAGE_EVENTS) {
    store.usageEvents = store.usageEvents.slice(-MAX_USAGE_EVENTS);
  }
  await writeStore(store);
  return fullEvent;
  });

export const listRecentUsageEvents = async (limit = 100): Promise<MajorOsUsageEvent[]> => {
  const store = await readStore();
  return store.usageEvents
    .slice()
    .sort((a, b) => (Date.parse(a.luc) || 0) - (Date.parse(b.luc) || 0))
    .slice(-Math.max(1, Math.min(limit, 500)));
};

export const queryMajorOsEvents = async (params: {
  tu?: string | null;
  den?: string | null;
  trangSau?: string | null;
  limit?: number;
}): Promise<{ du_lieu: MajorOsUsageEvent[]; trang_sau: string | null }> => {
  const store = await readStore();
  const pageSize = Math.min(Math.max(params.limit ?? 500, 1), 500);
  const fromTime = params.tu ? Date.parse(params.tu) : null;
  const toTime = params.den ? Date.parse(params.den) : null;

  const filtered = store.usageEvents
    .filter((evt) => {
      const t = Date.parse(evt.luc);
      if (fromTime !== null && !Number.isNaN(fromTime) && t < fromTime) return false;
      if (toTime !== null && !Number.isNaN(toTime) && t > toTime) return false;
      return true;
    })
    .sort((a, b) => {
      const d = (Date.parse(a.luc) || 0) - (Date.parse(b.luc) || 0);
      return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  let startIndex = 0;
  if (params.trangSau) {
    try {
      const decoded = JSON.parse(Buffer.from(params.trangSau, 'base64url').toString('utf8')) as {
        offset?: number;
      };
      if (
        decoded &&
        typeof decoded.offset === 'number' &&
        Number.isInteger(decoded.offset) &&
        decoded.offset >= 0
      ) {
        startIndex = decoded.offset;
      }
    } catch {
      startIndex = 0;
    }
  }

  const slice = filtered.slice(startIndex, startIndex + pageSize);
  const nextOffset = startIndex + slice.length;
  const trang_sau =
    nextOffset < filtered.length
      ? Buffer.from(JSON.stringify({ offset: nextOffset }), 'utf8').toString('base64url')
      : null;

  return {
    du_lieu: slice,
    trang_sau,
  };
};
