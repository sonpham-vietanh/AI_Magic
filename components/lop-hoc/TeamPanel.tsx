'use client';

import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/ui/fetchJson';
import { Icon } from '@/components/ui/icons';

interface Person {
  id: string;
  name: string;
  role?: string;
  title?: string;
  subject?: string;
}

const ROLE_LABEL: Record<string, string> = {
  teacher: 'Giáo viên',
  lead: 'Tổ trưởng',
  admin: 'Quản trị học thuật',
  principal: 'Ban giám hiệu',
};

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ok'; people: Person[] };

export function TeamPanel() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchJson<{ overview?: { users?: Person[] } }>('/api/supabase/knowledge?mode=overview', { signal: ctrl.signal })
      .then((j) => {
        const people = (j.overview?.users || []).filter(
          (u) => u.name && u.name.trim() !== '' && u.name !== 'Người dùng',
        );
        setLoad({ state: 'ok', people });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setLoad({ state: 'error' });
      });
    return () => ctrl.abort();
  }, [attempt]);

  return (
    <section className="ag-card hs-card" aria-label="Đội ngũ chuyên môn">
      <h3>Đội ngũ chuyên môn</h3>
      {load.state === 'loading' && (
        <div role="status" aria-label="Đang tải đội ngũ" className="hs-team">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="hs-skel" style={{ height: 76, borderRadius: 14 }} />
          ))}
        </div>
      )}
      {load.state === 'error' && (
        <div className="ag-alert bad" role="alert">
          <Icon name="alert" size={18} aria-hidden="true" />
          <span>
            Chưa tải được danh sách.{' '}
            <button
              type="button"
              className="ag-link"
              onClick={() => {
                setLoad({ state: 'loading' });
                setAttempt((a) => a + 1);
              }}
            >
              Thử lại
            </button>
          </span>
        </div>
      )}
      {load.state === 'ok' && load.people.length === 0 && (
        <p className="hs-empty">Chưa có thông tin đội ngũ.</p>
      )}
      {load.state === 'ok' && load.people.length > 0 && (
        <ul className="hs-team" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {load.people.map((p) => {
            const last = p.name.trim().split(/\s+/).pop() || '?';
            return (
              <li key={p.id} className="hs-person">
                <span className="hs-avatar" aria-hidden="true">
                  {last.charAt(0).toUpperCase()}
                </span>
                <div style={{ minWidth: 0 }}>
                  <strong>{p.name}</strong>
                  <span>{p.title || ROLE_LABEL[p.role || ''] || 'Giáo viên'}</span>
                  {p.subject && !(p.title || "").includes(p.subject) && <span>Môn {p.subject}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
