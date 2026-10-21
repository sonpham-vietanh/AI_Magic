import { z } from 'zod';
import { getOrgId } from '@/lib/server/org';
import { reviewExam } from '@/lib/assessment';
import { handlePost } from '@/lib/assessment/http';

const schema = z.object({
  examId: z.string().regex(/^DT-[A-Za-z0-9-]{3,40}$/),
  reviewer: z.string().trim().min(1).max(100),
  decision: z.enum(['duyet', 'tu_choi']),
  note: z.string().max(2000).default(''),
});

export async function POST(request: Request) {
  return handlePost(request, 'assessment-review', 20, schema, async (b) => ({
    exam: await reviewExam({ orgId: getOrgId(request), ...b }),
  }));
}
