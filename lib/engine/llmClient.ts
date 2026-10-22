export interface LlmCallResult {
  ok: boolean;
  content?: string;
  modelUsed: string;
  error?: string;
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

/** Đọc SSE tăng dần từ body; hỗ trợ CRLF và dòng bị cắt giữa các chunk. */
async function readOpenAiStream(
  response: Response,
  onDelta: DeltaHandler,
  signal?: AbortSignal,
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
      };
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

export const callLiveLlmStream = async (
  systemPrompt: string,
  userPrompt: string,
  preferredModel: string | undefined,
  opts: LlmOpts | undefined,
  onDelta: DeltaHandler,
): Promise<LlmCallResult> => {
  const maxTokens = opts?.maxTokens && opts.maxTokens > 0 ? opts.maxTokens : 4000;
  const timeoutMs = opts?.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : undefined;
  const safePreferred =
    preferredModel && SAFE_MODEL_RE.test(preferredModel.trim())
      ? preferredModel.trim()
      : undefined;

  const cacheEnabled =
    opts?.useCache ?? (!process.env.VITEST && process.env.NODE_ENV !== 'test');
  const cacheKey = cacheEnabled
    ? `${safePreferred ?? ''}\u0000${systemPrompt}\u0000${userPrompt}`
    : '';

  if (cacheEnabled) {
    const hit = llmCache.get(cacheKey);
    if (hit && Date.now() - hit.at < LLM_CACHE_TTL_MS) {
      onDelta(hit.content);
      return {
        ok: true,
        content: hit.content,
        modelUsed: `${hit.modelUsed} (Cache 0 token)`,
      };
    }
  }

  const saveCache = (content: string, modelUsed: string) => {
    if (!cacheEnabled) return;
    if (llmCache.size >= LLM_CACHE_MAX) {
      const oldest = llmCache.keys().next().value;
      if (oldest !== undefined) llmCache.delete(oldest);
    }
    llmCache.set(cacheKey, { content, modelUsed, at: Date.now() });
  };

  let lastError: string | undefined;

  // TẦNG 1: Google Gemini Free Tier (hỗ trợ xoay vòng nhiều khóa GEMINI_API_KEY / GEMINI_API_KEYS)
  const geminiKeys = parseKeyPool(
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEYS,
  );
  if (geminiKeys.length > 0) {
    const rawModel = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
    const model = SAFE_MODEL_RE.test(rawModel) ? rawModel : 'gemini-2.5-flash';
    for (const geminiKey of geminiKeys) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs ?? 45000);
      opts?.signal?.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': geminiKey,
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
              generationConfig: { temperature: 0.45, maxOutputTokens: maxTokens },
            }),
            signal: controller.signal,
          },
        );
        if (response.ok) {
          const data = (await response.json()) as {
            candidates?: { content?: { parts?: { text?: string }[] } }[];
          };
          const text = data.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? '')
            .join('\n')
            ?.trim();
          if (text) {
            onDelta(text);
            const modelUsed = `Google Gemini (${model})`;
            saveCache(text, modelUsed);
            return { ok: true, content: text, modelUsed };
          }
          lastError = 'Gemini returned empty content';
        } else {
          lastError = `Gemini HTTP ${response.status}`;
          console.error(`[llmClient] ${lastError}`);
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Gemini call failed';
        console.error(`[llmClient] Gemini error: ${lastError}`);
      } finally {
        clearTimeout(timer);
      }
    }
  }

  // Hàm dùng chung cho các cổng tương thích OpenAI (Groq, OpenRouter, OpenAI/Proxy)
  const tryOpenAiCompatible = async (
    keys: string[],
    baseUrl: string,
    model: string,
    labelPrefix: string,
  ): Promise<LlmCallResult | null> => {
    for (const apiKey of keys) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs ?? 90000);
      opts?.signal?.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
      try {
        const response = await abortable(
          fetch(baseUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.45,
              max_tokens: maxTokens,
              stream: true,
            }),
            signal: controller.signal,
          }),
          controller.signal,
        );
        if (response.ok) {
          const text = await readOpenAiStream(response, onDelta, controller.signal);
          if (text) {
            const modelUsed = `${labelPrefix} (${model})`;
            saveCache(text, modelUsed);
            return { ok: true, content: text, modelUsed };
          }
          lastError = 'LLM returned empty content';
        } else {
          lastError = `LLM HTTP ${response.status}`;
          console.error(`[llmClient] ${lastError}`);
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'OpenAI call failed';
        console.error(`[llmClient] OpenAI-compatible error: ${lastError}`);
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
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
    const groqRes = await tryOpenAiCompatible(groqKeys, groqBase, groqModel, 'Groq Free AI');
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
    const orRes = await tryOpenAiCompatible(openRouterKeys, orBase, orModel, 'Live AI');
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
    const oaRes = await tryOpenAiCompatible(openAiKeys, baseUrl, model, 'Live AI');
    if (oaRes) return oaRes;
  }

  return { ok: false, modelUsed: TEMPLATE_LABEL, error: lastError };
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
