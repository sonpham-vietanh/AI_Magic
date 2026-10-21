import { randomUUID } from 'node:crypto';
import { loadBank } from './bank';
import { allocatePoints } from './examDoc';
import { DEDUP_YEARS, dedupCutoff, usedRecently, ymdVN } from './locks';
import { normalizeActorName, sameActor } from '@/lib/server/roles';
import { languageNote, renderQuestion, seededShuffle, type Language } from './quiz';
import { mutateOrg, now, readOrg } from './store';
import { TT22_LABEL, TT22_LEVELS, bloomToTt22, normalizeBloom, type Tt22Level } from './tt22';
import type {
  BankItem,
  ExamItemSnapshot,
  ExamMatrix,
  ExamRecord,
  MatrixCell,
  OrgData,
} from './types';

export { DEDUP_YEARS, dedupCutoff, usedRecently, lockedQuestionIds } from './locks';
export const TOTAL_POINTS = 10;
const PER_CELL_DEFAULT = 2;

export class AssessmentError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

export function isValidExamDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Ngày hiện tại theo giờ Việt Nam (UTC+7), dạng YYYY-MM-DD. */
export function todayVN(): string {
  return ymdVN(now());
}

const zeroCell = (): MatrixCell => ({ target: 0, selected: 0, points: 0 });
const zeroCells = (): Record<Tt22Level, MatrixCell> => ({
  nhan_biet: zeroCell(),
  thong_hieu: zeroCell(),
  van_dung: zeroCell(),
  van_dung_cao: zeroCell(),
});
const round2 = (n: number) => Math.round(n * 100) / 100;

function snapshot(q: BankItem): ExamItemSnapshot {
  return {
    questionId: q.id,
    atomId: q.atomId,
    atomCode: q.atomCode,
    bloom: q.bloom,
    tt22Level: q.tt22Level,
    noiDung: q.noiDung,
    dapAn: q.dapAn,
    loiGiai: q.loiGiai,
    options: q.options,
  };
}

export function renderMatrixMarkdown(m: ExamMatrix): string {
  const head = `| Chủ đề / Nguyên tử | ${TT22_LEVELS.map((l) => TT22_LABEL[l]).join(' | ')} | Tổng câu | Điểm |`;
  const sep = `|---|${TT22_LEVELS.map(() => '---').join('|')}|---|---|`;
  const cell = (c: MatrixCell) => (c.target || c.selected ? `${c.selected}/${c.target} (${c.points}đ)` : '0');
  const rows = m.rows.map(
    (r) =>
      `| ${r.atomCode} — ${r.title} | ${TT22_LEVELS.map((l) => cell(r.cells[l])).join(' | ')} | ${r.totalSelected} | ${r.points} |`,
  );
  const tot = `| **Tổng** | ${TT22_LEVELS.map((l) => cell(m.totals[l])).join(' | ')} | ${m.totalSelected}/${m.totalTarget} | ${round2(m.totalSelected ? m.totalPoints : 0)} |`;
  return [head, sep, ...rows, tot].join('\n');
}

export function renderExamContent(rec: ExamRecord): { sections: { heading: string; body: string }[]; markdown: string } {
  const sections: { heading: string; body: string }[] = [
    {
      heading: 'Ma trận đề kiểm tra (TT 22/2021)',
      body: renderMatrixMarkdown(rec.matrix),
    },
  ];
  if (rec.matrix.shortfall.length) {
    sections.push({
      heading: 'Thiếu câu hỏi (shortfall)',
      body:
        rec.matrix.shortfall.map((s) => `- ${s}`).join('\n') +
        '\nHệ thống không tự bịa câu hỏi; cần bổ sung ngân hàng hoặc giảm yêu cầu ma trận.',
    });
  }
  const ln = languageNote(rec.language);
  sections.push({
    heading: 'Đề bài',
    body:
      (ln ? `Lưu ý: ${ln}\n\n` : '') +
      (rec.items.map((q, i) => renderQuestion(i + 1, q.noiDung, q.options)).join('\n\n') || '(Chưa có câu hỏi.)'),
  });
  const pts = allocatePoints(rec.items.length);
  sections.push({
    heading: 'Đáp án & hướng dẫn chấm',
    body:
      rec.items
        .map(
          (q, i) =>
            `Câu ${i + 1} [${TT22_LABEL[q.tt22Level]} · ${pts[i]}đ]: ${q.dapAn || '(chưa có đáp án)'}${q.loiGiai ? `\n   Giải thích: ${q.loiGiai}` : ''}`,
        )
        .join('\n\n') || '(Không có.)',
  });
  const markdown =
    `# Đề kiểm tra định kỳ ${rec.examId}\n> Trạng thái: ${rec.status} · Ngày thi: ${rec.examDate ?? 'chưa đặt'} · Bảo mật trước ngày thi.\n\n` +
    sections.map((s) => `## ${s.heading}\n${s.body}`).join('\n\n');
  return { sections, markdown };
}

export async function draftExam(p: {
  orgId: string;
  atomIds: string[];
  bloomLevels: string[];
  language: Language;
  examDate?: string;
  createdBy: string;
  /** Số câu mục tiêu cho mỗi ô (nguyên tử × mức TT22); mặc định 2. */
  perCell?: number;
}): Promise<{
  examId: string;
  status: string;
  matrix: ExamMatrix;
  sections: { heading: string; body: string }[];
  markdown: string;
}> {
  if (p.examDate !== undefined && !isValidExamDate(p.examDate)) {
    throw new AssessmentError('Ngày thi không hợp lệ (định dạng YYYY-MM-DD).');
  }
  const atomIds = [...new Set(p.atomIds)];
  if (!atomIds.length) throw new AssessmentError('Cần chọn ít nhất một nguyên tử kiến thức.');
  const levelSet = new Set<Tt22Level>();
  for (const b of p.bloomLevels) {
    const t = bloomToTt22(normalizeBloom(b) ?? '');
    if (t) levelSet.add(t);
  }
  if (!levelSet.size) TT22_LEVELS.slice(0, 3).forEach((l) => levelSet.add(l));
  const perCell = Math.max(1, Math.min(10, Math.floor(p.perCell ?? PER_CELL_DEFAULT)));
  const at = now();
  const org = await readOrg(p.orgId);
  const blocked = usedRecently(org, at);

  const chosen = new Set<string>();
  const items: ExamItemSnapshot[] = [];
  const shortfall: string[] = [];
  const rows: ExamMatrix['rows'] = [];
  const totals = zeroCells();
  const owners: { row: number; lvl: Tt22Level }[] = [];

  for (const atomId of atomIds) {
    const bank = await loadBank(p.orgId, atomId);
    const cells = zeroCells();
    if (!bank.found) {
      shortfall.push(`Không tìm thấy nguyên tử "${atomId}" trong kho tri thức.`);
    }
    for (const lvl of TT22_LEVELS) {
      if (!levelSet.has(lvl)) continue;
      cells[lvl].target = perCell;
      const eligible = bank.items.filter(
        (q) => q.tt22Level === lvl && !blocked.has(q.id) && !chosen.has(q.id),
      );
      // Ưu tiên câu chưa dùng, rồi câu dùng lâu nhất; trong cùng nhóm thì xáo theo hạt giống.
      const ordered = seededShuffle(eligible, `${p.orgId}|${atomId}|${lvl}|${at.toISOString()}`).sort((a, b) =>
        (a.lastUsedAt ?? '').localeCompare(b.lastUsedAt ?? ''),
      );
      for (const q of ordered.slice(0, perCell)) {
        chosen.add(q.id);
        items.push(snapshot(q));
        owners.push({ row: rows.length, lvl });
        cells[lvl].selected += 1;
      }
      if (cells[lvl].selected < perCell) {
        shortfall.push(
          `${bank.atomCode} · ${TT22_LABEL[lvl]}: thiếu ${perCell - cells[lvl].selected}/${perCell} câu (chỉ còn ${cells[lvl].selected} câu chưa dùng trong ${DEDUP_YEARS} năm).`,
        );
      }
      totals[lvl].target += cells[lvl].target;
      totals[lvl].selected += cells[lvl].selected;
    }
    rows.push({
      atomId,
      atomCode: bank.atomCode,
      title: bank.atomTitle,
      cells,
      totalSelected: TT22_LEVELS.reduce((s, l) => s + cells[l].selected, 0),
      points: 0,
    });
  }

  const totalSelected = items.length;
  const totalTarget = TT22_LEVELS.reduce((s, l) => s + totals[l].target, 0);
  // Một hàm duy nhất chia điểm (allocatePoints, bước 0,01, tổng luôn đúng 10) dùng cho cả máy chủ lẫn examDoc.
  const pts = allocatePoints(totalSelected, TOTAL_POINTS);
  const ppq = pts.length ? pts[0] : 0;
  owners.forEach((o, i) => {
    const r = rows[o.row];
    r.cells[o.lvl].points = round2(r.cells[o.lvl].points + pts[i]);
    r.points = round2(r.points + pts[i]);
    totals[o.lvl].points = round2(totals[o.lvl].points + pts[i]);
  });
  if (totalSelected === 0) shortfall.push('Không chọn được câu nào: đề rỗng.');

  const matrix: ExamMatrix = {
    standard: 'TT 22/2021/TT-BGDĐT',
    totalPoints: TOTAL_POINTS,
    pointsPerQuestion: ppq,
    rows,
    totals,
    totalTarget,
    totalSelected,
    shortfall,
  };

  const ymd = new Date(at.getTime() + 7 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '');
  const rec: ExamRecord = {
    examId: `DT-${ymd}-${randomUUID().slice(0, 6).toUpperCase()}`,
    orgId: p.orgId,
    createdBy: p.createdBy,
    createdAt: at.toISOString(),
    examDate: p.examDate ?? null,
    status: 'nhap',
    language: p.language,
    questionIds: items.map((i) => i.questionId),
    items,
    matrix,
    assignedReviewers: [],
    approvals: [],
    accessLog: [{ at: at.toISOString(), actor: p.createdBy, action: 'tao_de' }],
  };
  await mutateOrg(p.orgId, (o) => {
    o.exams.unshift(rec);
  });
  const content = renderExamContent(rec);
  return { examId: rec.examId, status: rec.status, matrix, ...content };
}

function findExam(org: OrgData, examId: string): ExamRecord {
  const e = org.exams.find((x) => x.examId === examId);
  if (!e) throw new AssessmentError('Không tìm thấy đề kiểm tra.', 404);
  return e;
}

export async function submitExam(p: {
  orgId: string;
  examId: string;
  actor: string;
  reviewers?: string[];
}): Promise<{ examId: string; status: string }> {
  return mutateOrg(p.orgId, (org) => {
    const e = findExam(org, p.examId);
    if (!sameActor(e.createdBy, p.actor)) throw new AssessmentError('Chỉ người soạn đề mới được gửi duyệt.', 403);
    if (e.status !== 'nhap' && e.status !== 'tu_choi') {
      throw new AssessmentError('Chỉ đề ở trạng thái nháp hoặc bị từ chối mới được gửi duyệt.', 409);
    }
    if (!e.questionIds.length) throw new AssessmentError('Đề rỗng, không thể gửi duyệt.', 409);
    e.status = 'cho_duyet';
    if (p.reviewers?.length) {
      const seen = new Set<string>();
      e.assignedReviewers = p.reviewers.map((r) => r.trim()).filter((r) => {
        const k = normalizeActorName(r);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    pushLog(e, { at: now().toISOString(), actor: p.actor, action: 'gui_duyet' });
    return { examId: e.examId, status: e.status };
  });
}

export async function reviewExam(p: {
  orgId: string;
  examId: string;
  reviewer: string;
  decision: 'duyet' | 'tu_choi';
  note: string;
}): Promise<{ examId: string; status: string }> {
  return mutateOrg(p.orgId, (org) => {
    const e = findExam(org, p.examId);
    if (e.status !== 'cho_duyet') {
      throw new AssessmentError('Đề chưa ở trạng thái chờ duyệt nên không thể duyệt/từ chối.', 409);
    }
    if (sameActor(p.reviewer, e.createdBy)) {
      throw new AssessmentError('Người soạn đề không được tự duyệt đề của mình.', 403);
    }
    if (e.assignedReviewers.length && !e.assignedReviewers.some((r) => sameActor(r, p.reviewer))) {
      throw new AssessmentError('Bạn không thuộc danh sách tổ chuyên môn được giao duyệt đề này.', 403);
    }
    if (p.decision === 'tu_choi' && !p.note.trim()) {
      throw new AssessmentError('Từ chối đề cần ghi rõ lý do.', 400);
    }
    if (p.decision === 'duyet') {
      // Hai bản nháp có thể chọn trùng câu: kiểm lại với các đề ĐÃ DUYỆT khác trước khi cho qua.
      const cutoff = dedupCutoff(now());
      const clash = new Set<string>();
      for (const u of org.usage) {
        if (u.examId !== e.examId && u.usedAt > cutoff && e.questionIds.includes(u.questionId)) clash.add(u.questionId);
      }
      for (const o of org.exams) {
        if (o.examId !== e.examId && o.status === 'da_duyet') {
          for (const id of o.questionIds) if (e.questionIds.includes(id)) clash.add(id);
        }
      }
      if (clash.size) {
        throw new AssessmentError(
          `Đề này có ${clash.size} câu trùng với đề đã duyệt khác trong ${DEDUP_YEARS} năm. Người soạn cần soạn lại đề trước khi được duyệt.`,
          409,
        );
      }
    }
    const at = now().toISOString();
    e.approvals.push({ reviewer: p.reviewer, decision: p.decision, note: p.note, at });
    e.status = p.decision === 'duyet' ? 'da_duyet' : 'tu_choi';
    pushLog(e, { at, actor: p.reviewer, action: p.decision === 'duyet' ? 'duyet_de' : 'tu_choi_de' });
    if (e.status === 'da_duyet') {
      // Chỉ khi đề được duyệt, câu hỏi mới được tính là "đã dùng".
      for (const qid of e.questionIds) org.usage.push({ questionId: qid, usedAt: at, examId: e.examId });
    }
    return { examId: e.examId, status: e.status };
  });
}

function envReviewers(): string[] {
  return (process.env.ASSESSMENT_REVIEWERS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

const MAX_ACCESS_LOG = 200;
const LOG_DEDUP_MS = 10 * 60_000;

/** Thêm nhật ký có giới hạn: giữ mục đầu (tạo đề) và MAX_ACCESS_LOG - 1 mục mới nhất. */
function pushLog(e: ExamRecord, entry: { at: string; actor: string; action: string }): void {
  e.accessLog.push(entry);
  if (e.accessLog.length > MAX_ACCESS_LOG) e.accessLog.splice(1, e.accessLog.length - MAX_ACCESS_LOG);
}

/**
 * Quy tắc xem nội dung đề. LƯU Ý: `actor` chỉ là tên khai báo (header x-actor),
 * chưa phải xác thực thật - đăng nhập theo người dùng là việc làm tiếp theo.
 */
export function canViewContent(e: ExamRecord, actor: string): boolean {
  if (e.examDate && todayVN() >= e.examDate) return true;
  if (!actor) return false;
  if (sameActor(actor, e.createdBy)) return true;
  return (
    e.assignedReviewers.some((r) => sameActor(r, actor)) ||
    e.approvals.some((a) => sameActor(a.reviewer, actor)) ||
    envReviewers().some((r) => sameActor(r, actor))
  );
}

/** Metadata công khai. Tên người soạn và người duyệt chỉ hiện cho người có quyền (reviewer hoặc đã qua cổng xem đề). */
export function examMetadata(e: ExamRecord, opts: { showPeople?: boolean } = {}) {
  const show = !!opts.showPeople;
  return {
    examId: e.examId,
    ...(show ? { createdBy: e.createdBy } : {}),
    createdAt: e.createdAt,
    examDate: e.examDate,
    status: e.status,
    language: e.language,
    questionCount: e.questionIds.length,
    matrix: e.matrix,
    approvals: show ? e.approvals : e.approvals.map((a) => ({ decision: a.decision, at: a.at, note: '' })),
  };
}

export async function getExam(p: { orgId: string; examId: string; actor: string }) {
  // GET không được ghi lại file mỗi lần: đọc trước, chỉ ghi nhật ký khi chưa có mục tương tự trong 10 phút gần nhất.
  const org = await readOrg(p.orgId);
  const e = findExam(org, p.examId);
  const allowed = canViewContent(e, p.actor);
  const entry = {
    at: now().toISOString(),
    actor: p.actor || 'ẩn danh',
    action: allowed ? 'xem_noi_dung' : 'bi_chan_xem_noi_dung',
  };
  const t = now().getTime();
  const recent = e.accessLog.some(
    (l) => l.action === entry.action && sameActor(l.actor, entry.actor) && t - Date.parse(l.at) < LOG_DEDUP_MS,
  );
  if (!recent) {
    pushLog(e, entry);
    await mutateOrg(p.orgId, (o) => {
      const real = o.exams.find((x) => x.examId === p.examId);
      if (real) pushLog(real, entry);
    });
  }
  const canSeeLog = !!p.actor && (sameActor(p.actor, e.createdBy) || allowed);
  return {
    ...examMetadata(e, { showPeople: allowed }),
    locked: !allowed,
    lockedReason: allowed
      ? null
      : 'Nội dung đề được bảo mật đến ngày thi; chỉ người soạn và tổ chuyên môn duyệt đề được xem.',
    ...(allowed ? { ...renderExamContent(e), items: e.items } : {}),
    accessLog: canSeeLog ? e.accessLog : undefined,
  };
}

export async function listExams(orgId: string, opts: { showPeople?: boolean } = {}) {
  const org = await readOrg(orgId);
  return org.exams.map((e) => examMetadata(e, opts));
}
