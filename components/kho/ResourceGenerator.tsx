'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { ArtifactView } from '@/components/resources/ArtifactView';
import { RESOURCE_KINDS, RESOURCE_LABELS, type ResourceKind } from '@/lib/resources/types';
import { whenText, type AssetView } from './types';

interface Props {
  atomId: string;
  /** Bài có gói kiến thức để làm căn cứ sinh. */
  canGenerate: boolean;
  /** Báo lên trang cha mỗi khi danh sách tài nguyên đổi (để cập nhật thanh quy trình). */
  onAssets?: (assets: AssetView[]) => void;
}

type RunState = { running: boolean; current: ResourceKind | null; done: number; total: number };

export function ResourceGenerator({ atomId, canGenerate, onAssets }: Props) {
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [picked, setPicked] = useState<Set<ResourceKind>>(() => new Set(RESOURCE_KINDS));
  const [run, setRun] = useState<RunState>({ running: false, current: null, done: 0, total: 0 });
  const [errors, setErrors] = useState<Partial<Record<ResourceKind, string>>>({});
  const [cancelled, setCancelled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const onAssetsRef = useRef(onAssets);
  onAssetsRef.current = onAssets;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/kho/resources?atomId=${encodeURIComponent(atomId)}`);
      const data = (await res.json()) as { ok?: boolean; assets?: AssetView[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAssets(data.assets || []);
      onAssetsRef.current?.(data.assets || []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Không tải được tài nguyên của bài.');
    } finally {
      setLoading(false);
    }
  }, [atomId]);

  useEffect(() => {
    setErrors({});
    setCancelled(false);
    setPicked(new Set(RESOURCE_KINDS));
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const generate = async (kinds: ResourceKind[]) => {
    if (!kinds.length || run.running) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setCancelled(false);
    setErrors((e) => {
      const n = { ...e };
      for (const k of kinds) delete n[k];
      return n;
    });
    setRun({ running: true, current: kinds[0], done: 0, total: kinds.length });
    let done = 0;
    for (const kind of kinds) {
      if (ctrl.signal.aborted) break;
      setRun({ running: true, current: kind, done, total: kinds.length });
      try {
        const res = await fetch('/api/kho/resources/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ atomId, kinds: [kind] }),
          signal: ctrl.signal,
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          errors?: { kind: ResourceKind; error: string }[];
        };
        if (!res.ok || !data.ok) {
          setErrors((e) => ({ ...e, [kind]: data.error || `Lỗi HTTP ${res.status}` }));
        } else if (data.errors?.length) {
          const err = data.errors;
          setErrors((e) => {
            const n = { ...e };
            for (const x of err) n[x.kind] = x.error;
            return n;
          });
        }
      } catch (e) {
        if (ctrl.signal.aborted) break;
        setErrors((x) => ({ ...x, [kind]: e instanceof Error ? e.message : 'Không sinh được dạng này.' }));
      }
      done += 1;
      await load();
    }
    if (ctrl.signal.aborted) setCancelled(true);
    setRun({ running: false, current: null, done, total: kinds.length });
    abortRef.current = null;
  };

  const cancel = () => abortRef.current?.abort();

  const toggle = (k: ResourceKind) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const byKind = new Map(assets.map((a) => [a.kind, a]));
  const selected = RESOURCE_KINDS.filter((k) => picked.has(k));
  const pct = run.total ? Math.round((run.done / run.total) * 100) : 0;

  return (
    <section className="kh-gen" id="kh-sec-2" aria-label="Sinh 6 dạng tài nguyên">
      <div className="kh-gen-head">
        <h3 className="du-h3" style={{ margin: 0 }}>
          Bước 2. Sinh 6 dạng tài nguyên
        </h3>
        <span className="ag-status draft">Nháp, chờ người duyệt</span>
      </div>
      <p className="ag-note" style={{ marginTop: 6 }}>
        Các bản sinh ra đều là bản NHÁP. Chỉ khi người duyệt bấm &quot;Duyệt vào Kho&quot; thì cả bộ mới thành phiên bản chuẩn.
      </p>

      {!canGenerate && (
        <div className="ag-alert warn">
          <Icon name="alert" size={18} />
          <div>Bài này chưa có gói kiến thức nên chưa có căn cứ để sinh tài nguyên.</div>
        </div>
      )}

      <div className="kh-kinds" role="group" aria-label="Chọn dạng tài nguyên cần sinh">
        {RESOURCE_KINDS.map((k) => (
          <label key={k} className={`kh-kind${picked.has(k) ? ' kh-kind-on' : ''}`}>
            <input type="checkbox" checked={picked.has(k)} onChange={() => toggle(k)} disabled={run.running} />
            {RESOURCE_LABELS[k]}
          </label>
        ))}
      </div>

      <div className="ag-actions">
        <button
          type="button"
          className="ag-btn primary"
          disabled={!canGenerate || run.running || selected.length === 0}
          onClick={() => void generate(selected)}
        >
          {run.running ? <span className="ag-spin" aria-hidden="true" /> : <Icon name="sparkles" size={18} />}
          {selected.length === RESOURCE_KINDS.length ? 'Sinh 6 dạng tài nguyên' : `Sinh ${selected.length} dạng đã chọn`}
        </button>
        {run.running && (
          <button type="button" className="ag-btn" onClick={cancel}>
            <Icon name="stop" size={18} />
            Hủy
          </button>
        )}
      </div>

      {(run.running || cancelled) && (
        <div className="kh-progress" role="status" aria-live="polite">
          <div className="kh-bar" aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
          </div>
          <span>
            {run.running
              ? `Đang sinh ${run.current ? RESOURCE_LABELS[run.current] : ''} (${run.done}/${run.total} dạng xong)`
              : `Đã hủy. ${run.done}/${run.total} dạng đã xong, các dạng còn lại chưa sinh.`}
          </span>
        </div>
      )}

      {loadError && (
        <div className="ag-alert bad" role="alert">
          <Icon name="alert" size={18} />
          <div>
            {loadError}{' '}
            <button type="button" className="ag-link" onClick={() => void load()}>
              Thử lại
            </button>
          </div>
        </div>
      )}

      {loading && assets.length === 0 ? (
        <div aria-busy="true" aria-label="Đang tải tài nguyên">
          <div className="du-skel" style={{ margin: '10px 0' }} />
        </div>
      ) : (
        <ul className="kh-assets">
          {RESOURCE_KINDS.map((k) => {
            const a = byKind.get(k);
            const err = errors[k];
            const busy = run.running && run.current === k;
            return (
              <li key={k} className="kh-asset">
                <div className="kh-asset-head">
                  <div>
                    <strong>{RESOURCE_LABELS[k]}</strong>
                    {a ? (
                      <span className="kh-asset-meta">
                        {a.status === 'approved' ? `Đã duyệt, v${a.version ?? '?'}` : 'Bản nháp'}{a.modelUsed && a.modelUsed !== 'không rõ' ? ` · ${a.modelUsed}` : ''}
                        {whenText(a.createdAt) ? ` · ${whenText(a.createdAt)}` : ''}
                      </span>
                    ) : (
                      <span className="kh-asset-meta">Chưa sinh</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="ag-btn small kh-btn"
                    disabled={!canGenerate || run.running}
                    onClick={() => void generate([k])}
                    aria-label={`${a ? 'Sinh lại' : 'Sinh'} ${RESOURCE_LABELS[k]}`}
                  >
                    {busy ? <span className="ag-spin" aria-hidden="true" /> : <Icon name="refresh" size={16} />}
                    {a ? 'Sinh lại' : 'Sinh'}
                  </button>
                </div>
                {err && (
                  <div className="ag-alert bad" role="alert" style={{ marginTop: 8 }}>
                    <Icon name="alert" size={18} />
                    <div>{err}</div>
                  </div>
                )}
                {a && (
                  <details className="kh-preview">
                    <summary>
                      Xem trước
                      <Icon name="chevronDown" size={18} />
                    </summary>
                    <div className="kh-preview-body">
                      <ArtifactView artifact={a.artifact} compact />
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
