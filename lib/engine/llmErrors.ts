// Phân loại lỗi AI để giao diện nói đúng điều đang xảy ra. Thuần hàm, an toàn để import ở bất kỳ đâu
// (cố ý tách khỏi llmClient để test giả lập llmClient không làm mất phần này).

export type LlmErrorCode =
  /** AI của hệ thống chưa đăng nhập / phiên hết hạn / khoá bị từ chối: việc của quản trị viên. */
  | 'ai_auth'
  /** Nhà cung cấp quá tải hoặc giới hạn tốc độ. */
  | 'ai_busy'
  /** Chờ quá lâu không thấy chữ nào. */
  | 'ai_timeout'
  /** Hết hạn mức lượt soạn trong ngày. */
  | 'ai_quota'
  /** Chưa cấu hình nhà cung cấp AI nào. */
  | 'ai_unconfigured'
  /** Lỗi khác từ phía AI. */
  | 'ai_unavailable';

const AUTH_TEXT_RE =
  /oauth|token (?:has )?expired|expired token|session expired|\bexpired\b|unauthori[sz]ed|not logged in|login required|please (?:log ?in|sign ?in)|invalid[_ ]?(?:api[_ ]?)?key|incorrect api key|authentication|chưa đăng nhập|hết hạn đăng nhập/i;

/** Văn bản lỗi có dấu hiệu "AI chưa đăng nhập / hết hạn" (HTTP 401/403 hoặc cụm OAuth, expired...). */
export function isAiAuthText(text: string | undefined | null): boolean {
  if (!text) return false;
  return /\bHTTP 40[13]\b/.test(text) || AUTH_TEXT_RE.test(text);
}

export function codeFromErrorText(text: string | undefined | null): LlmErrorCode {
  const t = String(text ?? '');
  if (isAiAuthText(t)) return 'ai_auth';
  if (/hạn mức|quota/i.test(t) && !/rate limit/i.test(t)) return 'ai_quota';
  if (/timeout|quá thời gian|không phản hồi chữ|im lặng/i.test(t)) return 'ai_timeout';
  if (/HTTP 429|rate limit|quá tải|overloaded|HTTP 5\d\d/i.test(t)) return 'ai_busy';
  if (/chưa cấu hình|no keys/i.test(t)) return 'ai_unconfigured';
  return 'ai_unavailable';
}

/** Thông điệp thân thiện (xưng "cô/thầy") cho từng mã lỗi. */
export function llmErrorMessage(code: LlmErrorCode | undefined): string {
  switch (code) {
    case 'ai_auth':
      return 'AI của hệ thống đang chưa đăng nhập hoặc phiên đã hết hạn. Đây không phải lỗi của cô/thầy: vui lòng báo quản trị viên đăng nhập lại AI. Trong lúc chờ, cô/thầy vẫn dùng được các bản đã có trong Kho học liệu.';
    case 'ai_busy':
      return 'AI đang quá tải. Hệ thống đã tự thử lại vài lần mà chưa được; cô/thầy bấm Thử lại sau khoảng một phút nhé.';
    case 'ai_timeout':
      return 'AI chờ quá lâu mà chưa trả lời. Cô/thầy bấm Thử lại; nếu vẫn vậy, thử chọn bài ngắn hơn hoặc báo quản trị viên.';
    case 'ai_quota':
      return 'Cô/thầy đã dùng hết lượt soạn bằng AI hôm nay. Hạn mức làm mới vào 0 giờ ngày mai; trong lúc chờ vẫn lấy được các bản chuẩn trong Kho học liệu.';
    case 'ai_unconfigured':
      return 'Hệ thống chưa được nối với AI. Vui lòng báo quản trị viên.';
    default:
      return 'Chưa gọi được AI lúc này. Cô/thầy bấm Thử lại sau ít phút nhé.';
  }
}
