'use client';

import { RESOURCE_KINDS, RESOURCE_LABELS, type ResourceKind } from '@/lib/resources/types';
import { normalizeResources, toggleResource } from '@/lib/agent/flow';

/** Hộp kiểm 6 dạng tài nguyên; luôn giữ tối thiểu 1 dạng. Dùng chung cho trợ lý và biểu mẫu. */
export function ResourceChecklist({
  value,
  onChange,
  idPrefix,
}: {
  value: ResourceKind[];
  onChange: (v: ResourceKind[]) => void;
  idPrefix: string;
}) {
  const current = normalizeResources(value);
  return (
    <fieldset className="ag-reslist">
      <legend>Chọn các dạng cần sinh (tối thiểu 1)</legend>
      {RESOURCE_KINDS.map((k) => {
        const on = current.includes(k);
        const lastOne = on && current.length <= 1;
        return (
          <label key={k} className={`ag-res${on ? ' on' : ''}`} htmlFor={`${idPrefix}-${k}`}>
            <input
              id={`${idPrefix}-${k}`}
              type="checkbox"
              checked={on}
              aria-disabled={lastOne}
              onChange={() => onChange(toggleResource(current, k))}
            />
            <span>{RESOURCE_LABELS[k]}</span>
          </label>
        );
      })}
      <p className="ag-note" role="status">
        Đang chọn {current.length}/6 dạng.{current.length <= 1 ? ' Cần giữ lại ít nhất 1 dạng.' : ''}
      </p>
    </fieldset>
  );
}
