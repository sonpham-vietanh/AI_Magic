// Pure text helpers (no server imports) — safe to import from client components.
export function cleanPedagogicalText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/(^|[^\w])__([^_\n]+?)__(?=[^\w]|$)/g, '$1$2')
    .replace(/`+([^`\n]*)`+/g, '$1')
    .split('\n')
    .filter((line) => !/^\s*([-*_]{3,})\s*$/.test(line))
    .map((line) =>
      line
        .replace(/^\s*#{1,6}\s+/, '')
        .replace(/^(\s*)[-*+•]\s+/, '$1')
        .replace(/(^|[^*\w])\*([^*\s](?:[^*\n]*?[^*\s])?)\*(?![*\w])/g, '$1$2'),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
