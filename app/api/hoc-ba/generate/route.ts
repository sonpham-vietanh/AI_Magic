import { NextResponse } from 'next/server';
import { z } from 'zod';
import { callLiveLlm } from '@/lib/engine/llmClient';
import { generateBatch } from '@/lib/hocba/generate';
import {
  CAP_HOC,
  DO_DAI,
  GIONG_VAN,
  KY_HOC,
  MAX_NAME_CHARS,
  MAX_NOTE_CHARS,
  MAX_STUDENTS_PER_BATCH,
  XUNG_HO,
} from '@/lib/hocba/types';
import { readJsonLimited } from '@/lib/server/body';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { withUsage } from '@/lib/usage/quota';

export const runtime = 'nodejs';
export const maxDuration = 120;

const ids = <T extends readonly { id: string }[]>(list: T) => list.map((x) => x.id) as [string, ...string[]];

const bodySchema = z.object({
  students: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        ten: z.string().trim().min(1).max(MAX_NAME_CHARS),
        ghiChu: z.string().max(MAX_NOTE_CHARS).default(''),
      }),
    )
    .min(1)
    .max(MAX_STUDENTS_PER_BATCH),
  options: z.object({
    capHoc: z.enum(ids(CAP_HOC)),
    doDai: z.enum(ids(DO_DAI)),
    giong: z.enum(ids(GIONG_VAN)),
    kyHoc: z.enum(ids(KY_HOC)),
    xungHo: z.enum(ids(XUNG_HO)),
  }),
});

/**
 * Soạn nhận xét học bạ cho MỘT lô (tối đa 12 học sinh). Dữ liệu học sinh chỉ nằm trong bộ nhớ lúc xử lý:
 * không ghi vào kho dữ liệu, không ghi vào bảng đo, tên không gửi tới AI. Mỗi lô tính một lượt soạn.
 */
export async function POST(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'hoc-ba', 30, 60_000);
  if (limited) return limited;

  const read = await readJsonLimited(request, 64 * 1024);
  if (!read.ok) return read.response;
  const parsed = bodySchema.safeParse(read.data);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: `Danh sách chưa hợp lệ. Mỗi lần gửi tối đa ${MAX_STUDENTS_PER_BATCH} học sinh, ghi chú mỗi em tối đa ${MAX_NOTE_CHARS} ký tự.`,
      },
      { status: 400 },
    );
  }
  const { students, options } = parsed.data;

  try {
    const metered = await withUsage(request, { workflow: 'hoc_ba' }, async (h) => ({
      outcome: await generateBatch(students, options as never, (system, user) =>
        callLiveLlm(system, user, undefined, { maxTokens: 4000, timeoutMs: 90_000, useCache: false }),
      ),
      exceeded: h.exceeded,
    }));
    const ex = metered.exceeded();
    if (ex) return NextResponse.json({ ok: false, error: ex.message }, { status: 429 });
    const { outcome } = metered;
    if (outcome.error) {
      return NextResponse.json(
        { ok: false, error: 'AI chưa trả lời được cho lô này. Cô/thầy bấm thử lại sau ít giây.' },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: true, results: outcome.results, modelUsed: outcome.modelUsed },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    // Không ghi nội dung học sinh vào nhật ký lỗi.
    console.error('[hoc-ba] lỗi:', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ ok: false, error: 'Chưa soạn được nhận xét. Cô/thầy thử lại sau ít giây.' }, { status: 500 });
  }
}
