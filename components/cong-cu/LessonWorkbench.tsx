'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { MathText } from '@/components/MathText';
import type {
  SupabaseAtom,
  SupabaseEdge,
  SupabaseFactoryAsset,
  SupabaseFactoryPackage,
  SupabaseQuestion,
} from '@/lib/supabase';
import { QUICK_TOOLS, SearchIcon } from './shared';

export interface LessonDetail {
  packages: SupabaseFactoryPackage[];
  assets: SupabaseFactoryAsset[];
  questions: SupabaseQuestion[];
  edges: SupabaseEdge[];
  loading: boolean;
}

type DetailTab = 'package' | 'assets' | 'questions' | 'links';

export function LessonWorkbench({
  atoms,
  atomsLoading,
  atomId,
  selectedAtom,
  onPick,
  query,
  onQuery,
  onlyReady,
  onOnlyReady,
  detail,
  className,
  onProcess,
  onOpenAsset,
  onOpenToolById,
}: {
  atoms: SupabaseAtom[];
  atomsLoading: boolean;
  atomId: string;
  selectedAtom?: SupabaseAtom;
  onPick: (id: string) => void;
  query: string;
  onQuery: (q: string) => void;
  onlyReady: boolean;
  onOnlyReady: (v: boolean) => void;
  detail: LessonDetail;
  className: string;
  onProcess: () => void;
  onOpenAsset: (a: SupabaseFactoryAsset) => void;
  onOpenToolById: (toolId: string) => void;
}) {
  const [tab, setTab] = useState<DetailTab>('package');
  const [level, setLevel] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const { packages, assets, questions, edges } = detail;
  const activePkg = packages.find((p) => p.level === level) || packages[0];

  const tabs: { id: DetailTab; label: string; count?: number }[] = [
    { id: 'package', label: 'Gói kiến thức' },
    { id: 'assets', label: 'Học liệu gốc', count: assets.length },
    { id: 'questions', label: 'Câu hỏi', count: questions.length },
    { id: 'links', label: 'Liên môn', count: edges.length },
  ];

  return (
    <div className={`cc-bench${listOpen ? ' list-open' : ''}`}>
      {/* ---------- Danh sách bài ---------- */}
      <aside className="cc-bench-list" aria-label="Chọn bài dạy">
        <div className="cc-bench-search">
          <label className="ag-field-label" htmlFor="cc-lesson-search">
            Tìm bài
          </label>
          <div className="cc-search-box">
            <SearchIcon />
            <input
              id="cc-lesson-search"
              type="search"
              className="ag-field"
              placeholder="Tên bài hoặc mã bài"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
          <label className="cc-check">
            <input
              type="checkbox"
              checked={onlyReady}
              onChange={(e) => onOnlyReady(e.target.checked)}
            />
            <span>Chỉ bài đã có gói gốc</span>
          </label>
        </div>

        <div className="ag-lessons cc-lessons" role="group" aria-label="Danh sách bài" aria-busy={atomsLoading}>
          {atomsLoading && atoms.length === 0 && (
            <p className="ag-empty-note cc-pad">Đang tải danh sách bài…</p>
          )}
          {!atomsLoading && atoms.length === 0 && (
            <p className="ag-empty-note cc-pad">
              Không thấy bài phù hợp. Thử đổi môn, khối hoặc từ khoá.
            </p>
          )}
          {atoms.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`ag-lesson cc-lesson${a.id === atomId ? ' active' : ''}`}
              aria-current={a.id === atomId ? 'true' : undefined}
              onClick={() => {
                onPick(a.id);
                setListOpen(false);
                setTab('package');
                setLevel(null);
              }}
            >
              <span>
                <span className="ag-lesson-title">{a.title}</span>
                <span className="ag-lesson-code">{a.code}</span>
              </span>
              {a.hasFactoryPackage && <span className="ag-status ok">Có gói gốc</span>}
            </button>
          ))}
        </div>
      </aside>

      {/* ---------- Chi tiết bài ---------- */}
      <section className="cc-bench-detail" aria-label="Chi tiết bài dạy">
        {!selectedAtom ? (
          <div className="cc-empty">
            <p>{atomsLoading ? 'Đang tải bài học…' : 'Chọn một bài ở danh sách để bắt đầu.'}</p>
          </div>
        ) : (
          <>
            <div className="cc-detail-head">
              <div className="cc-detail-title">
                <span className="cc-eyebrow">
                  {selectedAtom.subject} · Khối {selectedAtom.grade}
                </span>
                <h2>{selectedAtom.title}</h2>
                <p className="cc-meta">
                  {selectedAtom.chapter} · {selectedAtom.lesson}
                </p>
              </div>
              <button
                type="button"
                className="ag-btn small cc-narrow-only"
                aria-expanded={listOpen}
                onClick={() => setListOpen((v) => !v)}
              >
                {listOpen ? 'Ẩn danh sách' : 'Đổi bài'}
              </button>
            </div>

            <div className="cc-cta">
              <button type="button" className="ag-btn primary cc-cta-btn" onClick={onProcess}>
                <Icon name="sparkles" size={20} />
                Chế biến ngay
              </button>
              <p className="cc-cta-note">
                Tạo giáo án, phiếu học tập, kiểm tra nhanh và cẩm nang hỏi đáp
                {className ? ` cho lớp ${className}` : ''}.
              </p>
            </div>

            <div className="cc-quick" role="group" aria-label="Soạn lẻ nhanh">
              <span className="cc-quick-label">Soạn lẻ:</span>
              {QUICK_TOOLS.map((q) => (
                <button
                  key={q.toolId}
                  type="button"
                  className="ag-chip cc-chip"
                  onClick={() => onOpenToolById(q.toolId)}
                >
                  {q.label}
                </button>
              ))}
            </div>

            <div className="ag-tabs cc-tabs" role="tablist" aria-label="Nội dung bài">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`cc-dtab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls="cc-dpanel"
                  className="ag-tab"
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  {t.count !== undefined && <span className="cc-count">{t.count}</span>}
                </button>
              ))}
            </div>

            <div
              className="cc-panel"
              id="cc-dpanel"
              role="tabpanel"
              aria-labelledby={`cc-dtab-${tab}`}
              aria-busy={detail.loading}
            >
              {tab === 'package' && (
                <PackagePanel
                  packages={packages}
                  active={activePkg}
                  onLevel={setLevel}
                  atom={selectedAtom}
                />
              )}

              {tab === 'assets' &&
                (assets.length > 0 ? (
                  <ul className="cc-assets">
                    {assets.map((asset) => (
                      <li key={asset.id}>
                        <button type="button" className="cc-asset" onClick={() => onOpenAsset(asset)}>
                          <Icon name="file" size={22} />
                          <span>
                            <strong>{asset.formatLabel}</strong>
                            <small>{asset.sections.length} mục · xem và tải Word</small>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cc-empty-line">
                    Bài này chưa có học liệu gốc. Bấm “Chế biến ngay” để tạo bằng AI.
                  </p>
                ))}

              {tab === 'questions' &&
                (questions.length > 0 ? (
                  <ol className="cc-questions">
                    {questions.slice(0, 5).map((q, idx) => (
                      <li key={q.id}>
                        <span className="cc-q-tag">
                          Câu {idx + 1} · {q.do_kho} · DOK {q.dok}
                        </span>
                        <div className="cc-q-text">
                          <MathText text={q.noi_dung} />
                        </div>
                        <div className="cc-q-ans">
                          Đáp án: <MathText text={q.dap_an} />
                        </div>
                      </li>
                    ))}
                    {questions.length > 5 && (
                      <li className="cc-more-note">
                        Còn {questions.length - 5} câu nữa. Xem trong “Bảng tương tác lớp học”.
                      </li>
                    )}
                  </ol>
                ) : (
                  <p className="cc-empty-line">Bài này chưa có câu hỏi trong ngân hàng.</p>
                ))}

              {tab === 'links' &&
                (edges.length > 0 ? (
                  <div>
                    <ul className="cc-edges">
                      {edges.slice(0, 6).map((e) => (
                        <li key={e.id}>
                          <span className="cc-edge-subj">{e.linkedAtom?.subject || 'Liên môn'}</span>
                          <span>{e.linkedAtom?.title || e.remediation_hint}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="ag-btn small"
                      onClick={() => onOpenToolById('khbd-steam-5e')}
                    >
                      Soạn bài liên môn
                    </button>
                  </div>
                ) : (
                  <p className="cc-empty-line">Bài này chưa có liên kết liên môn.</p>
                ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function PackagePanel({
  packages,
  active,
  onLevel,
  atom,
}: {
  packages: SupabaseFactoryPackage[];
  active?: SupabaseFactoryPackage;
  onLevel: (n: number) => void;
  atom: SupabaseAtom;
}) {
  return (
    <div className="cc-pkg">
      {packages.length > 1 && (
        <div className="cc-filters" role="group" aria-label="Mức của gói kiến thức">
          {packages.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              className={`ag-chip cc-chip${active?.id === pkg.id ? ' active' : ''}`}
              aria-pressed={active?.id === pkg.id}
              onClick={() => onLevel(pkg.level)}
            >
              Mức L{pkg.level} ({pkg.bloom})
            </button>
          ))}
        </div>
      )}

      {active ? (
        <dl className="cc-blocks">
          <Block label="Mục tiêu" text={active.fields.objective || atom.yeu_cau || atom.title} />
          <Block label="Giải thích" text={active.fields.explanation} />
          <Block label="Ví dụ" text={active.fields.example || 'Áp dụng trực tiếp quy tắc bài học.'} />
          <Block label="Phản ví dụ" text={active.fields.counterExample} />
          <Block
            label="Lỗi hay gặp"
            tone="warn"
            text={
              active.fields.commonMistake || atom.quan_niem_sai || 'Kiểm tra kỹ điều kiện áp dụng.'
            }
          />
          <Block label="Cách dạy gợi ý" tone="navy" text={active.fields.strategy} />
        </dl>
      ) : (
        <dl className="cc-blocks">
          <Block label="Yêu cầu cần đạt" text={atom.yeu_cau || atom.title} />
          <Block
            label="Lỗi hay gặp"
            tone="warn"
            text={atom.quan_niem_sai || 'Lưu ý học sinh nắm vững định nghĩa và điều kiện áp dụng.'}
          />
          <p className="cc-note">Bài này chưa có gói kiến thức dựng sẵn.</p>
        </dl>
      )}
    </div>
  );
}

function Block({
  label,
  text,
  tone,
}: {
  label: string;
  text?: string | null;
  tone?: 'warn' | 'navy';
}) {
  if (!text) return null;
  return (
    <div className={`cc-block${tone ? ` ${tone}` : ''}`}>
      <dt>{label}</dt>
      <dd>{text}</dd>
    </div>
  );
}
