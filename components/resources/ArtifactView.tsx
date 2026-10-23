'use client';

// Hiển thị từng loại sản phẩm (slide, phiếu học tập, bài đọc, sơ đồ tư duy, infographic, podcast, tranh luận, video)
// kèm thanh xuất tệp. Toàn bộ nội dung đi qua React text node, không dùng innerHTML.
import { rovingRef, rovingKeyDown } from './roving';
import '@/app/ui-res.css';
import { useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { Artifact, MindmapNode, ScriptLine } from '@/lib/resources/types';
import { ARTIFACT_LABELS } from '@/lib/resources/types';
import { availableFormats, EXPORT_LABELS, exportArtifact, printWorksheetAnswers } from '@/lib/export/artifact';
import type { ExportFormat } from '@/lib/export/artifact';
import { buildInfographicScene, buildMindmapScene } from '@/lib/export/diagrams';
import { MathText } from '@/components/MathText';
import { SceneSvg } from './SceneSvg';
import { useSpeech } from './useSpeech';

const LEVEL: Record<string, string> = { nho: 'Nhớ', hieu: 'Hiểu', van_dung: 'Vận dụng' };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const paras = (t: string) => String(t ?? '').split(/\n+/).filter((x) => x.trim());

export function ArtifactView({ artifact, compact, draft }: { artifact: Artifact; compact?: boolean; draft?: boolean }) {
  if (compact) return <CompactView artifact={artifact} />;
  let body: ReactNode;
  switch (artifact.kind) {
    case 'slides':
      body = <SlidesView data={artifact.data as Artifact<'slides'>['data']} />;
      break;
    case 'worksheet':
      body = <WorksheetView artifact={artifact} draft={draft} />;
      break;
    case 'text':
      body = <TextView data={artifact.data as Artifact<'text'>['data']} />;
      break;
    case 'mindmap':
      body = <MindmapView data={artifact.data as Artifact<'mindmap'>['data']} />;
      break;
    case 'infographic':
      body = <InfographicView data={artifact.data as Artifact<'infographic'>['data']} />;
      break;
    case 'podcast': {
      const d = artifact.data as Artifact<'podcast'>['data'];
      body = (
        <ScriptView
          intro={`Người dẫn: ${(d.hosts ?? []).join(', ')} · khoảng ${d.durationMin} phút`}
          speakers={d.hosts ?? []}
          lines={d.lines ?? []}
        />
      );
      break;
    }
    case 'tranh_luan': {
      const d = artifact.data as Artifact<'tranh_luan'>['data'];
      body = (
        <ScriptView
          intro={d.topic}
          speakers={(d.experts ?? []).map((e) => e.name)}
          stances={Object.fromEntries((d.experts ?? []).map((e) => [e.name, e.stance]))}
          lines={d.lines ?? []}
          conclusion={d.conclusion}
        />
      );
      break;
    }
    case 'video':
      body = <VideoView data={artifact.data as Artifact<'video'>['data']} />;
      break;
    default:
      body = <p className="rs-note">Chưa có cách hiển thị cho loại sản phẩm này.</p>;
  }
  return (
    <section className="rs" aria-label={ARTIFACT_LABELS[artifact.kind]}>
      <ExportBar artifact={artifact} draft={draft} />
      {body}
    </section>
  );
}

/* ---------- Thanh xuất tệp ---------- */

function ExportBar({ artifact, draft }: { artifact: Artifact; draft?: boolean }) {
  const formats = availableFormats(artifact.kind);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(f: ExportFormat) {
    setBusy(f);
    setMsg(null);
    try {
      await exportArtifact(artifact, f, undefined, { draft: !!draft });
      setMsg({ ok: true, text: f === 'pdf' ? 'Đã mở hộp thoại in. Chọn "Lưu dạng PDF" nếu cô/thầy muốn lưu tệp.' : 'Đã tạo tệp, cô/thầy xem trong thư mục Tải xuống.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Không xuất được tệp.' });
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="rs-export">
      <div className="rs-export-btns">
        {formats.map((f, i) => (
          <button key={f} type="button" className={`ag-btn small${i === 0 ? ' primary' : ''}`} disabled={busy !== null} onClick={() => run(f)} data-export={f}>
            {busy === f ? 'Đang tạo...' : EXPORT_LABELS[f]}
          </button>
        ))}
      </div>
      {msg && (
        <p className={`rs-msg ${msg.ok ? 'ok' : 'bad'}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

/* ---------- Thẻ nhỏ ---------- */

function CompactView({ artifact }: { artifact: Artifact }) {
  const label = ARTIFACT_LABELS[artifact.kind];
  let facts = '';
  let lines: string[] = [];
  switch (artifact.kind) {
    case 'slides': {
      const d = artifact.data as Artifact<'slides'>['data'];
      facts = `${d.slides?.length ?? 0} slide`;
      lines = (d.slides ?? []).slice(0, 4).map((s, i) => `${i + 1}. ${s.title}`);
      break;
    }
    case 'worksheet': {
      const d = artifact.data as Artifact<'worksheet'>['data'];
      const n = (d.sections ?? []).reduce((s, x) => s + (x.items?.length ?? 0), 0);
      facts = `${n} câu · có đáp án riêng`;
      lines = (d.sections ?? []).slice(0, 4).map((s) => s.heading);
      break;
    }
    case 'text': {
      const d = artifact.data as Artifact<'text'>['data'];
      facts = `${d.sections?.length ?? 0} mục`;
      lines = (d.sections ?? []).slice(0, 4).map((s) => s.heading);
      break;
    }
    case 'mindmap': {
      const d = artifact.data as Artifact<'mindmap'>['data'];
      facts = `${countNodes(d.root)} nút`;
      lines = (d.root?.children ?? []).slice(0, 5).map((c) => c.label);
      break;
    }
    case 'infographic': {
      const d = artifact.data as Artifact<'infographic'>['data'];
      facts = `${d.keyPoints?.length ?? 0} ý chính`;
      lines = [d.takeaway];
      break;
    }
    case 'podcast': {
      const d = artifact.data as Artifact<'podcast'>['data'];
      facts = `${d.lines?.length ?? 0} lượt nói · ~${d.durationMin} phút`;
      lines = (d.lines ?? []).slice(0, 2).map((l) => `${l.speaker}: ${l.text}`);
      break;
    }
    case 'tranh_luan': {
      const d = artifact.data as Artifact<'tranh_luan'>['data'];
      facts = `${d.lines?.length ?? 0} lượt nói`;
      lines = [d.topic];
      break;
    }
    case 'video': {
      const d = artifact.data as Artifact<'video'>['data'];
      const tot = (d.scenes ?? []).reduce((s, x) => s + x.durationSec, 0);
      facts = `${d.scenes?.length ?? 0} cảnh · ${mmss(tot)}`;
      lines = (d.scenes ?? []).slice(0, 3).map((s) => `Cảnh ${s.n}: ${s.visual}`);
      break;
    }
  }
  return (
    <div className="rs-compact">
      <div className="rs-compact-top">
        <span className="rs-chip">{label}</span>
        <span className="rs-compact-facts">{facts}</span>
      </div>
      <strong className="rs-compact-title">{artifact.title}</strong>
      <ul>
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

function countNodes(n?: MindmapNode): number {
  if (!n) return 0;
  return 1 + (n.children ?? []).reduce((s, c) => s + countNodes(c), 0);
}

/* ---------- Slide ---------- */

function SlidesView({ data }: { data: Artifact<'slides'>['data'] }) {
  const slides = data.slides ?? [];
  const [i, setI] = useState(0);
  const cur = slides[Math.min(i, slides.length - 1)];
  const stripRef = useRef<HTMLDivElement>(null);
  if (!cur) return <p className="rs-note">Bộ slide chưa có nội dung.</p>;
  const go = (n: number) => setI(Math.max(0, Math.min(slides.length - 1, n)));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') (e.preventDefault(), go(i + 1));
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') (e.preventDefault(), go(i - 1));
    else if (e.key === 'Home') (e.preventDefault(), go(0));
    else if (e.key === 'End') (e.preventDefault(), go(slides.length - 1));
  };
  return (
    <div className="rs-slides" onKeyDown={onKey}>
      <div className="rs-stage-wrap" tabIndex={0} role="group" aria-roledescription="bộ slide" aria-label={`${data.title}. Dùng phím mũi tên trái phải để đổi slide`}>
        <div className="rs-stage" aria-live="polite">
          <div className="rs-stage-head">
            <h3><MathText text={cur.title} /></h3>
          </div>
          <div className={`rs-stage-body${cur.visual ? ' has-visual' : ''}`}>
            <ul>
              {(cur.bullets ?? []).map((b, k) => (
                <li key={k}><MathText text={b} /></li>
              ))}
            </ul>
            {cur.visual && (
              <div className="rs-visual">
                <b>Gợi ý hình minh hoạ</b>
                <span>{cur.visual}</span>
              </div>
            )}
          </div>
          <div className="rs-stage-foot">
            <span>Trường Việt Anh</span>
            <span>
              {i + 1} / {slides.length}
            </span>
          </div>
        </div>
      </div>
      <div className="rs-slide-nav">
        <button type="button" className="ag-btn small" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Slide trước">
          Trước
        </button>
        <span className="rs-count">
          Slide {i + 1} / {slides.length}
        </span>
        <button type="button" className="ag-btn small" onClick={() => go(i + 1)} disabled={i === slides.length - 1} aria-label="Slide sau">
          Sau
        </button>
      </div>
      <div className="rs-notes">
        <b>Ghi chú cho giáo viên (không chiếu lên màn hình)</b>
        <p>{cur.notes ? <MathText text={cur.notes} /> : 'Slide này chưa có ghi chú.'}</p>
      </div>
      <div className="rs-strip" ref={stripRef} role="group" aria-label="Danh sách slide">
        {slides.map((s, k) => (
          <button key={k} type="button" className={`rs-thumb${k === i ? ' on' : ''}`} onClick={() => go(k)} aria-current={k === i ? 'true' : undefined} aria-label={`Slide ${k + 1}: ${s.title}`}>
            <span className="rs-thumb-n">{k + 1}</span>
            <span className="rs-thumb-t"><MathText text={s.title} /></span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Phiếu học tập ---------- */

function WorksheetView({ artifact, draft }: { artifact: Artifact; draft?: boolean }) {
  const d = artifact.data as Artifact<'worksheet'>['data'];
  const [tab, setTab] = useState<'hs' | 'gv'>('hs');
  const id = useId();
  const [err, setErr] = useState('');
  let n = 0;
  return (
    <div className="rs-ws">
      <div className="rs-tabs" role="tablist" ref={rovingRef} onKeyDown={rovingKeyDown} aria-label="Phiếu học sinh và đáp án">
        <button type="button" role="tab" id={`${id}-hs`} aria-selected={tab === 'hs'} aria-controls={`${id}-p`} className={tab === 'hs' ? 'on' : ''} onClick={() => setTab('hs')}>
          Phiếu học sinh
        </button>
        <button type="button" role="tab" id={`${id}-gv`} aria-selected={tab === 'gv'} aria-controls={`${id}-p`} className={tab === 'gv' ? 'on' : ''} onClick={() => setTab('gv')}>
          Đáp án (dành cho giáo viên)
        </button>
      </div>
      <div role="tabpanel" id={`${id}-p`} aria-labelledby={`${id}-${tab}`}>
        {tab === 'hs' ? (
          <article className="rs-paper">
            <p className="rs-paper-school">TRƯỜNG VIỆT ANH</p>
            <div className="rs-who" aria-hidden="true">
              <span>Họ và tên:</span>
              <span>Lớp:</span>
              <span>Ngày:</span>
            </div>
            <h3 className="rs-paper-title">{d.title}</h3>
            {(d.sections ?? []).map((s, si) => (
              <div key={si} className="rs-paper-sec">
                <h4><MathText text={s.heading} /></h4>
                {(s.items ?? []).map((it, ii) => {
                  n++;
                  return (
                    <div key={ii} className="rs-q">
                      <p>
                        <b>Câu {n}.</b> <MathText text={it.prompt} />
                        {it.level && <span className="rs-level"> ({LEVEL[it.level]})</span>}
                      </p>
                      {Array.from({ length: Math.max(0, Math.min(10, it.lines ?? 3)) }, (_, k) => (
                        <div key={k} className="rs-rule" aria-hidden="true" />
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </article>
        ) : (
          <article className="rs-paper rs-paper-key">
            <p className="rs-banner">Dành cho giáo viên — không phát cho học sinh</p>
            <h3 className="rs-paper-title">Đáp án: {d.title}</h3>
            {(d.answerKey ?? []).map((k, ki) => (
              <div key={ki} className="rs-key">
                <h4><MathText text={k.heading} /></h4>
                {paras(k.body).map((p, pi) => (
                  <p key={pi}><MathText text={p} /></p>
                ))}
              </div>
            ))}
            <button
              type="button"
              className="ag-btn small"
              onClick={() => printWorksheetAnswers(artifact, { draft: !!draft }).catch((e) => setErr(e instanceof Error ? e.message : 'Không in được.'))}
            >
              In trang đáp án riêng
            </button>
            {err && <p className="rs-msg bad" role="alert">{err}</p>}
          </article>
        )}
      </div>
    </div>
  );
}

/* ---------- Bài đọc ---------- */

function TextView({ data }: { data: Artifact<'text'>['data'] }) {
  return (
    <article className="rs-text">
      <h3><MathText text={data.title} /></h3>
      {(data.sections ?? []).map((s, i) => (
        <section key={i}>
          <h4><MathText text={s.heading} /></h4>
          {paras(s.body).map((p, k) => (
            <p key={k}><MathText text={p} /></p>
          ))}
        </section>
      ))}
    </article>
  );
}

/* ---------- Mindmap ---------- */

function TreeList({ node }: { node: MindmapNode }) {
  return (
    <li>
      {node.label}
      {node.children && node.children.length > 0 && (
        <ul>
          {node.children.map((c, i) => (
            <TreeList key={`${c.id}-${i}`} node={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

function MindmapView({ data }: { data: Artifact<'mindmap'>['data'] }) {
  const scene = useMemo(() => buildMindmapScene(data), [data]);
  return (
    <div className="rs-map">
      <div className="rs-svgscroll" tabIndex={0} aria-label="Sơ đồ tư duy, cuộn ngang nếu cần">
        <SceneSvg scene={scene} minWidth={scene.width} />
      </div>
      <details className="rs-tree">
        <summary>Xem dạng danh sách (dùng bàn phím hoặc trình đọc màn hình)</summary>
        <ul>
          <TreeList node={data.root} />
        </ul>
      </details>
    </div>
  );
}

/* ---------- Infographic ---------- */

function InfographicView({ data }: { data: Artifact<'infographic'>['data'] }) {
  const scene = useMemo(() => buildInfographicScene(data), [data]);
  return (
    <div className="rs-info">
      <SceneSvg scene={scene} />
      <details className="rs-tree">
        <summary>Xem nội dung dạng chữ</summary>
        <ul>
          {(data.keyPoints ?? []).map((k, i) => (
            <li key={i}>
              <b>{k.label}:</b> {k.text}
            </li>
          ))}
          {(data.steps ?? []).map((s, i) => (
            <li key={`s${i}`}>
              Bước {s.n}. {s.title} — {s.text}
            </li>
          ))}
          {(data.facts ?? []).map((f, i) => (
            <li key={`f${i}`}>
              <b>{f.value}</b> {f.caption}
            </li>
          ))}
          <li>
            <b>Cần nhớ:</b> {data.takeaway}
          </li>
        </ul>
      </details>
    </div>
  );
}

/* ---------- Podcast và tranh luận ---------- */

function ScriptView({ intro, speakers, stances, lines, conclusion }: { intro: string; speakers: string[]; stances?: Record<string, string>; lines: ScriptLine[]; conclusion?: string }) {
  const sp = useSpeech(lines, speakers);
  const names = speakers.length ? speakers : Array.from(new Set(lines.map((l) => l.speaker)));
  const colorOf = (who: string) => Math.max(0, names.indexOf(who)) % 2;
  const playing = sp.status === 'playing';
  const noVoice = sp.supported && !sp.hasVi;
  return (
    <div className="rs-script">
      <p className="rs-intro">{intro}</p>
      {stances && (
        <div className="rs-experts">
          {names.map((nm) => (
            <div key={nm} className={`rs-expert c${colorOf(nm)}`}>
              <b>{nm}</b>
              <span>{stances[nm]}</span>
            </div>
          ))}
        </div>
      )}
      <div className="rs-player" role="group" aria-label="Nghe kịch bản">
        {!playing ? (
          <button type="button" className="ag-btn small primary" disabled={!sp.supported || lines.length === 0} onClick={() => sp.play()}>
            {sp.status === 'paused' ? 'Phát tiếp' : 'Nghe thử'}
          </button>
        ) : (
          <button type="button" className="ag-btn small" onClick={sp.pause}>
            Tạm dừng
          </button>
        )}
        <button type="button" className="ag-btn small" disabled={!sp.supported || sp.status === 'idle'} onClick={sp.stop}>
          Dừng
        </button>
        <button type="button" className="ag-btn small" disabled={!sp.supported || lines.length === 0 || sp.index >= lines.length - 1 && sp.status !== 'idle'} onClick={() => (sp.status === 'idle' ? sp.play(0) : sp.next())}>
          Lượt tiếp
        </button>
        <span className="rs-count" aria-live="polite">
          {sp.index >= 0 ? `Lượt ${sp.index + 1} / ${lines.length}` : `${lines.length} lượt nói`}
        </span>
      </div>
      {!sp.supported && (
        <p className="rs-msg bad" role="alert">
          Trình duyệt này không hỗ trợ đọc to. Cô/thầy hãy mở bằng Chrome, Edge hoặc Safari bản mới để nghe thử; vẫn có thể đọc kịch bản bên dưới.
        </p>
      )}
      {noVoice && (
        <p className="rs-msg warn" role="status">
          Máy này chưa có giọng đọc tiếng Việt. Trình duyệt sẽ dùng giọng mặc định nên có thể đọc sai dấu. Cô/thầy có thể cài thêm giọng tiếng Việt trong phần Cài đặt ngôn ngữ của hệ điều hành.
        </p>
      )}
      <p className="rs-note">
        Đây là giọng đọc của trình duyệt để nghe thử kịch bản, chưa phải tệp âm thanh. Hệ thống chưa kết nối dịch vụ tạo giọng nói nên chưa xuất được tệp MP3.
      </p>
      <ol className="rs-lines">
        {lines.map((l, i) => (
          <li key={i} className={`rs-line c${colorOf(l.speaker)}${i === sp.index ? ' now' : ''}`} aria-current={i === sp.index ? 'true' : undefined}>
            <span className="rs-who-tag">{l.speaker}</span>
            <p><MathText text={l.text} /></p>
            <button type="button" className="rs-line-play" disabled={!sp.supported} onClick={() => sp.play(i)} aria-label={`Nghe từ lượt ${i + 1}, ${l.speaker}`}>
              Nghe
            </button>
          </li>
        ))}
      </ol>
      {conclusion && (
        <div className="rs-conclusion">
          <b>Kết luận</b>
          <p><MathText text={conclusion} /></p>
        </div>
      )}
    </div>
  );
}

/* ---------- Video ---------- */

function VideoView({ data }: { data: Artifact<'video'>['data'] }) {
  const scenes = data.scenes ?? [];
  const total = scenes.reduce((s, x) => s + (x.durationSec || 0), 0);
  const declared = Math.round((data.totalMin ?? 0) * 60);
  return (
    <div className="rs-video">
      <div className="rs-total">
        <b>Tổng thời lượng: {mmss(total)}</b>
        <span>{scenes.length} cảnh</span>
        {declared > 0 && Math.abs(declared - total) > 10 && (
          <span className="rs-msg warn">Dự kiến {data.totalMin} phút, các cảnh cộng lại là {mmss(total)}. Cô/thầy chỉnh lại cho khớp.</span>
        )}
      </div>
      <ol className="rs-timeline" aria-label="Dòng thời gian các cảnh">
        {scenes.map((s) => (
          <li key={s.n} style={{ flexGrow: Math.max(1, s.durationSec), flexBasis: 0 }}>
            <a href={`#rs-scene-${s.n}`} className={`rs-seg s${s.n % 4}`} aria-label={`Cảnh ${s.n}, ${mmss(s.durationSec)}`}>
              <span>{s.n}</span>
            </a>
            <small>{mmss(s.durationSec)}</small>
          </li>
        ))}
      </ol>
      <div className="rs-scenes">
        {scenes.map((s) => (
          <article key={s.n} id={`rs-scene-${s.n}`} className="rs-scene">
            <header>
              <span className={`rs-segno s${s.n % 4}`}>{s.n}</span>
              <b>Cảnh {s.n}</b>
              <span className="rs-dur">{mmss(s.durationSec)}</span>
            </header>
            <dl>
              <dt>Hình ảnh gợi ý</dt>
              <dd>{s.visual}</dd>
              <dt>Lời dẫn</dt>
              <dd><MathText text={s.narration} /></dd>
              {s.onScreenText && (
                <>
                  <dt>Chữ trên màn hình</dt>
                  <dd className="rs-ost">{s.onScreenText}</dd>
                </>
              )}
            </dl>
          </article>
        ))}
      </div>
      <p className="rs-note">Đây là kịch bản phân cảnh; hệ thống chưa dựng tệp video (chưa kết nối dịch vụ tạo video). Cô/thầy dùng kịch bản này để quay hoặc dựng bằng công cụ riêng.</p>
    </div>
  );
}
