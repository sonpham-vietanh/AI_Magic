import { classifyLine } from '@/components/agent/Canvas';

/** Hiển thị thân bài bằng text node (không chèn HTML), nhấn mạnh tiêu đề mục. */
export function DocBody({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  return (
    <>
      {lines.map((line, i) =>
        line.trim() === '' ? null : (
          <p key={i} className={`ag-line ${classifyLine(line)}`}>
            {line.trim()}
          </p>
        ),
      )}
    </>
  );
}
