import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initialSlots } from '@/lib/agent/flow';
import { parseIntent } from '@/lib/agent/intent';
import { searchLessons, nextLessonAfter, firstLesson, lessonOrdinal } from '@/lib/agent/lessonSearch';
import {
  AI_AUTH_CHAT_MESSAGE,
  callAssistant,
  callRefine,
  failureMessage,
  isQuotaFailure,
  untilQuotaReset,
} from '@/lib/agent/chatApi';
import { buildPartialResult, canKeepPartial, workflowForFormat } from '@/lib/agent/partial';
import { looksLikeJson, parseSseChunk } from '@/lib/agent/sse';
import { applyLast, clearPending, loadLastChoice, loadPending, sanitizeLast, saveLastChoice, savePending } from '@/lib/agent/memory';
import { loadHistory, saveHistoryItem, updateHistoryText } from '@/lib/agent/history';
import { buildAssistantUserPrompt } from '@/lib/agent/assistantPrompt';
import { dailyTip, todayLabel } from '@/lib/agent/prefs';
import { toParams } from '@/lib/agent/flow';
import type { AgentResult } from '@/lib/agent/result';

/* ---------- Tìm bài chéo khối ---------- */

const ITEMS = [
  { atomId: 'KC-8', code: 'TO08-C09-C01', title: 'Định lí Pythagore', subject: 'toan', subjectName: 'Toán', grade: 8, chapterLabel: 'Chương 9', chapterNo: 9, hasPackage: false },
  { atomId: 'KC-7', code: 'TO07-C04-D03', title: 'Định lí Pythagore (giới thiệu, áp dụng)', subject: 'toan', subjectName: 'Toán', grade: 7, chapterLabel: 'Chương 4 · Tam giác bằng nhau', chapterNo: 4, hasPackage: true },
  { atomId: 'KC-10', code: 'TO10-C03-B04', title: 'Định lí sin và côsin', subject: 'toan', subjectName: 'Toán', grade: 10, chapterLabel: 'Chương 3', chapterNo: 3, hasPackage: true },
];

function fakeFetch(items: unknown[], calls: string[] = []) {
  return async (url: string) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({ ok: true, items }) };
  };
}

describe('tìm bài chéo khối và môn', () => {
  it('gõ tên bài ở khối khác thì gợi ý chuyển khối thay vì trả bài của khối đang chọn', async () => {
    const calls: string[] = [];
    const intent = parseIntent('soạn kế hoạch bài dạy định lí Pythagore');
    const r = await searchLessons(intent, { subject: 'toan', grade: '10' }, { fetcher: fakeFetch(ITEMS, calls) });
    expect(r.kind).toBe('cross');
    if (r.kind === 'cross') {
      expect(r.lessons.map((l) => l.grade)).toEqual(expect.arrayContaining(['7', '8']));
      expect(r.lessons.find((l) => l.grade === '10')).toBeUndefined();
    }
    expect(calls[0]).toContain('/api/kho/library?');
    expect(calls[0]).toContain('subject=all');
    expect(calls[0]).toContain('grade=all');
    expect(calls[0]).toContain('preferGrade=10');
  });

  it('nói rõ lớp 7A2 thì tìm đúng trong Toán lớp 7 và chọn luôn', async () => {
    const intent = parseIntent('soạn kế hoạch bài dạy định lí Pythagore lớp 7A2, 2 tiết');
    const r = await searchLessons(intent, { subject: 'toan', grade: '10' }, { fetcher: fakeFetch(ITEMS) });
    expect(r.kind).toBe('sure');
    if (r.kind === 'sure') expect(r.lesson.id).toBe('KC-7');
  });

  it('không có bài nào khớp thì báo không thấy; lỗi mạng trả lời thân thiện', async () => {
    const none = await searchLessons(parseIntent('soạn bài hoàn toàn không tồn tại xyzabc'), { subject: 'toan', grade: '10' }, { fetcher: fakeFetch([]) });
    expect(none.kind).toBe('none');
    const err = await searchLessons(
      parseIntent('soạn bài hàm số'),
      { subject: 'toan', grade: '10' },
      { fetcher: async () => { throw new Error('offline'); } },
    );
    expect(err.kind).toBe('error');
    if (err.kind === 'error') expect(err.message).toMatch(/[Cc]ô\/thầy/);
  });

  it('bài N chương M tra theo số chương và thứ tự bài trong khối đang chọn', async () => {
    const list = [
      { atomId: 'a', code: 'TO07-C02-A01', title: 'Bài một', subject: 'toan', subjectName: 'Toán', grade: 7, chapterNo: 2 },
      { atomId: 'b', code: 'TO07-C02-A04', title: 'Bài bốn', subject: 'toan', subjectName: 'Toán', grade: 7, chapterNo: 2 },
      { atomId: 'c', code: 'TO07-C03-A04', title: 'Chương khác', subject: 'toan', subjectName: 'Toán', grade: 7, chapterNo: 3 },
    ];
    const r = await searchLessons(parseIntent('soạn giáo án bài 4 chương 2 môn toán lớp 7'), { subject: 'toan', grade: '10' }, { fetcher: fakeFetch(list) });
    expect(r.kind).toBe('sure');
    if (r.kind === 'sure') expect(r.lesson.id).toBe('b');
  });

  it('bài kế tiếp theo thứ tự mã bài', () => {
    const list = [
      { id: '3', code: 'TO07-C02-A01' },
      { id: '1', code: 'TO07-C01-A01' },
      { id: '2', code: 'TO07-C01-A02' },
    ];
    expect(nextLessonAfter(list, '1')?.id).toBe('2');
    expect(nextLessonAfter(list, '2')?.id).toBe('3');
    expect(nextLessonAfter(list, '3')).toBeNull();
    expect(nextLessonAfter(list, 'x')).toBeNull();
    expect(firstLesson(list)?.id).toBe('1');
    expect(lessonOrdinal('TO07-C04-D03')).toBe(3);
  });
});

/* ---------- Lỗi và lời thân thiện ---------- */

describe('lời báo lỗi của ô chat', () => {
  it('ai_auth nói rõ AI chưa đăng nhập và bản nháp được giữ', () => {
    const m = failureMessage({ status: 502, code: 'ai_auth' });
    expect(m).toBe(AI_AUTH_CHAT_MESSAGE);
    expect(m).toMatch(/AI đang tạm không đăng nhập/);
    expect(m).toMatch(/bản nháp của cô\/thầy vẫn được giữ/i);
  });

  it('hết lượt ngày nói còn lượt khi nào', () => {
    const now = new Date('2026-10-23T05:30:00Z'); // 12:30 giờ Việt Nam
    const f = { status: 429, quota: { used: 40, limit: 40 }, error: 'Cô/thầy đã dùng hết 40 lượt' };
    expect(isQuotaFailure(f)).toBe(true);
    const m = failureMessage(f, now);
    expect(m).toMatch(/40\/40/);
    expect(m).toMatch(/11 giờ 30 phút nữa/);
    expect(m).toMatch(/0 giờ ngày mai/);
  });

  it('429 gửi quá nhanh thì khuyên đợi một phút, không nhầm là hết lượt', () => {
    const m = failureMessage({ status: 429 });
    expect(m).toMatch(/một phút/);
    expect(m).not.toMatch(/hết lượt/);
  });

  it('tính đúng thời gian đến 0 giờ ngày mai theo giờ Việt Nam', () => {
    expect(untilQuotaReset(new Date('2026-10-23T16:59:00Z')).text).toMatch(/1 phút nữa/); // 23:59 VN
    expect(untilQuotaReset(new Date('2026-10-22T17:00:00Z')).hours).toBe(24); // đúng 0:00 VN
  });

  it('lỗi mạng khi hỏi đáp và chỉnh: lời thân thiện, giữ bản nháp', async () => {
    const boom = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const a = await callAssistant('Bloom là gì?', {}, undefined, boom);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.message).toMatch(/Bản nháp của cô\/thầy vẫn được giữ/);
    const r = await callRefine({ instruction: 'rút gọn', text: 'abc' }, undefined, boom);
    expect(r.ok).toBe(false);
  });

  it('đọc đúng mã lỗi từ phản hồi 502 ai_auth của máy chủ', async () => {
    const f = (async () =>
      new Response(JSON.stringify({ ok: false, code: 'ai_auth', error: 'x' }), { status: 502 })) as unknown as typeof fetch;
    const r = await callRefine({ instruction: 'rút gọn', text: 'abc' }, undefined, f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(AI_AUTH_CHAT_MESSAGE);
  });

  it('chỉnh thành công trả về văn bản mới', async () => {
    const f = (async () => new Response(JSON.stringify({ ok: true, text: 'mới', modelUsed: 'm' }), { status: 200 })) as unknown as typeof fetch;
    const r = await callRefine({ instruction: 'rút gọn', text: 'abc' }, undefined, f);
    expect(r).toEqual({ ok: true, data: { text: 'mới', modelUsed: 'm' } });
  });
});

/* ---------- Luồng SSE ---------- */

describe('đọc luồng sự kiện', () => {
  it('cắt đúng các sự kiện đầy đủ và giữ phần dở dang', () => {
    const buf = 'data: {"type":"stage","stage":"kho"}\n\ndata: {"type":"delta","delta":"Xin"}\n\ndata: {"type":"de';
    const { events, rest } = parseSseChunk(buf);
    expect(events.map((e) => e.type)).toEqual(['stage', 'delta']);
    expect(rest).toBe('data: {"type":"de');
    const more = parseSseChunk(`${rest}lta","delta":" chào"}\n\n`);
    expect(more.events[0].delta).toBe(' chào');
  });

  it('bỏ qua dòng hỏng', () => {
    const { events } = parseSseChunk('data: {hỏng\n\n: ping\n\ndata: {"type":"done"}\n\n');
    expect(events).toHaveLength(1);
  });

  it('nhận ra văn bản JSON để không đưa lên khung bản soạn', () => {
    expect(looksLikeJson('  {"slides":[')).toBe(true);
    expect(looksLikeJson('I. Mục tiêu')).toBe(false);
  });
});

/* ---------- Bản soạn dở ---------- */

describe('giữ phần soạn dở', () => {
  it('chỉ giữ khi đủ dài và dựng được kết quả mở lại', () => {
    expect(canKeepPartial('ngắn')).toBe(false);
    const text = 'I. Mục tiêu\n' + 'Học sinh hiểu định lí. '.repeat(30);
    expect(canKeepPartial(text)).toBe(true);
    const r = buildPartialResult({ ...initialSlots(), format: 'ke_hoach', baiDayId: 'x', baiTitle: 'Bài X' }, text, 'p1');
    expect(r.draft).toBe(true);
    expect(r.workflow).toBe('khbd');
    expect(r.content.markdown).toContain('Mục tiêu');
    expect(workflowForFormat('quiz')).toBe('quiz');
    expect(workflowForFormat('bo_tiet_day')).toBe('bo_tiet_day');
  });
});

/* ---------- Bộ nhớ trong trình duyệt ---------- */

function installStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  const events: string[] = [];
  vi.stubGlobal('window', {
    localStorage: ls,
    dispatchEvent: (e: { type: string }) => {
      events.push(e.type);
      return true;
    },
  });
  vi.stubGlobal('CustomEvent', class {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  });
  return { store, events };
}

describe('nhớ lựa chọn và lần soạn dở', () => {
  beforeEach(() => {
    installStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lưu và đọc lại môn, khối, lớp, phong cách, dạng sản phẩm, mức tư duy; bỏ giá trị lạ', () => {
    saveLastChoice({ subject: 'vat_ly', grade: '11', classId: 'class-11a1-aht', phongCach: 'hop_tac', format: 'bo_tiet_day', bloom: 'hieu' });
    const last = loadLastChoice();
    expect(last).toMatchObject({ subject: 'vat_ly', grade: '11', phongCach: 'hop_tac', format: 'bo_tiet_day', bloom: 'hieu' });
    expect(sanitizeLast({ subject: 'xyz', grade: '99', phongCach: 'la', format: 'khac' })).toEqual({});
  });

  it('áp lựa chọn lần trước nhưng không đè lựa chọn đã có', () => {
    const base = { ...initialSlots(), phongCach: 'kham_pha' as const };
    const out = applyLast(base, { subject: 'hoa_hoc', grade: '12', phongCach: 'hop_tac', bloom: 'nho' });
    expect(out.subject).toBe('hoa_hoc');
    expect(out.grade).toBe('12');
    expect(out.phongCach).toBe('kham_pha');
    expect(out.bloom).toBe('nho');
    const kept = applyLast(base, { subject: 'hoa_hoc', grade: '12' }, { keepSubjectGrade: true });
    expect(kept.subject).toBe(base.subject);
  });

  it('lần soạn đang chạy được nhớ, quá 30 phút thì bỏ', () => {
    const slots = { ...initialSlots(), format: 'ke_hoach' as const, baiDayId: 'b', baiTitle: 'B' };
    savePending({ id: 'r1', startedAt: 1_000_000, slots });
    expect(loadPending(1_000_000 + 60_000)?.slots.baiTitle).toBe('B');
    expect(loadPending(1_000_000 + 31 * 60_000)).toBeNull();
    savePending({ id: 'r2', startedAt: 5, slots });
    clearPending();
    expect(loadPending(10)).toBeNull();
  });

  it('chỉnh tay hay chỉnh bằng lời đều được ghi vào bản trong trình duyệt', () => {
    const result = { runId: 'r', workflow: 'khbd', content: { sections: [], markdown: 'a' } } as unknown as AgentResult;
    saveHistoryItem({ id: 'r', title: 'T', at: new Date().toISOString(), slots: initialSlots(), result, text: 'a', draft: true });
    updateHistoryText('r', 'đã chỉnh');
    const item = loadHistory().find((h) => h.id === 'r');
    expect(item?.text).toBe('đã chỉnh');
    expect(item?.draft).toBe(true);
  });
});

/* ---------- Lời nhắc hỏi đáp và màn Hôm nay ---------- */

describe('hỏi đáp có ngữ cảnh và màn Hôm nay', () => {
  it('lời nhắc mang theo lớp, bài, bản soạn và các lượt trước', () => {
    const p = buildAssistantUserPrompt({
      question: 'Còn cách nào khác?',
      className: '7A2',
      campus: 'Cơ sở AHT',
      studentCount: 30,
      lessonTitle: 'Định lí Pythagore',
      subject: 'Toán',
      grade: '7',
      currentText: 'I. Mục tiêu',
      history: [
        { role: 'teacher', text: 'Gợi ý khởi động' },
        { role: 'assistant', text: 'Cho học sinh đo cạnh tam giác' },
      ],
    });
    expect(p).toContain('Lớp: 7A2');
    expect(p).toContain('Định lí Pythagore');
    expect(p).toContain('<ban_soan>');
    expect(p).toContain('Cô/thầy: Gợi ý khởi động');
    expect(p).toContain('Mình: Cho học sinh đo cạnh');
    expect(p.trim().endsWith('Câu hỏi: Còn cách nào khác?')).toBe(true);
  });

  it('ngày hiển thị dạng 23/10/2026 theo giờ Việt Nam và mẹo đổi theo ngày', () => {
    expect(todayLabel(new Date('2026-10-23T05:00:00Z'))).toBe('Thứ Sáu, 23/10/2026');
    expect(todayLabel(new Date('2026-10-22T18:00:00Z'))).toBe('Thứ Sáu, 23/10/2026'); // 01:00 VN
    expect(dailyTip(new Date('2026-10-23T05:00:00Z'))).not.toBe(dailyTip(new Date('2026-10-24T05:00:00Z')));
  });

  it('Bộ tiết dạy là sản phẩm hợp lệ gửi lên máy chủ', () => {
    const s = { ...initialSlots(), format: 'bo_tiet_day' as const, baiDayId: 'KC-1', bloom: 'hieu' as const, phongCach: 'truyen_thong' as const };
    const out = toParams(s);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.params.formatDauRa).toBe('bo_tiet_day');
  });

  it('số tiết và ghi chú đi kèm tham số gửi máy chủ', () => {
    const s = { ...initialSlots(), format: 'ke_hoach' as const, baiDayId: 'KC-1', bloom: 'hieu' as const, phongCach: 'hop_tac' as const, soTiet: 2 };
    const out = toParams(s);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.params.soTiet).toBe(2);
  });
});
