import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/kho', () => ({
  getStandardLesson: vi.fn(async () => ({
    status: 'approved',
    atomId: 'VA-T10-HH-C01-B01',
    title: 'Bài 1: Mệnh đề',
    subject: 'toan',
    grade: '10',
    packages: [{ id: 'pkg1', content: 'Nội dung mệnh đề' }],
  })),
}));

vi.mock('@/lib/assessment', () => ({
  generateQuiz: vi.fn(async () => ({
    sections: [{ heading: 'Câu hỏi', body: 'Câu 1 (Biết): Mệnh đề nào đúng?\nĐáp án: A' }],
    markdown: '## Câu hỏi\nCâu 1 (Biết): Mệnh đề nào đúng?\nĐáp án: A',
    questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
  })),
  draftExam: vi.fn(),
}));

vi.mock('@/lib/workflows/reflection', () => ({
  reflect: vi.fn(async () => ({ scores: [], average: 4.5, issues: [], skipped: false })),
}));

vi.mock('@/lib/signals', () => ({
  recordGeneration: vi.fn(async () => undefined),
}));

import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  readSessionFromRequest,
  verifySessionToken,
} from '@/lib/server/auth';
import { requireReviewer } from '@/lib/server/roles';
import { POST as runWorkflowPost } from '@/app/api/workflows/run/route';

describe('Xác thực phiên Giáo viên & Người duyệt (HMAC-SHA256)', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.REVIEWER_KEY = 'secret-reviewer-2026';
    process.env.SESSION_SECRET = 'test-hmac-secret-key';
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('ký và xác thực token phiên giáo viên/người duyệt chính xác, chống giả mạo chữ ký', () => {
    const { token, session } = createSessionToken({
      name: 'Cô Nguyễn Thị Lan',
      email: 'lan.nt@truongvietanh.com',
      role: 'reviewer',
    });
    expect(session.role).toBe('reviewer');

    const verified = verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.name).toBe('Cô Nguyễn Thị Lan');
    expect(verified?.email).toBe('lan.nt@truongvietanh.com');
    expect(verified?.role).toBe('reviewer');

    // Sửa 1 ký tự trong chữ ký phải bị từ chối
    const tampered = `${token.slice(0, -2)}ab`;
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it('requireReviewer chấp nhận cả header x-reviewer-key lẫn cookie phiên va_session có role=reviewer', () => {
    const { token: reviewerToken } = createSessionToken({
      name: 'Thầy Minh (Tổ trưởng)',
      role: 'reviewer',
    });
    const { token: teacherToken } = createSessionToken({
      name: 'Cô Hà',
      role: 'teacher',
    });

    const reqWithCookie = new Request('http://localhost/api/kho/review', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(reviewerToken)}`,
      },
    });
    expect(readSessionFromRequest(reqWithCookie)?.role).toBe('reviewer');
    expect(requireReviewer(reqWithCookie)).toBeNull();

    // Cookie role=teacher không được phép duyệt
    const reqTeacher = new Request('http://localhost/api/kho/review', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(teacherToken)}`,
      },
    });
    expect(requireReviewer(reqTeacher)?.status).toBe(403);
  });

  it('POST /api/workflows/run hỗ trợ luồng SSE (text/event-stream) phát các sự kiện stage và done', async () => {
    const req = new Request('http://localhost/api/workflows/run', {
      method: 'POST',
      headers: {
        'Sec-Fetch-Site': 'same-origin',
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        params: {
          ngayDay: '2026-10-22',
          baiDayId: 'VA-T10-HH-C01-B01',
          formatDauRa: 'quiz',
          bloomThapNhat: 'nho',
          phongCach: 'truyen_thong',
          ngonNgu: 'vi',
        },
      }),
    });

    const res = await runWorkflowPost(req);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const raw = await res.text();
    const events = raw
      .split('\n\n')
      .map((b) => b.trim())
      .filter((b) => b.startsWith('data:'))
      .map((b) => JSON.parse(b.slice(5).trim()));

    expect(events.some((e) => e.type === 'stage' && e.stage === 'kho')).toBe(true);
    expect(events.some((e) => e.type === 'stage' && e.stage === 'generate')).toBe(true);
    const doneEvt = events.find((e) => e.type === 'done');
    expect(doneEvt).toBeDefined();
    expect(doneEvt.ok).toBe(true);
    expect(doneEvt.result.workflow).toBe('quiz');
  });
});
