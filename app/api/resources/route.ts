import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAccess } from '@/lib/server/guard';
import { readJsonLimited } from '@/lib/server/body';
import { rateLimit } from '@/lib/server/rateLimit';
import { requireReviewer } from '@/lib/server/roles';
import {
  fetchSupabaseLibraryResources,
  saveResourceToSupabase,
} from '@/lib/supabase';
import type { GeneratedResource } from '@/lib/types';

const resourceSchema = z.object({
  id: z.string().max(100).optional(),
  createdAt: z.string().max(40).optional(),
  toolId: z.string().min(1).max(100),
  toolName: z.string().min(1).max(300),
  category: z.string().min(1).max(60),
  teacher: z.object({
    email: z.string().max(200),
    name: z.string().max(200),
  }),
  grade: z.string().min(1).max(10),
  subject: z.string().min(1).max(60),
  classId: z.string().max(100).optional(),
  className: z.string().max(200).optional(),
  knowledgeNodeId: z.string().max(100).optional(),
  linkedNodeIds: z.array(z.string().max(100)).max(100).default([]),
  title: z.string().min(1).max(300),
  markdownContent: z.string().max(200_000),
  structuredSections: z
    .array(
      z.object({
        heading: z.string().max(500),
        body: z.string().max(200_000),
      }),
    )
    .max(100),
  differentiationSummary: z
    .object({
      coBan: z.string().max(20_000),
      chuan: z.string().max(20_000),
      nangCao: z.string().max(20_000),
    })
    .optional(),
  crossSubjectHighlights: z
    .array(
      z.object({
        targetSubject: z.string().max(60),
        targetTopic: z.string().max(500),
        integrationActivity: z.string().max(5_000),
      }),
    )
    .max(50)
    .optional(),
  moetComplianceChecklist: z
    .array(
      z.object({
        criterion: z.string().max(500),
        passed: z.boolean(),
        note: z.string().max(2_000),
      }),
    )
    .max(100)
    .default([]),
  generationMode: z.enum(['llm_live', 'smart_template']),
  modelUsed: z.string().max(100),
  estimatedMinutesSaved: z.number().min(0).max(100_000),
});

const bodySchema = z.object({ resource: resourceSchema });

export async function GET(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const subject = url.searchParams.get('subject') || undefined;
    const grade = url.searchParams.get('grade') || undefined;
    const category = url.searchParams.get('category') || undefined;

    const supabaseResources = await fetchSupabaseLibraryResources();

    const filtered = supabaseResources.filter((r) => {
      if (subject && subject !== 'all' && r.subject !== subject) return false;
      if (grade && grade !== 'all' && r.grade !== grade) return false;
      if (category && category !== 'all' && r.category !== category) return false;
      return true;
    });

    return NextResponse.json({
      ok: true,
      resources: filtered,
      supabaseCount: filtered.length,
    });
  } catch (err) {
    console.error('[resources GET] failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Không thể tải thư viện học liệu.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const denied = requireAccess(request);
  if (denied) return denied;
  // Bảng `resources` trên Supabase dùng chung và nội dung được đưa vào prompt (chống đầu độc prompt):
  // chỉ người duyệt mới được ghi. Giao diện hiện tại không gọi POST này.
  const notReviewer = requireReviewer(request);
  if (notReviewer) return notReviewer;
  const limited = rateLimit(request, 'resources-post', 20, 60_000);
  if (limited) return limited;

  const read = await readJsonLimited(request, 1024 * 1024);
  if (!read.ok) return read.response;
  const raw = read.data;

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Dữ liệu học liệu không hợp lệ.' },
      { status: 400 },
    );
  }

  try {
    // Server luôn tự sinh id, không tin id/createdAt từ client.
    const resource = {
      ...parsed.data,
      id: `res-${randomUUID()}`,
      createdAt: new Date().toISOString(),
    } as unknown as GeneratedResource;

    const saved = await saveResourceToSupabase(resource);
    if (!saved) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Không thể lưu học liệu vào kho dữ liệu. Vui lòng thử lại.',
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, resource });
  } catch (err) {
    console.error('[resources POST] failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Không thể lưu học liệu.' },
      { status: 500 },
    );
  }
}
