// Bộ biểu tượng SVG nội bộ (nét 1.75, lưới 24x24), thay cho emoji. Biểu tượng chỉ để trang trí:
// nút chỉ có biểu tượng phải tự gắn aria-label ở chỗ dùng.
import type { SVGProps } from 'react';

const PATHS = {
  send: 'M5 12h14M13 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  menu: 'M4 7h16M4 12h16M4 17h16',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevron: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 5v6h-6',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  print: 'M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15z',
  book: 'M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM5 17a3 3 0 013-3h10',
  shield: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3zM9 12l2 2 4-4',
  chart: 'M5 20V10M12 20V4M19 20v-7',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  folder: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
  graph: 'M6 7a2 2 0 100-4 2 2 0 000 4zM18 11a2 2 0 100-4 2 2 0 000 4zM12 21a2 2 0 100-4 2 2 0 000 4zM7.5 6l9 3M7 6.5l4 11M17 11l-4 6.5',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.3a3.5 3.5 0 010 6.4M18 14.5a6.5 6.5 0 013.5 5.5',
  clipboard: 'M9 4h6l1 2h3v14H5V6h3l1-2zM9 12h6M9 16h4',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  clock: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  alert: 'M12 4l9 16H3L12 4zM12 10v4M12 17.5v.5',
  info: 'M12 8v.5M12 11.5V17M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  stop: 'M7 7h10v10H7z',
  panel: 'M4 5h16v14H4zM14 5v14',
  newspaper: 'M5 5h12v14H6a1 1 0 01-1-1V5zM17 9h3v9a1 1 0 01-1 1h-2M8 9h6M8 13h6M8 16h4',
  quiz: 'M8 9a4 4 0 118 0c0 2-2 2.5-2.5 4M13.5 17v.5M4 20h16',
  slides: 'M4 5h16v11H4zM8 20h8M12 16v4',
  podcast: 'M12 14a3 3 0 003-3V6a3 3 0 00-6 0v5a3 3 0 003 3zM6 11a6 6 0 0012 0M12 17v4',
  video: 'M4 6h11v12H4zM15 10l5-3v10l-5-3',
  layers: 'M12 4l9 5-9 5-9-5 9-5zM3 14l9 5 9-5',
  exam: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h5',
  plug: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 01-12 0V8zM12 17v4',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  library: 'M4 4h4v16H4zM10 4h4v16h-4zM16.5 5.5l3.5 1-3.5 13.5-3.5-1z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
