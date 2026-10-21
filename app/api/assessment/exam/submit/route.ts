import { z } from 'zod';
import { getOrgId } from '@/lib/server/org';
import { submitExam } from '@/lib/assessment';
import { handlePost } from '@/lib/assessment/http';

const schema = z.object({
  examId: z.string().regex(/^DT-[A-Za-z0-9-]{3,40}$/),
  actor: z.string().trim().min(1).max(100),
  reviewers: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
});

export async function POST(request: Request) {
  return handlePost(request, 'assessment-submit', 20, schema, async (b) => ({
    exam: await submitExam({ orgId: getOrgId(request), ...b }),
  }));
}
