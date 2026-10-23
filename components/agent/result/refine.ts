// Logic thuần của "Viết lại đoạn này": lệnh nhanh, gọi API chỉnh sửa bằng lời, kiểm tra công thức còn nguyên,
// thay thân một mục trong văn bản. Tách khỏi giao diện để kiểm thử được.
import { splitMath } from '@/lib/text/math';

export const QUICK_COMMANDS: { id: string; label: string; instruction: string }[] = [
  { id: 'ngan', label: 'Ngắn hơn', instruction: 'Rút gọn đoạn này, giữ ý chính và các con số, công thức.' },
  { id: 'de', label: 'Dễ hơn cho lớp yếu', instruction: 'Viết lại dễ hiểu hơn cho học sinh yếu: câu ngắn, từ đơn giản, thêm gợi ý từng bước.' },
  { id: 'vidu', label: 'Thêm ví dụ', instruction: 'Thêm một ví dụ cụ thể, gần gũi với học sinh vào đoạn này.' },
  { id: 'nhom', label: 'Thêm hoạt động nhóm', instruction: 'Thêm một hoạt động nhóm ngắn (3 đến 5 học sinh) vào đoạn này, nêu rõ nhiệm vụ và sản phẩm.' },
  { id: 'nangcao', label: 'Nâng cao hơn', instruction: 'Nâng độ khó: thêm câu hỏi hoặc yêu cầu vận dụng, phân tích cho học sinh khá giỏi.' },
];

export const INSTRUCTION_MAX = 500;
export const TEXT_MAX = 60000;

export interface RefineContext {
  monHoc?: string;
  khoi?: string;
  lop?: string;
  baiDayTen?: string;
  phongCach?: string;
}

export type RefineResult = { ok: true; text: string; mathChanged: boolean } | { ok: false; message: string };

/** Mọi công thức ở bản gốc có còn trong bản mới không (so sánh sau khi bỏ khoảng trắng). */
export function mathPreserved(before: string, after: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, '');
  const b = splitMath(before).filter((x) => x.type === 'math');
  if (b.length === 0) return true;
  const a = new Set(splitMath(after).filter((x) => x.type === 'math').map((x) => norm(x.value)));
  return b.every((x) => a.has(norm(x.value)));
}

const FRIENDLY: Record<number, string> = {
  401: 'Cô/thầy cần đăng nhập lại để dùng tính năng này.',
  403: 'Tài khoản này chưa được dùng tính năng viết lại.',
  404: 'Tính năng viết lại bằng lời chưa sẵn sàng. Cô/thầy dùng nút Chỉnh sửa để sửa tay giúp nhé.',
  413: 'Đoạn này dài quá để viết lại một lần. Cô/thầy chia nhỏ hơn giúp nhé.',
  429: 'Cô/thầy đã dùng nhiều lượt trong thời gian ngắn hoặc hết hạn mức hôm nay. Thử lại sau ít phút nhé.',
};

/** Gọi POST /api/workflows/refine. Không bao giờ ném lỗi: mọi sự cố thành thông báo tiếng Việt. */
export async function requestRefine(
  args: { instruction: string; text: string; sectionHeading?: string; format?: string; context?: RefineContext },
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<RefineResult> {
  const instruction = args.instruction.trim().slice(0, INSTRUCTION_MAX);
  if (!instruction) return { ok: false, message: 'Cô/thầy nhập điều muốn chỉnh, ví dụ: “rút còn một nửa”.' };
  if (!args.text.trim()) return { ok: false, message: 'Mục này đang trống nên chưa có gì để viết lại.' };
  if (args.text.length > TEXT_MAX) return { ok: false, message: FRIENDLY[413] };
  try {
    const res = await fetchImpl('/api/workflows/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction,
        text: args.text,
        sectionHeading: args.sectionHeading || undefined,
        format: args.format || undefined,
        context: args.context,
      }),
      signal,
    });
    const data = await res.json().then((j: unknown) => (j && typeof j === 'object' ? (j as { ok?: boolean; text?: unknown; error?: unknown }) : null)).catch(() => null);
    if (!res.ok || !data || data.ok === false) {
      const own = typeof data?.error === 'string' && data.error.trim() && res.status !== 404 ? data.error.trim() : '';
      return { ok: false, message: own || FRIENDLY[res.status] || 'Chưa viết lại được lúc này. Cô/thầy thử lại sau ít giây nhé.' };
    }
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (!text) return { ok: false, message: 'Trợ lý chưa trả về nội dung mới. Cô/thầy thử nói rõ hơn một chút nhé.' };
    return { ok: true, text, mathChanged: !mathPreserved(args.text, text) };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return { ok: false, message: 'Đã dừng.' };
    return { ok: false, message: 'Mất kết nối nên chưa viết lại được. Cô/thầy kiểm tra mạng rồi thử lại nhé.' };
  }
}

/** Thay thân của mục thứ `index`, giữ nguyên tiêu đề và các mục khác. */
export function replaceSectionBody<T extends { heading: string; body: string }>(sections: T[], index: number, body: string): T[] {
  return sections.map((s, i) => (i === index ? { ...s, body } : s));
}
