// Danh bạ dịch vụ ngoài theo mục "Dịch vụ ngoài — mua, không tự xây" của sơ đồ v2.1.
// Chỉ MÔ TẢ và suy trạng thái từ biến môi trường. KHÔNG có tích hợp thật với Gamma/Canva/Gemini Notebook/TTS
// (chưa có khoá/license). Hàm suy trạng thái chỉ trả boolean: không bao giờ trả giá trị biến.

export interface ServiceDef {
  id: string;
  name: string;
  purpose: string;
  products: string[];
  /** Tên biến môi trường dự kiến; cấu hình khi có ÍT NHẤT MỘT biến trong mỗi nhóm `envAny`. */
  envAny: string[][];
  /** Dịch vụ mà hệ thống ĐÃ nối thật khi được cấu hình. */
  wired: boolean;
  /** Điều hệ thống đang làm thay khi chưa cấu hình / chưa nối. */
  fallback: string;
  note?: string;
}

export const SERVICES: ServiceDef[] = [
  {
    id: 'llm',
    name: 'Mô hình ngôn ngữ (Claude / GPT / Gemini)',
    purpose: 'Sinh kế hoạch bài dạy, slide, worksheet, quiz, đề kiểm tra và 6 dạng tài nguyên.',
    products: ['Kế hoạch bài dạy', 'Slide', 'Worksheet', 'Quiz', 'Đề kiểm tra + ma trận', '6 dạng tài nguyên'],
    envAny: [['OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY']],
    wired: true,
    fallback:
      'Chưa có khoá thì chỉ chạy bộ dựng mẫu cục bộ (smart template) và các bước kiểm tra xác định; không sinh nội dung mới bằng AI.',
    note: 'Đã nối thật qua OpenAI-tương thích, OpenRouter hoặc Gemini; khoá chỉ nằm ở máy chủ.',
  },
  {
    id: 'gamma',
    name: 'Gamma',
    purpose: 'Dựng slide đẹp từ dàn ý.',
    products: ['Slide (PPTX)'],
    envAny: [['GAMMA_API_KEY']],
    wired: false,
    fallback: 'Hệ thống tự dựng tệp PPTX từ dữ liệu slide (bố cục đơn giản, không có hình do AI vẽ).',
    note: 'Chưa có khoá/license nên CHƯA tích hợp. Biến dự kiến: GAMMA_API_KEY.',
  },
  {
    id: 'canva',
    name: 'Canva',
    purpose: 'Ảnh minh hoạ và infographic thiết kế sẵn.',
    products: ['Infographic', 'Ảnh minh hoạ slide'],
    envAny: [['CANVA_API_KEY', 'CANVA_CLIENT_ID']],
    wired: false,
    fallback: 'Hệ thống tự dựng ảnh SVG/PNG cho infographic và sơ đồ tư duy từ dữ liệu có cấu trúc.',
    note: 'Chưa có khoá/license nên CHƯA tích hợp. Biến dự kiến: CANVA_API_KEY.',
  },
  {
    id: 'gemini-notebook',
    name: 'Gemini Notebook API',
    purpose: 'Sinh podcast và audio tranh luận 2 chuyên gia từ nguồn đã duyệt.',
    products: ['Podcast', 'Audio tranh luận 2 chuyên gia'],
    envAny: [['GEMINI_NOTEBOOK_API_KEY']],
    wired: false,
    fallback: 'Hệ thống chỉ sinh kịch bản; giọng đọc dùng chức năng đọc to có sẵn của trình duyệt (không tạo tệp âm thanh).',
    note:
      'Cần license Google Workspace for Education Premium (add-on). KHÔNG dùng tích hợp phi chính thức. Chưa có license nên CHƯA tích hợp. Biến dự kiến: GEMINI_NOTEBOOK_API_KEY.',
  },
  {
    id: 'tts-stt',
    name: 'Chuyển văn bản thành giọng nói / giọng nói thành văn bản (TTS/STT)',
    purpose: 'Giọng đọc cho podcast, audio tranh luận và video; ghi chú bằng giọng nói.',
    products: ['Podcast', 'Audio tranh luận', 'Video 1–8 phút'],
    envAny: [['TTS_API_KEY', 'STT_API_KEY']],
    wired: false,
    fallback:
      'Đọc to bằng giọng của trình duyệt trên máy cô/thầy; video chỉ có kịch bản phân cảnh, chưa dựng tệp video.',
    note: 'Chưa có khoá nên CHƯA tích hợp. Biến dự kiến: TTS_API_KEY, STT_API_KEY.',
  },
  {
    id: 'news-whitelist',
    name: 'Nguồn tin danh sách trắng',
    purpose: 'Sự kiện thời sự tuỳ chọn cho bài dạy, qua guardrail thời sự.',
    products: ['Kế hoạch bài dạy (ví dụ thời sự)'],
    envAny: [],
    wired: true,
    fallback: 'Guardrail đã chạy: chỉ nhận nguồn trong danh sách trắng, loại chủ đề nhạy cảm, không dùng sự kiện dưới 48 giờ.',
    note: 'Không cần khoá: giáo viên dán đường dẫn, hệ thống kiểm tra nguồn. Chưa có bộ thu thập tin tự động.',
  },
];

export interface ServiceStatus {
  id: string;
  name: string;
  purpose: string;
  products: string[];
  configured: boolean;
  /** Đã có mã nối thật trong hệ thống hay chưa (độc lập với khoá). */
  wired: boolean;
  /** Trạng thái tổng hợp để hiển thị. */
  state: 'dang_dung' | 'da_cau_hinh_chua_noi' | 'chua_cau_hinh';
  fallback: string;
  note?: string;
  envNames: string[];
}

export type EnvLike = Record<string, string | undefined>;

/** Chỉ kiểm tra có/không có giá trị khác rỗng. KHÔNG trả giá trị biến. */
export function isConfigured(def: ServiceDef, env: EnvLike): boolean {
  if (def.envAny.length === 0) return true;
  return def.envAny.every((group) => group.some((name) => (env[name] ?? '').trim().length > 0));
}

export function computeStatuses(env: EnvLike, defs: ServiceDef[] = SERVICES): ServiceStatus[] {
  return defs.map((d) => {
    const configured = isConfigured(d, env);
    const state: ServiceStatus['state'] = !configured
      ? 'chua_cau_hinh'
      : d.wired
        ? 'dang_dung'
        : 'da_cau_hinh_chua_noi';
    return {
      id: d.id,
      name: d.name,
      purpose: d.purpose,
      products: d.products,
      configured,
      wired: d.wired,
      state,
      fallback: d.fallback,
      note: d.note,
      envNames: d.envAny.flat(),
    };
  });
}
