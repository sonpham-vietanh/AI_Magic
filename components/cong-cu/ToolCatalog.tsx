'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { ALL_TOOLS, getCategoryMeta, TOOL_CATEGORIES } from '@/lib/catalog';
import type { PedagogicalTool, ToolCategoryCode } from '@/lib/types';
import { SearchIcon } from './shared';

type Filter = 'featured' | 'all' | ToolCategoryCode;

/** Bỏ dấu, hạ chữ thường để tìm "giao an" ra "Giáo án". */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function ToolCatalog({ onOpen }: { onOpen: (tool: PedagogicalTool) => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('featured');

  const index = useMemo(
    () =>
      ALL_TOOLS.map((tool) => ({
        tool,
        hay: fold(
          [
            tool.name,
            tool.shortDescription,
            tool.magicSchoolEquivalent,
            tool.vietAnhValueAdd,
            tool.moetStandardRef,
            tool.slug,
          ].join(' '),
        ),
      })),
    [],
  );

  const featuredCount = useMemo(() => ALL_TOOLS.filter((t) => t.featured).length, []);

  const q = fold(query.trim());
  const results = index
    .filter(({ tool, hay }) => {
      if (q) {
        // Đang tìm thì tìm trong cả kho (hoặc trong nhóm đã chọn).
        if (filter !== 'all' && filter !== 'featured' && tool.category !== filter) return false;
        return q.split(/\s+/).every((w) => hay.includes(w));
      }
      if (filter === 'featured') return Boolean(tool.featured);
      if (filter === 'all') return true;
      return tool.category === filter;
    })
    .map((x) => x.tool);

  return (
    <section aria-label="Kho công cụ" className="cc-catalog">
      <div className="cc-search">
        <label className="ag-field-label" htmlFor="cc-tool-search">
          Tìm công cụ
        </label>
        <div className="cc-search-box">
          <SearchIcon />
          <input
            id="cc-tool-search"
            type="search"
            className="ag-field"
            placeholder="Ví dụ: giáo án, ma trận, nhận xét…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="cc-filters" role="group" aria-label="Lọc theo nhóm công cụ">
        <FilterChip active={filter === 'featured'} onClick={() => setFilter('featured')}>
          Trọng tâm <span className="cc-count">{featuredCount}</span>
        </FilterChip>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          Tất cả <span className="cc-count">{ALL_TOOLS.length}</span>
        </FilterChip>
        {TOOL_CATEGORIES.map((cat) => (
          <FilterChip
            key={cat.code}
            active={filter === cat.code}
            onClick={() => setFilter(cat.code)}
          >
            {cat.shortName} <span className="cc-count">{cat.toolCount}</span>
          </FilterChip>
        ))}
      </div>

      <p className="cc-result-count" role="status" aria-live="polite">
        {results.length} công cụ
        {q ? ` cho “${query.trim()}”` : ''}
      </p>

      {results.length === 0 ? (
        <div className="cc-empty">
          <p>Không thấy công cụ nào phù hợp.</p>
          <button
            type="button"
            className="ag-btn small"
            onClick={() => {
              setQuery('');
              setFilter('all');
            }}
          >
            Xem tất cả công cụ
          </button>
        </div>
      ) : (
        <ul className="cc-tools">
          {results.map((tool) => {
            const cat = getCategoryMeta(tool.category);
            const experimental = tool.maturity === 'experimental';
            return (
              <li key={tool.id}>
                <button type="button" className="cc-tool" onClick={() => onOpen(tool)}>
                  <span className="cc-tool-top">
                    <span className="cc-tool-cat">{cat.shortName}</span>
                    {experimental && <span className="ag-status draft">Thử nghiệm</span>}
                  </span>
                  <span className="cc-tool-name">{tool.name}</span>
                  <span className="cc-tool-desc">{tool.shortDescription}</span>
                  <span className="cc-tool-foot">
                    <span className="cc-tool-time">
                      <Icon name="clock" size={16} />
                      Tiết kiệm ~{tool.estimatedMinutesSaved} phút
                    </span>
                    <span className="cc-tool-open">
                      Mở <Icon name="chevron" size={16} />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`ag-chip cc-chip${active ? ' active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
