import { NextResponse } from 'next/server';
import { z } from 'zod';
import { KhoGenerateError, buildGenContext, generateDraftsForAtom } from '@/lib/kho/generate';
import { getStandardLesson, saveDraftAssets } from '@/lib/kho';
import { generateAllResources } from '@/lib/resources';
import { RESOURCE_KINDS, RESOURCE_LABELS, type Artifact } from '@/lib/resources/types';
import { getOrgId } from '@/lib/server/org';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';

const bodySchema = z.object({
  atomId: z.string().min(1).max(100),
  kinds: z.array(z.enum(RESOURCE_KINDS)).min(1).max(6).optional(),
});

export async function POST(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'kho-generate', 24, 60_000);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Dữ liệu gửi lên không phải JSON hợp lệ.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Yêu cầu sinh tài nguyên không hợp lệ.' }, { status: 400 });
  }
  const wantsStream = (request.headers.get('accept') ?? '').includes('text/event-stream');
  if (wantsStream) return streamDrafts(request, parsed.data.atomId, parsed.data.kinds);

  try {
    const r = await generateDraftsForAtom(getOrgId(request), parsed.data.atomId, parsed.data.kinds, request.signal);
    return NextResponse.json({ ok: true, saved: r.saved, errors: r.errors });
  } catch (err) {
    if (err instanceof KhoGenerateError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 422 });
    }
    console.error('[kho generate POST] failed:', err);
    return NextResponse.json({ ok: false, error: 'Không thể sinh tài nguyên lúc này.' }, { status: 500 });
  }
}

/**
 * Chế độ SSE: các dạng chạy song song, dạng nào xong phát ngay một sự kiện 'part' (kèm nội dung) để hiện từng thẻ;
 * cuối cùng lưu bản nháp và phát 'done' với danh sách đã lưu và lỗi từng dạng.
 */
function streamDrafts(request: Request, atomId: string, kinds: (typeof RESOURCE_KINDS)[number][] | undefined): Response {
  const orgId = getOrgId(request);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // client đã đóng kết nối
        }
      };
      try {
        send({ type: 'stage', message: 'Đang tra bài trong Kho…' });
        const lesson = await getStandardLesson(orgId, atomId);
        if (lesson.packages.length === 0) {
          send({ type: 'error', ok: false, status: 422, error: 'Bài này chưa có gói kiến thức nên chưa có căn cứ để sinh tài nguyên.' });
          return;
        }
        const wanted = kinds && kinds.length ? kinds : [...RESOURCE_KINDS];
        send({ type: 'stage', message: `Đang soạn ${wanted.length} dạng cùng lúc…`, kinds: wanted });
        const res = await generateAllResources(buildGenContext(lesson), wanted, {
          signal: request.signal,
          onArtifact: (artifact: Artifact) =>
            send({ type: 'part', key: artifact.kind, label: RESOURCE_LABELS[artifact.kind as (typeof RESOURCE_KINDS)[number]] ?? artifact.kind, ok: true, artifact }),
          onError: (kind, error) =>
            send({ type: 'part', key: kind, label: RESOURCE_LABELS[kind], ok: false, error }),
        });
        const model = (res as { modelUsed?: string }).modelUsed || 'không rõ';
        const saved = await saveDraftAssets(
          orgId,
          lesson.atomId,
          res.artifacts.map((artifact) => ({ artifact, modelUsed: model })),
        );
        send({ type: 'done', ok: true, saved, errors: res.errors });
      } catch (err) {
        console.error('[kho generate SSE] failed:', err);
        send({ type: 'error', ok: false, status: 500, error: 'Không thể sinh tài nguyên lúc này.' });
      } finally {
        try {
          controller.close();
        } catch {
          // đã đóng
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
