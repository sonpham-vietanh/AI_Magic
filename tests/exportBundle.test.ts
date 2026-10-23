import { describe, expect, it } from 'vitest';
import {
  buildBundle,
  countRecords,
  isSensitiveKey,
  redactSensitive,
  stableStringify,
  verifyBundle,
} from '@/lib/ops/exportBundle';

const KNOWN = ['eval', 'user-roles', 'teacher-sessions'];

describe('redactSensitive', () => {
  it('bỏ token, mã, khóa nhưng giữ email', () => {
    const { value, removed } = redactSensitive({
      users: [{ email: 'a@truongvietanh.com', role: 'admin', sessionToken: 'x', apiKey: 'y', code: '123', nested: { password: 'p', ok: 1 } }],
      reviewerKey: 'k',
    });
    expect(removed).toBe(5);
    expect(value).toEqual({ users: [{ email: 'a@truongvietanh.com', role: 'admin', nested: { ok: 1 } }] });
  });

  it('nhận diện tên trường nhạy cảm, không bắt nhầm tên thường', () => {
    for (const k of ['token', 'access_token', 'SECRET', 'code', 'key', 'x-api-key', 'sig', 'cookie']) expect(isSensitiveKey(k)).toBe(true);
    for (const k of ['email', 'name', 'keywords', 'codeName', 'role', 'createdAt']) expect(isSensitiveKey(k)).toBe(false);
    expect(isSensitiveKey('reviewerKey')).toBe(true);
  });
});

describe('stableStringify / countRecords', () => {
  it('không phụ thuộc thứ tự khóa', () => {
    expect(stableStringify({ b: 1, a: { d: 1, c: 2 } })).toBe(stableStringify({ a: { c: 2, d: 1 }, b: 1 }));
  });
  it('đếm bản ghi', () => {
    expect(countRecords([1, 2, 3])).toBe(3);
    expect(countRecords({ entries: [1, 2], other: [3] })).toBe(3);
    expect(countRecords({ a: 1, b: 2 })).toBe(2);
    expect(countRecords(null)).toBe(0);
  });
});

describe('buildBundle + verifyBundle', () => {
  const now = new Date('2026-10-23T01:00:00Z');
  const make = () =>
    buildBundle(
      { eval: { entries: [{ id: 1 }, { id: 2 }] }, 'user-roles': { users: { 'a@x.vn': { role: 'admin', token: 't' } } }, signals: null },
      { createdBy: 'admin@truongvietanh.com', now },
    );

  it('dựng manifest đúng và đánh dấu kho trống', () => {
    const b = make();
    expect(b.manifest.format).toBe('va-backup');
    expect(b.manifest.createdAt).toBe(now.toISOString());
    expect(b.manifest.empty).toEqual(['signals']);
    expect(Object.keys(b.stores).sort()).toEqual(['eval', 'user-roles']);
    expect(b.manifest.stores.eval.records).toBe(2);
    expect(b.manifest.stores['user-roles'].redactedFields).toBe(1);
    expect(JSON.stringify(b)).not.toContain('"token"');
    expect(b.manifest.stores.eval.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gói nguyên vẹn (kể cả sau khi qua JSON và đảo khóa) được xác nhận hợp lệ', () => {
    const b = JSON.parse(JSON.stringify(make()));
    const r = verifyBundle(b, KNOWN);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });

  it('phát hiện dữ liệu bị sửa', () => {
    const b = JSON.parse(JSON.stringify(make()));
    b.stores.eval.entries.push({ id: 3 });
    const r = verifyBundle(b, KNOWN);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('eval');
  });

  it('phát hiện thiếu kho, kho thừa và manifest hỏng', () => {
    const b = JSON.parse(JSON.stringify(make()));
    delete b.stores.eval;
    b.stores.extra = {};
    const r = verifyBundle(b, KNOWN);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('extra'))).toBe(true);
    expect(r.checks.find((c) => c.key === 'eval')?.ok).toBe(false);

    expect(verifyBundle(null).ok).toBe(false);
    expect(verifyBundle([]).ok).toBe(false);
    expect(verifyBundle({ manifest: {}, stores: {} }).ok).toBe(false);
  });

  it('từ chối gói phiên bản mới hơn và cảnh báo kho lạ', () => {
    const b = JSON.parse(JSON.stringify(make()));
    b.manifest.version = 99;
    expect(verifyBundle(b, KNOWN).ok).toBe(false);
    const c = JSON.parse(JSON.stringify(make()));
    expect(verifyBundle(c, ['eval']).warnings.some((w) => w.includes('user-roles'))).toBe(true);
  });

  it('cảnh báo nếu kho còn trường nhạy cảm', () => {
    const b = JSON.parse(JSON.stringify(make()));
    b.stores.eval = { entries: [], secret: 's' };
    // tính lại checksum cho khớp để chỉ còn cảnh báo
    const rebuilt = buildBundle({ eval: b.stores.eval }, { createdBy: 'x' });
    b.manifest.stores.eval = { ...b.manifest.stores.eval };
    const manual = { manifest: { ...rebuilt.manifest }, stores: { eval: b.stores.eval } };
    // rebuilt đã loại secret nên checksum khác: gói thủ công này phải bị báo lỗi checksum và cảnh báo nhạy cảm
    const r = verifyBundle(manual, KNOWN);
    expect(r.ok).toBe(false);
    expect(r.warnings.some((w) => w.includes('nhạy cảm'))).toBe(true);
  });
});
