'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '@/lib/ui/fetchJson';
import { Icon } from '@/components/ui/icons';

interface TreeNode {
  id: string;
  kind: string;
  parent_id: string | null;
  title: string;
  code: string;
  ord: number;
}

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ok'; nodes: TreeNode[] };

async function fetchNodes(qs: string, signal?: AbortSignal): Promise<TreeNode[]> {
  const j = await fetchJson<{ nodes?: TreeNode[] }>(`/api/supabase/knowledge?mode=tree&${qs}`, { signal });
  return j.nodes || [];
}

function Branch({ node, level }: { node: TreeNode; level: number }) {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load | null>(null);
  const isLeaf = node.kind === 'lesson';

  const fetchChildren = useCallback(() => {
    setLoad({ state: 'loading' });
    fetchNodes(`parentId=${encodeURIComponent(node.id)}`)
      .then((nodes) =>
        setLoad({
          state: 'ok',
          nodes: [...nodes].sort((a, b) => a.ord - b.ord),
        }),
      )
      .catch(() => setLoad({ state: 'error' }));
  }, [node.id]);

  if (isLeaf) {
    return (
      <li>
        <div className="hs-node leaf">
          <span>{node.title}</span>
        </div>
      </li>
    );
  }

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !load) fetchChildren();
  };

  return (
    <li>
      <button
        type="button"
        className={`hs-node ${level === 0 ? 'subject' : ''}`}
        aria-expanded={open}
        onClick={toggle}
      >
        <Icon name="chevron" size={18} aria-hidden="true" />
        <span>{node.title}</span>
      </button>
      {open && (
        <ul>
          {load?.state === 'loading' && (
            <li>
              <div className="hs-tree-msg" role="status">
                Đang tải...
              </div>
            </li>
          )}
          {load?.state === 'error' && (
            <li>
              <div className="hs-tree-msg" role="alert">
                Chưa tải được.{' '}
                <button type="button" className="ag-link" onClick={fetchChildren}>
                  Thử lại
                </button>
              </div>
            </li>
          )}
          {load?.state === 'ok' && load.nodes.length === 0 && (
            <li>
              <div className="hs-tree-msg">Chưa có nội dung.</div>
            </li>
          )}
          {load?.state === 'ok' &&
            load.nodes.map((n) => <Branch key={n.id} node={n} level={level + 1} />)}
        </ul>
      )}
    </li>
  );
}

export function CurriculumTree() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchNodes('kind=subject', ctrl.signal)
      .then((nodes) =>
        setLoad({ state: 'ok', nodes: [...nodes].sort((a, b) => a.ord - b.ord) }),
      )
      .catch(() => {
        if (!ctrl.signal.aborted) setLoad({ state: 'error' });
      });
    return () => ctrl.abort();
  }, [attempt]);

  return (
    <section className="ag-card hs-card" aria-label="Chương trình GDPT 2018">
      <h3>Chương trình GDPT 2018</h3>
      <p className="ag-note" style={{ marginTop: 0, marginBottom: 10 }}>
        Chọn môn để xem khối, chương và bài.
      </p>
      {load.state === 'loading' && (
        <div role="status" aria-label="Đang tải chương trình" style={{ display: 'grid', gap: 10 }}>
          {[70, 55, 80, 60, 65].map((w, i) => (
            <div key={i} className="hs-skel" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}
      {load.state === 'error' && (
        <div className="ag-alert bad" role="alert">
          <Icon name="alert" size={18} aria-hidden="true" />
          <span>
            Chưa tải được chương trình.{' '}
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
      {load.state === 'ok' && (
        <ul className="hs-tree">
          {load.nodes.map((n) => (
            <Branch key={n.id} node={n} level={0} />
          ))}
        </ul>
      )}
    </section>
  );
}
