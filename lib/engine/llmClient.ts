import { getUsageContext, type UsageContext } from '@/lib/usage/context';
import { estimateTokens } from '@/lib/usage/pricing';
import { getVariation, variationInstruction } from './variation';
import { isAiAuthText, type LlmErrorCode } from './llmErrors';

export interface LlmCallResult {
  ok: boolean;
  content?: string;
  modelUsed: string;
  error?: string;
  /** Mã lỗi để giao diện nói đúng (ai_auth = AI chưa đăng nhập/hết hạn...). */
  code?: LlmErrorCode;
}

const DEFAULT_OPENAI_MODEL = 'cc/claude-haiku-4-5-20251001';

function normalizeChatCompletionsUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function parseOpenAiCompatibleResponse(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) return '';

  // Case 1: Standard JSON response
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed) as {
        choices?: {
          message?: { content?: string };
          delta?: { content?: string };
        }[];
      };
      return (
        data.choices?.[0]?.message?.content?.trim() ||
        data.choices?.[0]?.delta?.content?.trim() ||
        ''
      );
    } catch {
      // Fall through to SSE parser if JSON parse fails
    }
  }

  // Case 2: SSE streaming chunks ("data: {...}")
  const chunks: string[] = [];
  for (const line of trimmed.split('\n')) {
    const clean = line.trim();
    if (!clean.startsWith('data:')) continue;
    const payload = clean.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const parsed = JSON.parse(payload) as {
        choices?: {
          delta?: { content?: string };
          message?: { content?: string };
        }[];
      };
      const piece =
        parsed.choices?.[0]?.delta?.content ??
        parsed.choices?.[0]?.message?.content ??
        '';
      if (piece) {
        chunks.push(piece);
      }
    } catch {
      // Ignore malformed SSE lines
    }
  }
  return chunks.join('').trim();
}

const TEMPLATE_LABEL = 'Việt Anh Smart Pedagogical Engine v2.0 (Chuẩn GDPT 2018)';
const SAFE_MODEL_RE = /^[A-Za-z0-9._:/-]{1,80}$/;

type DeltaHandler = (text: string) => void;

/**
 * Ngữ cảnh streaming: khi code gọi `callLiveLlm` (vd. từ generatePedagogicalResource)
 * bên trong `withLlmDeltaSink`, từng đoạn text sẽ được đẩy ra `onDelta` trong lúc
 * VẪN chỉ có MỘT lần gọi LLM. Dùng cho route SSE của /api/generate.
 */
// NOTE: file này bị bundle phía client (qua smartGenerator -> cleanPedagogicalText),
// nên không import tĩnh 'node:async_hooks'; lấy lúc runtime trên Node (>=22).
type DeltaStore = {
  run<T>(store: DeltaHandler, fn: () => T): T;
  getStore(): DeltaHandler | undefined;
};
const nodeAsyncHooks = (
  typeof process !== 'undefined'
    ? (process as unknown as {
        getBuiltinModule?: (id: string) => unknown;
      }).getBuiltinModule?.('node:async_hooks')
    : undefined
) as { AsyncLocalStorage: new () => DeltaStore } | undefined;
const deltaStore: DeltaStore = nodeAsyncHooks
  ? new nodeAsyncHooks.AsyncLocalStorage()
  : { run: (_s, fn) => fn(), getStore: () => undefined };
export const withLlmDeltaSink = <T>(
  onDelta: DeltaHandler,
  fn: () => Promise<T>,
): Promise<T> => deltaStore.run(onDelta, fn);

type LlmOpts = {
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  useCache?: boolean;
  /** Quá ngần này ms mà không thấy dữ liệu nào về thì bỏ kết nối (mặc định 40 giây). */
  stallMs?: number;
  /** false: không gắn yêu cầu "phương án khác" khi lượt đang sinh lại (dùng cho bước chấm điểm). */
  vary?: boolean;
};

const LLM_CACHE_MAX = 250;
const LLM_CACHE_TTL_MS = 30 * 60 * 1000;
const llmCache = new Map<
  string,
  { content: string; modelUsed: string; at: number }
>();
let rrCounter = 0;

export function clearLlmCache(): void {
  llmCache.clear();
}

export function getLlmCacheSize(): number {
  return llmCache.size;
}

function parseKeyPool(...rawValues: (string | undefined)[]): string[] {
  const keys: string[] = [];
  for (const raw of rawValues) {
    if (!raw) continue;
    for (const part of raw.split(/[,;\n]+/)) {
      const k = part.trim();
      if (k && !keys.includes(k)) keys.push(k);
    }
  }
  if (keys.length <= 1) return keys;
  const start = rrCounter++ % keys.length;
  return [...keys.slice(start), ...keys.slice(0, start)];
}

/**
 * Hạn chót CỨNG: bỏ chờ ngay khi tín hiệu huỷ phát ra, KHÔNG phụ thuộc việc fetch/stream có tự ngắt hay không.
 * Từng gặp: nhà cung cấp ngừng gửi dữ liệu sau khi đã trả phần đầu, `reader.read()` treo hàng trăm giây
 * dù đã đặt timeoutMs.
 */
function abortable<T>(p: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return p;
  return new Promise<T>((resolve, reject) => {
    const fail = () => reject(new Error('LLM timeout (đã quá thời gian chờ)'));
    if (signal.aborted) return fail();
    signal.addEventListener('abort', fail, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', fail);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', fail);
        reject(e);
      },
    );
  });
}

/** Thông tin đo lường thu thập trong lúc gọi; chỉ dùng để ghi sổ, không ảnh hưởng kết quả gọi. */
interface Meter {
  ctx?: UsageContext;
  attempted: boolean;
  /** true nếu bị chặn do hết hạn mức (không có lời gọi mạng nào). */
  blocked: boolean;
  provider?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
}

type OpenAiUsage = { prompt_tokens?: number; completion_tokens?: number; x_groq?: { usage?: OpenAiUsage } };
function readUsageInto(meter: Meter | undefined, u: OpenAiUsage | undefined | null) {
  if (!meter || !u) return;
  const src = typeof u.prompt_tokens === 'number' || typeof u.completion_tokens === 'number' ? u : u.x_groq?.usage;
  if (!src) return;
  if (typeof src.prompt_tokens === 'number') meter.promptTokens = src.prompt_tokens;
  if (typeof src.completion_tokens === 'number') meter.completionTokens = src.completion_tokens;
}

/** Đọc SSE tăng dần từ body; hỗ trợ CRLF và dòng bị cắt giữa các chunk. */
async function readOpenAiStream(
  response: Response,
  onDelta: DeltaHandler,
  signal?: AbortSignal,
  meter?: Meter,
  onActivity?: () => void,
): Promise<string> {
  const pieces: string[] = [];
  const handleLine = (line: string) => {
    const clean = line.trim();
    if (!clean.startsWith('data:')) return;
    const payload = clean.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const parsed = JSON.parse(payload) as {
        choices?: {
          delta?: { content?: string };
          message?: { content?: string };
        }[];
        usage?: OpenAiUsage;
        x_groq?: { usage?: OpenAiUsage };
      };
      readUsageInto(meter, parsed.usage ?? (parsed.x_groq?.usage ? { x_groq: parsed.x_groq } : undefined));
      const piece =
        parsed.choices?.[0]?.delta?.content ??
        parsed.choices?.[0]?.message?.content ??
        '';
      if (piece) {
        pieces.push(piece);
        onDelta(piece);
      }
    } catch {
      // bỏ qua dòng SSE lỗi
    }
  };

  if (!response.body) {
    const raw = await response.text();
    const text = parseOpenAiCompatibleResponse(raw);
    if (text) onDelta(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let raw = '';
  for (;;) {
    let step: ReadableStreamReadResult<Uint8Array>;
    try {
      step = await abortable(reader.read(), signal);
    } catch (e) {
      // Giải phóng kết nối đang treo rồi báo lỗi lên trên.
      reader.cancel().catch(() => undefined);
      throw e;
    }
    const { done, value } = step;
    if (done) break;
    onActivity?.();
    const chunk = decoder.decode(value, { stream: true });
    if (pieces.length === 0) raw += chunk;
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const l of lines) handleLine(l);
  }
  const tail = decoder.decode();
  buffer += tail;
  if (pieces.length === 0) raw += tail;
  if (buffer) handleLine(buffer);

  if (pieces.length === 0) {
    // Có thể là JSON thường (không phải SSE)
    const text = parseOpenAiCompatibleResponse(raw);
    if (text) onDelta(text);
    return text;
  }
  return pieces.join('').trim();
}

/** Lỗi một lần thử, đủ để quyết định thử lại tại chỗ, đổi khoá/mô hình hay bỏ cuộc. */
interface Fail {
  error: string;
  /** Lỗi thoáng qua (429, 5xx, mạng, rỗng): đáng thử lại sau một nhịp chờ. */
  transient: boolean;
  auth?: boolean;
  busy?: boolean;
  timeout?: boolean;
}
type AttemptOut = { ok: true; res: LlmCallResult } | { ok: false; fail: Fail };

const MAX_RETRY_PASSES = 2;
const retryDelayMs = (pass: number): number => {
  const base = process.env.VITEST ? 5 : 700;
  return Math.round(base * 2 ** pass + Math.random() * base * 0.3);
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const stallDefaultMs = (): number => {
  const s = Number(process.env.LLM_STALL_SECONDS);
  return (Number.isFinite(s) && s >= 3 ? s : 40) * 1000;
};

/** Phân loại HTTP lỗi: nội dung phản hồi có "OAuth/expired" cũng tính là chưa đăng nhập dù mã là 500. */
function classifyHttp(status: number, bodySnippet: string, label: string): Fail {
  const auth = status === 401 || status === 403 || (status >= 400 && isAiAuthText(bodySnippet));
  const busy = status === 429 || status === 503 || status === 529;
  const transient = !auth && (status === 408 || status === 429 || status >= 500);
  return { error: `${label} HTTP ${status}`, transient, auth, busy };
}

/** Gộp các lỗi từng lần thử thành một mã lỗi cho giao diện: chưa đăng nhập được ưu tiên vì chỉ quản trị viên sửa được. */
function summarizeFailures(failures: Fail[], triedAny: boolean): LlmErrorCode {
  if (!triedAny || failures.length === 0) return 'ai_unconfigured';
  if (failures.some((f) => f.auth)) return 'ai_auth';
  if (failures.every((f) => f.timeout)) return 'ai_timeout';
  if (failures.some((f) => f.busy)) return 'ai_busy';
  return 'ai_unavailable';
}

const callLiveLlmStreamInner = async (
  systemPrompt: string,
  userPromptRaw: string,
  preferredModel: string | undefined,
  opts: LlmOpts | undefined,
  onDelta: DeltaHandler,
  meter: Meter,
): Promise<LlmCallResult> => {
  const maxTokens = opts?.maxTokens && opts.maxTokens > 0 ? opts.maxTokens : 4000;
  const timeoutMs = opts?.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : undefined;
  const stallMs = opts?.stallMs && opts.stallMs > 0 ? opts.stallMs : stallDefaultMs();
  const safePreferred =
    preferredModel && SAFE_MODEL_RE.test(preferredModel.trim())
      ? preferredModel.trim()
      : undefined;

  // Sinh lại: nonce riêng cho lượt này -> khoá bộ nhớ đệm khác và lời nhắc yêu cầu phương án khác.
  const nonce = opts?.vary === false ? undefined : getVariation();
  const userPrompt = nonce ? userPromptRaw + variationInstruction(nonce) : userPromptRaw;
  const temperature = nonce ? 0.8 : 0.45;

  const cacheEnabled =
    opts?.useCache ?? (!process.env.VITEST && process.env.NODE_ENV !== 'test');
  const cacheKey = cacheEnabled
    ? `${safePreferred ?? ''}\u0000${nonce ?? ''}\u0000${systemPrompt}\u0000${userPrompt}`
    : '';

  if (cacheEnabled) {
    const hit = llmCache.get(cacheKey);
    if (hit && Date.now() - hit.at < LLM_CACHE_TTL_MS) {
      // LRU thật: lần dùng gần nhất đưa xuống cuối hàng.
      llmCache.delete(cacheKey);
      llmCache.set(cacheKey, hit);
      onDelta(hit.content);
      return {
        ok: true,
        content: hit.content,
        modelUsed: `${hit.modelUsed} (Cache 0 token)`,
      };
    }
  }

  // Hạn mức theo lượt soạn: chỉ kiểm khi sắp gọi AI thật (lượt trúng cache ở trên không tốn hạn mức).
  if (meter.ctx?.gate) {
    let allowed = true;
    try {
      allowed = await meter.ctx.gate();
    } catch (e) {
      console.error('[usage] kiểm hạn mức lỗi, cho phép gọi:', e instanceof Error ? e.message : e);
    }
    if (!allowed) {
      meter.blocked = true;
      return {
        ok: false,
        modelUsed: TEMPLATE_LABEL,
        code: 'ai_quota',
        error: 'Đã hết hạn mức lượt soạn bằng AI trong ngày.',
      };
    }
  }

  const saveCache = (content: string, modelUsed: string) => {
    if (!cacheEnabled) return;
    llmCache.delete(cacheKey);
    if (llmCache.size >= LLM_CACHE_MAX) {
      const oldest = llmCache.keys().next().value;
      if (oldest !== undefined) llmCache.delete(oldest);
    }
    llmCache.set(cacheKey, { content, modelUsed, at: Date.now() });
  };

  const startedAt = Date.now();
  const failures: Fail[] = [];
  let lastError: string | undefined;
  let triedAny = false;

  /** Chạy một tầng: xoay khoá trong mỗi lượt; nếu mọi khoá đều lỗi thoáng qua thì chờ (lũy thừa nhẹ) rồi thử lại. */
  const runTier = async (
    keys: string[],
    attempt: (key: string) => Promise<AttemptOut>,
    maxPasses = MAX_RETRY_PASSES,
  ): Promise<LlmCallResult | null> => {
    const dead = new Set<string>();
    for (let pass = 0; pass <= maxPasses; pass++) {
      let anyTransient = false;
      for (const key of keys) {
        if (dead.has(key)) continue;
        if (opts?.signal?.aborted) return null;
        triedAny = true;
        const out = await attempt(key);
        if (out.ok) return out.res;
        failures.push(out.fail);
        lastError = out.fail.error;
        if (out.fail.auth) dead.add(key);
        if (out.fail.transient) anyTransient = true;
      }
      if (!anyTransient || pass === maxPasses) break;
      // Đã tốn quá nửa thời gian cho phép thì thôi: nhường tầng sau, không bắt giáo viên chờ thêm.
      if (timeoutMs && Date.now() - startedAt > timeoutMs * 0.5) break;
      await sleep(retryDelayMs(pass));
    }
    return null;
  };

  /** Mô hình dự phòng cùng nhà cung cấp: chỉ thử khi mô hình chính hỏng mà không phải do khoá bị từ chối. */
  const authDead = () => failures.length > 0 && failures.every((f) => f.auth);
  const withFallback = async (
    keys: string[],
    primary: string,
    fallback: string | undefined,
    make: (model: string) => (key: string) => Promise<AttemptOut>,
  ): Promise<LlmCallResult | null> => {
    const r = await runTier(keys, make(primary));
    if (r) return r;
    if (fallback && fallback !== primary && SAFE_MODEL_RE.test(fallback) && !authDead() && !opts?.signal?.aborted) {
      return runTier(keys, make(fallback), 0);
    }
    return null;
  };

  // TẦNG 1: Google Gemini Free Tier (hỗ trợ xoay vòng nhiều khóa GEMINI_API_KEY / GEMINI_API_KEYS)
  const geminiKeys = parseKeyPool(
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEYS,
  );
  if (geminiKeys.length > 0) {
    const rawModel = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
    const model = SAFE_MODEL_RE.test(rawModel) ? rawModel : 'gemini-2.5-flash';
    const makeGemini = (m: string) => async (geminiKey: string): Promise<AttemptOut> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs ?? 45000);
      opts?.signal?.addEventListener('abort', () => controller.abort(), { once: true });
      meter.attempted = true;
      try {
        const response = await abortable(
          fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
              generationConfig: { temperature, maxOutputTokens: maxTokens },
            }),
            signal: controller.signal,
          }),
          controller.signal,
        );
        if (response.ok) {
          const data = (await abortable(response.json(), controller.signal)) as {
            candidates?: { content?: { parts?: { text?: string }[] } }[];
            usageMetadata?: {
              promptTokenCount?: number;
              candidatesTokenCount?: number;
              thoughtsTokenCount?: number;
            };
          };
          if (data.usageMetadata) {
            meter.promptTokens = data.usageMetadata.promptTokenCount;
            // Token "suy nghĩ" của Gemini 2.5 được tính phí như token ra.
            meter.completionTokens =
              (data.usageMetadata.candidatesTokenCount ?? 0) + (data.usageMetadata.thoughtsTokenCount ?? 0);
          }
          const text = data.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? '')
            .join('\n')
            ?.trim();
          if (text) {
            onDelta(text);
            const modelUsed = `Google Gemini (${m})`;
            meter.provider = 'gemini';
            meter.model = `google/${m}`;
            saveCache(text, modelUsed);
            return { ok: true, res: { ok: true, content: text, modelUsed } };
          }
          return { ok: false, fail: { error: 'Gemini returned empty content', transient: true } };
        }
        const body = await response.text().catch(() => '');
        const fail = classifyHttp(response.status, body.slice(0, 300), 'Gemini');
        console.error(`[llmClient] ${fail.error}`);
        return { ok: false, fail };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gemini call failed';
        console.error(`[llmClient] Gemini error: ${msg}`);
        const timeout = /timeout|thời gian|abort/i.test(msg);
        return { ok: false, fail: { error: msg, transient: !timeout, timeout, auth: isAiAuthText(msg) } };
      } finally {
        clearTimeout(timer);
      }
    };
    const gRes = await withFallback(geminiKeys, model, process.env.GEMINI_FALLBACK_MODEL?.trim(), makeGemini);
    if (gRes) return gRes;
  }

  // Hàm dùng chung cho các cổng tương thích OpenAI (Groq, OpenRouter, OpenAI/Proxy)
  const tryOpenAiCompatible = async (
    keys: string[],
    baseUrl: string,
    model: string,
    labelPrefix: string,
    fallbackModel?: string,
  ): Promise<LlmCallResult | null> => {
    const make = (m: string) => async (apiKey: string): Promise<AttemptOut> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs ?? 90000);
      // Đồng hồ "không thấy chữ nào": đặt lại mỗi lần có dữ liệu về; quá hạn thì bỏ kết nối treo.
      let stalled = false;
      let stallTimer: ReturnType<typeof setTimeout> | undefined;
      const arm = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          stalled = true;
          controller.abort();
        }, stallMs);
      };
      opts?.signal?.addEventListener('abort', () => controller.abort(), { once: true });
      meter.attempted = true;
      meter.promptTokens = undefined;
      meter.completionTokens = undefined;
      arm();
      try {
        const response = await abortable(
          fetch(baseUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: m,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature,
              max_tokens: maxTokens,
              stream: true,
              // OpenAI chỉ trả usage khi được yêu cầu; các cổng khác bỏ qua tham số này.
              ...(baseUrl.includes('api.openai.com') ? { stream_options: { include_usage: true } } : {}),
            }),
            signal: controller.signal,
          }),
          controller.signal,
        );
        if (response.ok) {
          const text = await readOpenAiStream(response, onDelta, controller.signal, meter, arm);
          if (text) {
            const modelUsed = `${labelPrefix} (${m})`;
            meter.provider = labelPrefix.startsWith('Groq')
              ? 'groq'
              : baseUrl.includes('openrouter')
                ? 'openrouter'
                : 'openai';
            meter.model = labelPrefix.startsWith('Groq') ? `groq/${m}` : m;
            saveCache(text, modelUsed);
            return { ok: true, res: { ok: true, content: text, modelUsed } };
          }
          return { ok: false, fail: { error: 'LLM returned empty content', transient: true } };
        }
        const body = await abortable(response.text(), controller.signal).catch(() => '');
        const fail = classifyHttp(response.status, body.slice(0, 300), 'LLM');
        console.error(`[llmClient] ${fail.error}`);
        return { ok: false, fail };
      } catch (err) {
        if (stalled) {
          const msg = `LLM timeout: không thấy chữ nào trong ${Math.round(stallMs / 1000)} giây`;
          console.error(`[llmClient] ${msg}`);
          return { ok: false, fail: { error: msg, transient: false, timeout: true } };
        }
        const msg = err instanceof Error ? err.message : 'OpenAI call failed';
        console.error(`[llmClient] OpenAI-compatible error: ${msg}`);
        const timeout = /timeout|thời gian/i.test(msg);
        // Lỗi mạng tức thời (reset, DNS) đáng thử lại; hết hạn chót thì không.
        return { ok: false, fail: { error: msg, transient: !timeout, timeout, auth: isAiAuthText(msg) } };
      } finally {
        clearTimeout(timer);
        if (stallTimer) clearTimeout(stallTimer);
      }
    };
    return withFallback(keys, model, fallbackModel, make);
  };

  // TẦNG 2: Groq Free Tier (tốc độ cao, miễn phí)
  const groqKeys = parseKeyPool(process.env.GROQ_API_KEY, process.env.GROQ_API_KEYS);
  if (groqKeys.length > 0) {
    const rawGroqModel = process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile';
    const groqModel = SAFE_MODEL_RE.test(rawGroqModel)
      ? rawGroqModel
      : 'llama-3.3-70b-versatile';
    const groqBase = normalizeChatCompletionsUrl(
      process.env.GROQ_BASE_URL?.trim() || 'https://api.groq.com/openai/v1',
    );
    const groqRes = await tryOpenAiCompatible(
      groqKeys,
      groqBase,
      groqModel,
      'Groq Free AI',
      process.env.GROQ_FALLBACK_MODEL?.trim(),
    );
    if (groqRes) return groqRes;
  }

  // TẦNG 3: OpenRouter (ưu tiên model miễn phí / Flash trước khi chạm vào tunnel chính)
  const openRouterKeys = parseKeyPool(
    process.env.OPENROUTER_API_KEY,
    process.env.OPENROUTER_API_KEYS,
  );
  if (openRouterKeys.length > 0) {
    const rawOrModel =
      safePreferred ||
      process.env.OPENROUTER_MODEL?.trim() ||
      'google/gemini-2.5-flash';
    const orModel = SAFE_MODEL_RE.test(rawOrModel)
      ? rawOrModel
      : 'google/gemini-2.5-flash';
    const orBase = normalizeChatCompletionsUrl(
      process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1',
    );
    const orRes = await tryOpenAiCompatible(
      openRouterKeys,
      orBase,
      orModel,
      'Live AI',
      process.env.OPENROUTER_FALLBACK_MODEL?.trim(),
    );
    if (orRes) return orRes;
  }

  // TẦNG 4: OpenAI / Proxy Tunnel dự phòng cuối cùng
  const openAiKeys = parseKeyPool(
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_API_KEYS,
  );
  if (openAiKeys.length > 0) {
    const rawModel =
      safePreferred || process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
    const model = SAFE_MODEL_RE.test(rawModel) ? rawModel : DEFAULT_OPENAI_MODEL;
    const baseUrl = normalizeChatCompletionsUrl(
      process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
    );
    const oaRes = await tryOpenAiCompatible(
      openAiKeys,
      baseUrl,
      model,
      'Live AI',
      process.env.OPENAI_FALLBACK_MODEL?.trim(),
    );
    if (oaRes) return oaRes;
  }

  return { ok: false, modelUsed: TEMPLATE_LABEL, error: lastError, code: summarizeFailures(failures, triedAny) };
};

export const callLiveLlmStream = async (
  systemPrompt: string,
  userPrompt: string,
  preferredModel: string | undefined,
  opts: LlmOpts | undefined,
  onDelta: DeltaHandler,
): Promise<LlmCallResult> => {
  const meter: Meter = { ctx: getUsageContext(), attempted: false, blocked: false };
  const started = Date.now();
  let result: LlmCallResult | undefined;
  let thrown: unknown;
  try {
    result = await callLiveLlmStreamInner(systemPrompt, userPrompt, preferredModel, opts, onDelta, meter);
  } catch (e) {
    thrown = e;
  }
  // Ghi sổ: nuốt mọi lỗi, không bao giờ làm chậm hay làm hỏng lời gọi AI.
  const ctx = meter.ctx;
  const fromCache = result?.modelUsed?.includes('Cache 0 token');
  if (ctx?.record && meter.attempted && !meter.blocked && !fromCache) {
    try {
      const out = result?.content ?? '';
      const real = typeof meter.promptTokens === 'number' && typeof meter.completionTokens === 'number';
      await Promise.resolve(
        ctx.record({
          provider: meter.provider ?? 'unknown',
          model: meter.model ?? result?.modelUsed ?? 'unknown',
          promptTokens: meter.promptTokens ?? estimateTokens(systemPrompt + userPrompt),
          completionTokens: meter.completionTokens ?? estimateTokens(out),
          estimated: !real,
          latencyMs: Date.now() - started,
          ok: !thrown && Boolean(result?.ok),
        }),
      ).catch((e: unknown) => console.error('[usage] ghi sổ lỗi:', e instanceof Error ? e.message : e));
    } catch (e) {
      console.error('[usage] ghi sổ lỗi:', e instanceof Error ? e.message : e);
    }
  }
  if (thrown) throw thrown;
  return result as LlmCallResult;
};

/** Async generator trả về từng đoạn text khi LLM sinh ra; giá trị return là LlmCallResult. */
export async function* streamLiveLlm(
  systemPrompt: string,
  userPrompt: string,
  preferredModel?: string,
  opts?: LlmOpts,
): AsyncGenerator<string, LlmCallResult, void> {
  const queue: string[] = [];
  let wake: (() => void) | null = null;
  let finished = false;
  const notify = () => {
    const w = wake;
    wake = null;
    w?.();
  };
  const promise = callLiveLlmStream(
    systemPrompt,
    userPrompt,
    preferredModel,
    opts,
    (t) => {
      queue.push(t);
      notify();
    },
  ).finally(() => {
    finished = true;
    notify();
  });
  for (;;) {
    if (queue.length > 0) {
      yield queue.shift() as string;
      continue;
    }
    if (finished) break;
    await new Promise<void>((resolve) => {
      wake = resolve;
    });
  }
  return await promise;
}

export const callLiveLlm = async (
  systemPrompt: string,
  userPrompt: string,
  preferredModel?: string,
  opts?: LlmOpts,
): Promise<LlmCallResult> => {
  const sink = deltaStore.getStore();
  return callLiveLlmStream(
    systemPrompt,
    userPrompt,
    preferredModel,
    opts,
    sink ?? (() => {}),
  );
};
