// Minh hoạ SVG tự vẽ cho trang giới thiệu. Chỉ để trang trí (aria-hidden); nội dung chữ nằm ở thẻ cha.
const N = '#26275D';
const G = '#F9DD0E';
const L = '#E2E3F0';

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 240 150" className="lp-ill" aria-hidden="true" focusable="false">
      <rect width="240" height="150" rx="14" fill="#F1F2F8" />
      {children}
    </svg>
  );
}

export function IllPlan() {
  return (
    <Frame>
      <rect x="62" y="12" width="116" height="128" rx="8" fill="#fff" stroke={L} strokeWidth="2" />
      <rect x="74" y="24" width="60" height="8" rx="4" fill={N} />
      <rect x="74" y="36" width="36" height="5" rx="2.5" fill={L} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(0 ${52 + i * 20})`}>
          <circle cx="82" cy="6" r="7" fill={i === 2 ? G : N} />
          <text x="82" y="9.2" textAnchor="middle" fontSize="9" fontWeight="800" fill={i === 2 ? N : '#fff'} fontFamily="Be Vietnam Pro,sans-serif">{i + 1}</text>
          <rect x="95" y="1" width={70 - i * 6} height="5" rx="2.5" fill={N} opacity=".75" />
          <rect x="95" y="9" width={52 - i * 4} height="4" rx="2" fill={L} />
        </g>
      ))}
      <g transform="translate(150 96)">
        <circle r="22" fill={G} stroke="#fff" strokeWidth="3" />
        <path d="M-9 0l6 6 12-12" fill="none" stroke={N} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </Frame>
  );
}

export function IllSlide() {
  return (
    <Frame>
      <rect x="40" y="26" width="150" height="94" rx="8" fill={L} />
      <rect x="28" y="18" width="150" height="94" rx="8" fill="#fff" stroke={L} strokeWidth="2" />
      <rect x="28" y="18" width="150" height="20" rx="8" fill={N} />
      <rect x="28" y="30" width="150" height="8" fill={N} />
      <rect x="40" y="25" width="62" height="6" rx="3" fill={G} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <circle cx="42" cy={52 + i * 15} r="3" fill={G} stroke={N} strokeWidth="1.2" />
          <rect x="52" y={50 + i * 15} width={60 - i * 8} height="5" rx="2.5" fill={N} opacity=".7" />
        </g>
      ))}
      <rect x="124" y="82" width="10" height="20" rx="2" fill={N} />
      <rect x="138" y="68" width="10" height="34" rx="2" fill={G} />
      <rect x="152" y="76" width="10" height="26" rx="2" fill={N} opacity=".55" />
      <rect x="196" y="40" width="22" height="70" rx="6" fill="#fff" stroke={L} strokeWidth="2" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x="201" y={46 + i * 20} width="12" height="14" rx="2" fill={i === 0 ? G : L} />
      ))}
    </Frame>
  );
}

export function IllWorksheet() {
  return (
    <Frame>
      <rect x="44" y="10" width="152" height="130" rx="8" fill="#fff" stroke={L} strokeWidth="2" />
      <rect x="56" y="22" width="70" height="7" rx="3.5" fill={N} />
      <rect x="150" y="20" width="34" height="11" rx="5.5" fill="none" stroke={N} strokeWidth="1.5" strokeDasharray="3 2" />
      {[0, 1].map((i) => (
        <g key={i} transform={`translate(0 ${i * 38})`}>
          <rect x="56" y="42" width="8" height="8" rx="2" fill={G} />
          <rect x="70" y="43" width={96 - i * 14} height="5" rx="2.5" fill={N} opacity=".75" />
          <path d="M70 62h112M70 72h112" stroke={L} strokeWidth="2" strokeDasharray="1 5" strokeLinecap="round" />
        </g>
      ))}
      <rect x="56" y="112" width="128" height="20" rx="4" fill="none" stroke={L} strokeWidth="2" />
      <path d="M99 112v20M142 112v20" stroke={L} strokeWidth="2" />
      <path d="M205 100l-20 28 3 6 7-3 14-26z" fill={G} stroke={N} strokeWidth="2" strokeLinejoin="round" />
    </Frame>
  );
}

export function IllQuiz() {
  return (
    <Frame>
      <rect x="30" y="12" width="180" height="34" rx="8" fill={N} />
      <rect x="42" y="24" width="110" height="6" rx="3" fill="#fff" />
      <rect x="42" y="34" width="70" height="4" rx="2" fill="#fff" opacity=".5" />
      {['A', 'B', 'C', 'D'].map((c, i) => {
        const x = 30 + (i % 2) * 94;
        const y = 56 + Math.floor(i / 2) * 42;
        const on = i === 1;
        return (
          <g key={c}>
            <rect x={x} y={y} width="86" height="34" rx="8" fill={on ? G : '#fff'} stroke={on ? N : L} strokeWidth="2" />
            <circle cx={x + 16} cy={y + 17} r="9" fill={on ? N : L} />
            <text x={x + 16} y={y + 20.5} textAnchor="middle" fontSize="10" fontWeight="800" fill={on ? '#fff' : N} fontFamily="Be Vietnam Pro,sans-serif">{c}</text>
            <rect x={x + 32} y={y + 14} width="40" height="5" rx="2.5" fill={N} opacity=".55" />
          </g>
        );
      })}
    </Frame>
  );
}

export function IllExam() {
  const cells = [
    [3, 2, 1],
    [2, 3, 2],
    [1, 2, 2],
  ];
  return (
    <Frame>
      <rect x="14" y="14" width="82" height="122" rx="8" fill="#fff" stroke={L} strokeWidth="2" />
      <rect x="24" y="24" width="46" height="7" rx="3.5" fill={N} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x="24" y={42 + i * 14} width={i % 3 === 2 ? 44 : 62} height="5" rx="2.5" fill={L} />
      ))}
      <g transform="translate(108 30)">
        {['NB', 'TH', 'VD'].map((t, i) => (
          <text key={t} x={26 + i * 36} y="-6" textAnchor="middle" fontSize="9" fontWeight="800" fill={N} fontFamily="Be Vietnam Pro,sans-serif">{t}</text>
        ))}
        {cells.map((row, r) =>
          row.map((v, c) => (
            <rect key={`${r}${c}`} x={10 + c * 36} y={r * 32} width="32" height="28" rx="5" fill={v === 3 ? N : v === 2 ? G : L} />
          ))
        )}
      </g>
      <rect x="108" y="128" width="116" height="6" rx="3" fill={N} opacity=".18" />
    </Frame>
  );
}

export function IllResources() {
  const tiles: [string, string][] = [
    ['M10 8h14v3H10zM10 14h14v3H10zM10 20h9v3h-9z', 'Văn bản'],
    ['M8 8h20v14H8zM16 25h4', 'Slide'],
    ['M12 12l12 6-12 6z', 'Video'],
    ['M18 8a4 4 0 014 4v6a4 4 0 01-8 0v-6a4 4 0 014-4zM10 18a8 8 0 0016 0', 'Podcast'],
    ['M10 26V16M18 26V8M26 26V19', 'Biểu đồ'],
    ['M12 10a6 6 0 1112 0c0 3-4 3.5-4 7M18 24v1', 'Câu hỏi'],
  ];
  return (
    <Frame>
      {tiles.map(([d], i) => {
        const x = 24 + (i % 3) * 66;
        const y = 22 + Math.floor(i / 3) * 56;
        const hi = i === 1 || i === 4;
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <rect width="54" height="46" rx="10" fill={hi ? G : '#fff'} stroke={hi ? N : L} strokeWidth="2" />
            <g transform="translate(9 5) scale(.95)">
              <path d={d} fill="none" stroke={N} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </g>
        );
      })}
    </Frame>
  );
}
