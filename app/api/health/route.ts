// Kiểm tra sống cho Docker/Coolify. Cố ý KHÔNG qua guard, KHÔNG gọi Supabase và KHÔNG lộ cấu hình/khóa/người dùng.
// Luôn trả 200 khi tiến trình còn chạy (HEALTHCHECK dựa vào mã này). Thêm hai thông tin vận hành vô hại:
//  - uptimeSec: tiến trình đã chạy bao lâu (phát hiện container khởi động lại liên tục);
//  - dataDirWritable: thư mục .data có ghi được không (false = volume gắn sai quyền, dữ liệu sẽ không lưu được).
import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

async function dataDirWritable(): Promise<boolean> {
  try {
    await access(join(process.cwd(), '.data'), constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  return Response.json(
    {
      ok: true,
      time: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
      dataDirWritable: await dataDirWritable(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
