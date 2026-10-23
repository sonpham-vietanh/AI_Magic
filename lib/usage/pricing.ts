// Bảng giá THAM KHẢO (USD cho mỗi 1 triệu token). Giá nhà cung cấp CÓ THỂ ĐỔI bất cứ lúc nào và gói miễn phí
// có thể tính 0 đồng; con số ở đây chỉ để ước lượng chi phí, không phải hoá đơn thật.
// Ghi đè bằng biến môi trường USAGE_PRICING_JSON, ví dụ:
//   {"google/gemini-2.5-flash":{"in":0.3,"out":2.5},"my-model":{"in":1,"out":4}}
// Khoá được so khớp theo "chuỗi con" (không phân biệt hoa thường), khoá dài hơn được ưu tiên.

export interface ModelPrice {
  in: number;
  out: number;
}

export const DEFAULT_PRICING: Record<string, ModelPrice> = {
  'gemini-2.5-flash-lite': { in: 0.1, out: 0.4 },
  'gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'gemini-2.5-pro': { in: 1.25, out: 10 },
  'gemini-2.0-flash': { in: 0.1, out: 0.4 },
  'deepseek-reasoner': { in: 0.55, out: 2.19 },
  'deepseek-r1': { in: 0.55, out: 2.19 },
  deepseek: { in: 0.27, out: 1.1 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-haiku': { in: 0.8, out: 4 },
  'claude-sonnet': { in: 3, out: 15 },
  'claude-opus': { in: 15, out: 75 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4.1': { in: 2, out: 8 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'llama-3.3-70b': { in: 0.59, out: 0.79 },
};

/** Giá dùng cho mô hình lạ (không khớp khoá nào): cố tình hơi cao để không đánh giá thấp chi phí. */
export const FALLBACK_PRICE: ModelPrice = { in: 0.5, out: 2 };

export function loadPricing(env: NodeJS.ProcessEnv = process.env): Record<string, ModelPrice> {
  const merged: Record<string, ModelPrice> = { ...DEFAULT_PRICING };
  const raw = env.USAGE_PRICING_JSON?.trim();
  if (!raw) return merged;
  try {
    const parsed = JSON.parse(raw) as Record<string, { in?: unknown; out?: unknown }>;
    for (const [k, v] of Object.entries(parsed)) {
      const i = Number(v?.in);
      const o = Number(v?.out);
      if (k && Number.isFinite(i) && Number.isFinite(o) && i >= 0 && o >= 0) merged[k.toLowerCase()] = { in: i, out: o };
    }
  } catch {
    console.error('[usage] USAGE_PRICING_JSON không phải JSON hợp lệ, dùng bảng giá mặc định.');
  }
  return merged;
}

export function priceFor(model: string, pricing: Record<string, ModelPrice> = loadPricing()): { price: ModelPrice; known: boolean } {
  const m = model.toLowerCase();
  const keys = Object.keys(pricing).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (m.includes(k.toLowerCase())) return { price: pricing[k], known: true };
  }
  return { price: FALLBACK_PRICE, known: false };
}

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number, pricing?: Record<string, ModelPrice>): number {
  const { price } = priceFor(model, pricing);
  const usd = (promptTokens * price.in + completionTokens * price.out) / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

/** Ước tính số token từ độ dài văn bản khi nhà cung cấp không trả về usage (xấp xỉ 3 ký tự mỗi token). */
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 3);
}
