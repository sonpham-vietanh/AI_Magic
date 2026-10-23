// Minh hoạ tự vẽ của màn hình chào.
/** Minh hoạ tự vẽ: bản soạn, slide và câu hỏi quanh một tia sáng. Trang trí nên ẩn khỏi trình đọc màn hình. */
export function HeroArt() {
  return (
    <svg className="ag-art-svg" viewBox="0 0 380 320" role="presentation" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ag-g-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F9DD0E" />
          <stop offset="1" stopColor="#E8C40A" />
        </linearGradient>
        <linearGradient id="ag-g-navy" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#26275D" />
          <stop offset="1" stopColor="#14153A" />
        </linearGradient>
      </defs>
      <circle cx="196" cy="162" r="132" fill="#FBF6DC" />
      <circle cx="196" cy="162" r="96" fill="none" stroke="#E8C40A" strokeOpacity="0.45" strokeDasharray="3 9" strokeWidth="2" />
      {/* slide */}
      <g className="ag-art-float b" transform="rotate(7 288 118)">
        <rect x="222" y="62" width="136" height="92" rx="12" fill="#fff" stroke="#D3CFC0" />
        <rect x="222" y="62" width="136" height="20" rx="12" fill="url(#ag-g-navy)" />
        <rect x="222" y="74" width="136" height="8" fill="url(#ag-g-navy)" />
        <circle cx="236" cy="72" r="3" fill="#F9DD0E" />
        <rect x="236" y="96" width="50" height="6" rx="3" fill="#14153A" />
        <rect x="236" y="108" width="34" height="5" rx="2.5" fill="#D3CFC0" />
        <rect x="300" y="132" width="10" height="14" rx="2" fill="#E8C40A" />
        <rect x="314" y="122" width="10" height="24" rx="2" fill="#14153A" />
        <rect x="328" y="112" width="10" height="34" rx="2" fill="#26275D" />
      </g>
      {/* kế hoạch bài dạy */}
      <g className="ag-art-float a">
        <rect x="70" y="52" width="150" height="196" rx="14" fill="#fff" stroke="#D3CFC0" />
        <rect x="70" y="52" width="150" height="38" rx="14" fill="url(#ag-g-navy)" />
        <rect x="70" y="76" width="150" height="14" fill="url(#ag-g-navy)" />
        <rect x="86" y="64" width="64" height="8" rx="4" fill="#F9DD0E" />
        <rect x="86" y="104" width="118" height="7" rx="3.5" fill="#14153A" />
        <rect x="86" y="120" width="96" height="6" rx="3" fill="#D3CFC0" />
        <rect x="86" y="134" width="108" height="6" rx="3" fill="#D3CFC0" />
        <rect x="86" y="154" width="118" height="7" rx="3.5" fill="#14153A" />
        <rect x="86" y="170" width="84" height="6" rx="3" fill="#D3CFC0" />
        <rect x="86" y="184" width="100" height="6" rx="3" fill="#D3CFC0" />
        <rect x="86" y="204" width="56" height="22" rx="11" fill="url(#ag-g-gold)" />
        <path d="M96 215l4 4 8-8" fill="none" stroke="#14153A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* câu hỏi */}
      <g className="ag-art-float c">
        <rect x="204" y="190" width="132" height="70" rx="14" fill="#14153A" />
        <path d="M236 260l-6 18 22-18z" fill="#14153A" />
        <circle cx="228" cy="214" r="12" fill="url(#ag-g-gold)" />
        <text x="228" y="219" textAnchor="middle" fontSize="15" fontWeight="800" fill="#14153A" fontFamily="inherit">
          ?
        </text>
        <rect x="248" y="208" width="72" height="6" rx="3" fill="#E2E3F0" />
        <rect x="248" y="220" width="52" height="6" rx="3" fill="#8D8FC0" />
        <rect x="218" y="238" width="100" height="10" rx="5" fill="#26275D" />
        <rect x="218" y="238" width="62" height="10" rx="5" fill="#F9DD0E" />
      </g>
      {/* tia sáng */}
      <g className="ag-art-spark">
        <path d="M62 120l5 12 12 5-12 5-5 12-5-12-12-5 12-5z" fill="#E8C40A" />
        <path d="M336 30l3.5 8.5 8.5 3.5-8.5 3.5-3.5 8.5-3.5-8.5-8.5-3.5 8.5-3.5z" fill="#14153A" />
        <circle cx="48" cy="248" r="5" fill="#26275D" />
        <circle cx="352" cy="170" r="4" fill="#E8C40A" />
      </g>
    </svg>
  );
}
