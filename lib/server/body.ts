/**
 * Đọc JSON từ request với giới hạn kích thước (chống body khổng lồ làm đầy bộ nhớ).
 * Kiểm tra Content-Length trước, rồi đếm byte thật khi đọc luồng (Content-Length có thể vắng/giả).
 * Dùng:
 *   const r = await readJsonLimited(request, 256 * 1024);
 *   if (!r.ok) return r.response;   // 400 (JSON hỏng) hoặc 413 (quá lớn)
 *   const raw = r.data;
 */
export type JsonReadResult = { ok: true; data: unknown } | { ok: false; response: Response };

export async function readJsonLimited(request: Request, maxBytes: number): Promise<JsonReadResult> {
  const tooLarge = (): JsonReadResult => ({
    ok: false,
    response: Response.json(
      { ok: false, error: 'Dữ liệu gửi lên quá lớn.' },
      { status: 413 },
    ),
  });
  const badJson = (): JsonReadResult => ({
    ok: false,
    response: Response.json(
      { ok: false, error: 'Dữ liệu gửi lên không phải JSON hợp lệ.' },
      { status: 400 },
    ),
  });

  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge();

  const body = request.body;
  if (!body) return badJson();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return tooLarge();
      }
      chunks.push(value);
    }
  } catch {
    return badJson();
  }
  try {
    const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return badJson();
  }
}
