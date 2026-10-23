'use client';

import { rovingRef, rovingKeyDown } from '@/components/resources/roving';
import { useState } from 'react';
import { Shell } from '@/components/Shell';
import { ClassesView } from '@/components/lop-hoc/ClassesView';
import { CurriculumTree } from '@/components/lop-hoc/CurriculumTree';
import { TeamPanel } from '@/components/lop-hoc/TeamPanel';
import '@/app/ui-hs.css';

type Tab = 'lop' | 'ctr' | 'doi';

const TABS: { id: Tab; label: string }[] = [
  { id: 'lop', label: 'Lớp học' },
  { id: 'ctr', label: 'Chương trình GDPT 2018' },
  { id: 'doi', label: 'Đội ngũ' },
];

export default function ClassProfilesPage() {
  const [tab, setTab] = useState<Tab>('lop');

  return (
    <Shell title="Lớp học & chương trình" subtitle="Hiểu lớp mình dạy để soạn bài sát hơn.">
      <div className="hs-wrap">
        <div className="hs-tabs" role="tablist" ref={rovingRef} onKeyDown={rovingKeyDown} aria-label="Nội dung trang">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`hs-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`hs-panel-${t.id}`}
              className="ag-tab"
              onClick={() => setTab(t.id)}
              tabIndex={tab === t.id ? 0 : -1}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`hs-panel-${tab}`} aria-labelledby={`hs-tab-${tab}`}>
          {tab === 'lop' && <ClassesView />}
          {tab === 'ctr' && <CurriculumTree />}
          {tab === 'doi' && <TeamPanel />}
        </div>
      </div>
    </Shell>
  );
}
