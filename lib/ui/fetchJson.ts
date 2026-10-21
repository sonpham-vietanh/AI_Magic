// Helper dùng chung phía client: gọi API, đọc JSON an toàn, báo lỗi bằng tiếng Việt.
import { formatApiError } from '@/lib/ui/soanBai';

/** Lỗi đã được việt hoá, an toàn để hiện cho giáo viên. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Đọc JSON mà không ném lỗi khi body rỗng/không phải JSON. */
export async function readJson<T = unknown>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * fetch + JSON. Ném ApiError (thông điệp tiếng Việt) khi mạng lỗi, HTTP không ok,
 * body không phải JSON, hoặc body có ok === false.
 */
export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Cô/thầy kiểm tra mạng rồi thử lại nhé.');
  }
  const body = await readJson<{ ok?: boolean; error?: string } & Record<string, unknown>>(res);
  if (!res.ok || (body && body.ok === false)) {
    throw new ApiError(res.status, formatApiError(res.status, typeof body?.error === 'string' ? body.error : undefined));
  }
  if (body === null) {
    throw new ApiError(res.status, 'Máy chủ trả về dữ liệu không đọc được. Cô/thầy thử tải lại trang.');
  }
  return body as T;
}

/** Chỉ cho lỗi đã việt hoá đi qua; lỗi kỹ thuật thô (Failed to fetch, JSON...) đổi sang fallback. */
export function friendlyError(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}
