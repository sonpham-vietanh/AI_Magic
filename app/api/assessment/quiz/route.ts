import { z } from 'zod';
import { getOrgId } from '@/lib/server/org';
import { generateQuiz } from '@/lib/assessment';
import { handlePost } from '@/lib/assessment/http';

const schema = z.object({
  atomId: z.string().min(1).max(100),
  bloomLevels: z.array(z.string().max(30)).max(6).default([]),
  language: z.enum(['vi', 'en', 'song_ngu']).default('vi'),
  style: z.string().max(100).default(''),
  count: z.number().int().min(1).max(10).optional(),
});

export async function POST(request: Request) {
  return handlePost(request, 'assessment-quiz', 30, schema, async (b) => ({
    quiz: await generateQuiz({ orgId: getOrgId(request), ...b }),
  }));
}
