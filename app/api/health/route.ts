// Kiểm tra sống cho Docker/Coolify. Cố ý KHÔNG qua guard và KHÔNG lộ gì ngoài ok + thời gian.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true, time: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
