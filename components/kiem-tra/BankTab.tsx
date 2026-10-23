'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { fetchJson, friendlyError } from '@/lib/ui/fetchJson';
import { MathText } from '@/components/MathText';
import { LessonMultiField } from '@/components/agent/LessonField';
import type { AtomLite } from '@/components/agent/types';
import { TT22_LABEL, TT22_LEVELS } from '@/lib/assessment/tt22';
import {
  EMPTY_FILTER,
  difficultyBand,
  filterBank,
  summarizeBank,
  type BankFilter,
  type PublicBankItem,
} from '@/lib/assessment/bankView';

const BLOOMS = ['Nhớ', 'Hiểu', 'Vận dụng', 'Phân tích', 'Đánh giá', 'Sáng tạo'];
const BAND_LABEL = { chua_do: 'Chưa đo', de: 'Dễ', vua: 'Vừa', kho: 'Khó' } as const;
const PER_CELL = 2;

interface Full { noiDung: string; options: string[]; dapAn: string; loiGiai: string }

function BankCard({ item }: { item: PublicBankItem }) {
  const [full, setFull] = useState<Full | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toggle = async () => {
    if (full) { setFull(null); return; }
    setBusy(true); setErr('');
    try {
      const j = await fetchJson<{ item: Full }>(`/api/assessment/bank/item?atomId=${encodeURIComponent(item.atomId)}&id=${encodeURIComponent(item.id)}`);
      setFull(j.item);
    } catch (e) { setErr(friendlyError(e, 'Không tải được câu hỏi này. Cô/thầy thử lại nhé.')); } finally { setBusy(false); }
  };
  const band = difficultyBand(item.difficultyMeasured);
  return (
    <li className="ag-card kt-bq">
      <div className="kt-tags">
        <span className="kt-tag">{item.atomCode}</span>
        <span className="kt-tag">Bloom: {item.bloom}</span>
        <span className="kt-tag">{TT22_LABEL[item.tt22Level]}</span>
        <span className="kt-tag">
          {item.difficultyMeasured === null ? 'Độ khó: chưa đo' : `Độ khó thực đo: ${item.difficultyMeasured} (${BAND_LABEL[band]})`}
        </span>
        <span className="kt-tag">{item.lastUsedAt ? `Dùng gần nhất: ${item.lastUsedAt.slice(0, 10)}` : 'Chưa dùng'}</span>
        <span className="kt-tag">{item.kind === 'trac_nghiem' ? 'Trắc nghiệm' : 'Tự luận / trả lời ngắn'}</span>
        {item.blocked && <span className="kt-tag warn">Đang khoá chống trùng</span>}
      </div>
      <p className="kt-line"><MathText text={full ? full.noiDung : item.preview} /></p>
      {full && (
        <div className="kt-ans-open">
          {full.options.length > 0 && (
            <ul className="kt-opts">{full.options.map((o, k) => <li key={k}><b>{String.fromCharCode(65 + k)}.</b> <MathText text={o} /></li>)}</ul>
          )}
          <p className="kt-line"><b>Đáp án:</b> <MathText text={full.dapAn || '(chưa có)'} /></p>
          {full.loiGiai && <p className="kt-line"><MathText text={full.loiGiai} /></p>}
        </div>
      )}
      {err && <div className="ag-alert bad" role="alert"><Icon name="alert" size={18} /><div>{err}</div></div>}
      <button type="button" className="ag-btn small" onClick={() => void toggle()} disabled={busy} aria-expanded={!!full}>
        {busy ? 'Đang tải…' : full ? 'Ẩn đáp án' : 'Xem câu đầy đủ và đáp án'}
      </button>
    </li>
  );
}

export function BankTab() {
  const [lessons, setLessons] = useState<AtomLite[]>([]);
  const [items, setItems] = useState<PublicBankItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [f, setF] = useState<BankFilter>(EMPTY_FILTER);
  const key = lessons.map((l) => l.id).join('|');

  useEffect(() => {
    if (!key) { setItems([]); return; }
    let live = true;
    setBusy(true); setErr('');
    Promise.all(
      key.split('|').map(async (id) => {
        const j = await fetchJson<{ items?: PublicBankItem[] }>(`/api/assessment/bank?atomId=${encodeURIComponent(id)}`);
        return j.items ?? [];
      }),
    )
      .then((all) => { if (live) setItems(all.flat()); })
      .catch((e) => { if (live) { setErr(friendlyError(e, 'Không tải được ngân hàng câu hỏi. Cô/thầy thử chọn lại bài nhé.')); setItems([]); } })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [key]);

  const summary = useMemo(() => summarizeBank(items), [items]);
  const perAtom = useMemo(
    () => lessons.map((l) => ({ l, s: summarizeBank(items.filter((i) => i.atomId === l.id || i.atomCode === l.code)) })),
    [lessons, items],
  );
  const shown = useMemo(() => filterBank(items, f), [items, f]);
  const set = <K extends keyof BankFilter>(k: K, v: BankFilter[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div className="kt-split">
      <div className="kt-side">
        <div className="ag-card kt-form">
          <p className="ag-note kt-lead">Chọn các bài để xem ngân hàng câu hỏi và biết đủ hay thiếu trước khi lập đề.</p>
          <LessonMultiField value={lessons} onChange={setLessons} />
        </div>
        {lessons.length > 0 && (
          <section className="ag-card kt-form" aria-label="Số liệu ngân hàng">
            <h3 className="kt-h">Số câu còn rút được</h3>
            <p className="ag-note">Không tính câu đã dùng trong đề được duyệt 3 năm qua hoặc đang nằm trong đề chờ duyệt.</p>
            <div className="kt-scroll" tabIndex={0} role="region" aria-label="Bảng số câu theo mức, cuộn ngang nếu cần">
              <table className="kt-table kt-table-sm">
                <thead>
                  <tr><th scope="col">Bài</th>{TT22_LEVELS.map((l) => <th key={l} scope="col">{TT22_LABEL[l]}</th>)}<th scope="col">Tổng</th></tr>
                </thead>
                <tbody>
                  {perAtom.map(({ l, s }) => (
                    <tr key={l.id}>
                      <th scope="row">{l.title}<small>{l.code}</small></th>
                      {TT22_LEVELS.map((lv) => {
                        const c = s.byLevel[lv];
                        const low = c.available < PER_CELL;
                        return <td key={lv} className={low ? 'kt-low' : ''}>{c.available}/{c.total}{low ? ' (thiếu)' : ''}</td>;
                      })}
                      <td>{s.available}/{s.total}</td>
                    </tr>
                  ))}
                  <tr className="kt-total">
                    <th scope="row">Tổng</th>
                    {TT22_LEVELS.map((lv) => <td key={lv}>{summary.byLevel[lv].available}/{summary.byLevel[lv].total}</td>)}
                    <td>{summary.available}/{summary.total}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="ag-note">Mỗi ô lập đề mặc định cần {PER_CELL} câu; ô ghi “thiếu” sẽ không đủ câu cho ma trận. Trắc nghiệm có phương án nhiễu: {summary.mcq} câu.</p>
          </section>
        )}
      </div>

      <section className="kt-out" aria-label="Danh sách câu hỏi" aria-live="polite">
        {lessons.length === 0 ? (
          <div className="kt-empty"><Icon name="book" size={28} /><p>Chọn ít nhất một bài để xem câu hỏi. Đáp án chỉ hiện khi cô/thầy bấm xem.</p></div>
        ) : (
          <>
            <div className="ag-card kt-filters">
              <div>
                <label htmlFor="b-q" className="ag-field-label">Tìm trong câu hỏi</label>
                <input id="b-q" className="ag-field" value={f.query} onChange={(e) => set('query', e.target.value)} placeholder="Từ khoá hoặc mã bài" />
              </div>
              <div>
                <label htmlFor="b-bloom" className="ag-field-label">Bậc Bloom</label>
                <select id="b-bloom" className="ag-field" value={f.bloom} onChange={(e) => set('bloom', e.target.value)}>
                  <option value="">Tất cả</option>{BLOOMS.map((b) => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="b-tt" className="ag-field-label">Mức TT 22</label>
                <select id="b-tt" className="ag-field" value={f.tt22} onChange={(e) => set('tt22', e.target.value as BankFilter['tt22'])}>
                  <option value="">Tất cả</option>{TT22_LEVELS.map((l) => <option key={l} value={l}>{TT22_LABEL[l]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="b-df" className="ag-field-label">Độ khó thực đo</label>
                <select id="b-df" className="ag-field" value={f.difficulty} onChange={(e) => set('difficulty', e.target.value as BankFilter['difficulty'])}>
                  <option value="">Tất cả</option><option value="chua_do">Chưa đo</option><option value="de">Dễ</option><option value="vua">Vừa</option><option value="kho">Khó</option>
                </select>
              </div>
              <div>
                <label htmlFor="b-us" className="ag-field-label">Lần dùng gần nhất</label>
                <select id="b-us" className="ag-field" value={f.usage} onChange={(e) => set('usage', e.target.value as BankFilter['usage'])}>
                  <option value="">Tất cả</option><option value="chua_dung">Chưa dùng</option><option value="da_dung">Đã dùng</option><option value="dang_khoa">Đang khoá chống trùng</option>
                </select>
              </div>
              <button type="button" className="ag-btn small" onClick={() => setF(EMPTY_FILTER)}>Xoá bộ lọc</button>
            </div>
            {busy && <p className="ag-note"><span className="ag-spin" aria-hidden="true" /> Đang tải ngân hàng…</p>}
            {err && <div className="ag-alert bad" role="alert"><Icon name="alert" size={18} /><div>{err}</div></div>}
            <p className="ag-note" role="status">Hiện {shown.length} trên {items.length} câu.</p>
            {!busy && shown.length === 0 && <p className="ag-note">Không có câu nào khớp bộ lọc.</p>}
            <ul className="kt-qs">{shown.slice(0, 100).map((i) => <BankCard key={i.id} item={i} />)}</ul>
            {shown.length > 100 && <p className="ag-note">Chỉ hiện 100 câu đầu; hãy lọc thêm để thu hẹp.</p>}
          </>
        )}
      </section>
    </div>
  );
}
