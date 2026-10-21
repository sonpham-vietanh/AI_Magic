import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import {
  fetchSupabaseActivityAndReviews,
  fetchSupabaseAtomDetail,
  fetchSupabaseOverview,
  fetchSupabaseTainguyenById,
  fetchSupabaseTainguyenList,
  fetchSupabaseTreeScaffold,
  querySupabaseAtoms,
} from '@/lib/supabase';

const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const idParam = z.string().regex(ID_RE).optional();
const shortText = z.string().max(100).optional();

const querySchema = z.object({
  mode: z.enum(['overview', 'tree', 'tainguyen', 'activity']).optional(),
  atomId: idParam,
  tainguyenId: idParam,
  parentId: idParam,
  filterAtomId: idParam,
  q: shortText,
  subject: shortText,
  grade: shortText,
  kind: shortText,
  format: shortText,
  onlyFactoryReady: z.enum(['true', 'false']).optional(),
});

function parseLimit(raw: string | null, fallback: number): number {
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(300, Math.max(1, Math.floor(n)));
}

export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'knowledge-get', 120, 60_000);
  if (limited) return limited;

  const url = new URL(request.url);
  const rawQuery: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) {
    if (v !== '') rawQuery[k] = v;
  }
  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Tham số truy vấn không hợp lệ.' },
      { status: 400 },
    );
  }
  const p = parsed.data;

  try {
    if (p.mode === 'overview') {
      const overview = await fetchSupabaseOverview();
      // Ẩn danh hoá người dùng: không trả email/tên thật, chỉ vai trò + môn.
      const users = overview.users.map((u, i) => ({
        id: `u${i + 1}`,
        name: `Giáo viên ${i + 1}`,
        role: u.role,
        subject: u.subject,
      }));
      const settings = overview.settings
        ? { ...overview.settings, tutorEmail: undefined }
        : overview.settings;
      return NextResponse.json({ ok: true, overview: { ...overview, users, settings } });
    }

    if (p.mode === 'tree') {
      const nodes = await fetchSupabaseTreeScaffold({
        subject: p.subject,
        grade: p.grade,
        kind: p.kind,
        parentId: p.parentId,
      });
      return NextResponse.json({ ok: true, nodes });
    }

    if (p.mode === 'tainguyen') {
      if (p.tainguyenId) {
        const item = await fetchSupabaseTainguyenById(p.tainguyenId);
        return NextResponse.json({ ok: true, item });
      }
      const { items, totalCount } = await fetchSupabaseTainguyenList({
        format: p.format,
        atomId: p.filterAtomId,
        search: p.q,
        limit: parseLimit(url.searchParams.get('limit'), 100),
      });
      return NextResponse.json({ ok: true, items, totalCount });
    }

    if (p.mode === 'activity') {
      const { activities, reviews } = await fetchSupabaseActivityAndReviews(
        parseLimit(url.searchParams.get('limit'), 100),
      );
      return NextResponse.json({ ok: true, activities, reviews });
    }

    if (p.atomId) {
      const detail = await fetchSupabaseAtomDetail(p.atomId);
      return NextResponse.json({ ok: true, ...detail });
    }

    const { atoms, totalCount } = await querySupabaseAtoms({
      subject: p.subject,
      grade: p.grade,
      parentId: p.parentId,
      search: p.q,
      limit: parseLimit(url.searchParams.get('limit'), 60),
      onlyFactoryReady: p.onlyFactoryReady === 'true',
    });

    return NextResponse.json({
      ok: true,
      atoms,
      totalCount,
    });
  } catch (err) {
    console.error('[knowledge GET] failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Không thể truy vấn dữ liệu từ kho tri thức.' },
      { status: 500 },
    );
  }
}
