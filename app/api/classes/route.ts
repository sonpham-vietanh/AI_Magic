import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getClassById } from '@/lib/classes';
import { requireAccess } from '@/lib/server/guard';
import { rateLimit } from '@/lib/server/rateLimit';
import { addClassNote, listClassNotes } from '@/lib/server/classNotes';

const classIdSchema = z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/);

const bodySchema = z.object({
  action: z.literal('add_note'),
  classId: classIdSchema,
  note: z.string().trim().min(1).max(2000),
  teacherName: z.string().trim().max(100).optional(),
});

const serverError = () =>
  NextResponse.json({ ok: false, error: 'Lỗi máy chủ, vui lòng thử lại sau.' }, { status: 500 });

export async function POST(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'classes-post', 30, 60_000);
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Dữ liệu JSON không hợp lệ.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  }
  try {
    const profile = getClassById(parsed.data.classId);
    if (!profile) {
      return NextResponse.json({ ok: false, error: 'Không tìm thấy lớp học.' }, { status: 404 });
    }
    const note = await addClassNote({
      classId: profile.id,
      note: parsed.data.note,
      teacherName: parsed.data.teacherName,
    });
    return NextResponse.json({ ok: true, note });
  } catch (err) {
    console.error('[api/classes] POST lỗi:', err);
    return serverError();
  }
}

export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  const limited = rateLimit(request, 'classes-get', 120, 60_000);
  if (limited) return limited;

  const classId = new URL(request.url).searchParams.get('classId') ?? '';
  if (!classIdSchema.safeParse(classId).success) {
    return NextResponse.json({ ok: false, error: 'classId không hợp lệ.' }, { status: 400 });
  }
  try {
    const profile = getClassById(classId);
    if (!profile) {
      return NextResponse.json({ ok: false, error: 'Không tìm thấy lớp học.' }, { status: 404 });
    }
    const notes = await listClassNotes(profile.id);
    return NextResponse.json({ ok: true, notes });
  } catch (err) {
    console.error('[api/classes] GET lỗi:', err);
    return serverError();
  }
}
