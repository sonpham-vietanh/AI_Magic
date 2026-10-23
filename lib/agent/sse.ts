// Đọc luồng sự kiện (SSE) của /api/workflows/run. Mọi dòng lạ hoặc hỏng đều bị bỏ qua, không làm vỡ luồng.
import type { AgentResult } from './result';

export interface SseEvent {
  type?: string;
  stage?: 'kho' | 'guardrail' | 'route' | 'generate' | 'reflect';
  message?: string;
  delta?: string;
  result?: AgentResult;
  status?: number;
  error?: string;
  code?: string;
  reasons?: string[];
  quota?: { used: number; limit: number };
  /** Sự kiện từng phần (Bộ tiết dạy): tên phần vừa xong. */
  key?: string;
  label?: string;
  /** Sự kiện nhận xét tự soát đến sau. */
  reflection?: AgentResult['reflection'];
}

/** Cắt bộ đệm thành các sự kiện đầy đủ; phần dở dang giữ lại cho lần đọc sau. */
export function parseSseChunk(buffer: string): { events: SseEvent[]; rest: string } {
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? '';
  const events: SseEvent[] = [];
  for (const block of blocks) {
    const line = block
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('data:'));
    if (!line) continue;
    const raw = line.slice(5).trim();
    if (!raw) continue;
    try {
      const evt = JSON.parse(raw) as unknown;
      if (evt && typeof evt === 'object') events.push(evt as SseEvent);
    } catch {
      /* bỏ qua dòng hỏng */
    }
  }
  return { events, rest };
}

/** Văn bản AI đang trả có phải là dữ liệu có cấu trúc (JSON) thay vì chữ để đọc? Khi đó không đưa lên khung bản soạn. */
export function looksLikeJson(text: string): boolean {
  const t = text.trimStart();
  return t.startsWith('{') || t.startsWith('[') || t.startsWith('```');
}
