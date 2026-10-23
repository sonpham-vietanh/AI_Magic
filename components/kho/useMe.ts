'use client';

import { useEffect, useState } from 'react';

export interface MeUser {
  name: string;
  email: string;
  role: 'teacher' | 'reviewer' | 'admin';
  via?: string;
  initial?: string;
}

export interface MeState {
  /** Đã hỏi xong GET /api/me (kể cả khi lỗi). */
  ready: boolean;
  /** Đăng nhập Google Workspace đang bật. */
  ssoEnabled: boolean;
  user: MeUser | null;
  /**
   * Giao diện có nên hiện nút duyệt hay không. Chỉ là tiện lợi: máy chủ vẫn kiểm quyền.
   * SSO bật: chỉ reviewer/admin. SSO tắt: giữ cách cũ (nhập mã người duyệt), nên luôn cho phép thử.
   */
  canReview: boolean;
  /** Dùng mã người duyệt (chế độ cũ) thay vì quyền theo vai trò. */
  useKey: boolean;
}

const INITIAL: MeState = { ready: false, ssoEnabled: false, user: null, canReview: true, useKey: true };

let cached: Promise<MeState> | null = null;

export function deriveMe(body: unknown): MeState {
  const b = (body && typeof body === 'object' ? body : {}) as { ssoEnabled?: unknown; user?: unknown };
  const sso = b.ssoEnabled === true;
  const u = b.user && typeof b.user === 'object' ? (b.user as Partial<MeUser>) : null;
  const role = u?.role === 'admin' || u?.role === 'reviewer' ? u.role : 'teacher';
  const user: MeUser | null = u && typeof u.name === 'string' ? { name: u.name, email: String(u.email ?? ''), role, via: u.via, initial: u.initial } : null;
  if (sso && user) return { ready: true, ssoEnabled: true, user, canReview: role !== 'teacher', useKey: false };
  if (sso) return { ready: true, ssoEnabled: true, user: null, canReview: false, useKey: false };
  return { ready: true, ssoEnabled: false, user, canReview: true, useKey: true };
}

function load(): Promise<MeState> {
  if (!cached) {
    cached = fetch('/api/me', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('me');
        return deriveMe(await res.json());
      })
      .catch(() => {
        cached = null; // lần sau thử lại
        return { ...INITIAL, ready: true };
      });
  }
  return cached;
}

/** Danh tính từ phiên đăng nhập. Không bao giờ ném lỗi; API lỗi thì coi như chưa có SSO. */
export function useMe(): MeState {
  const [me, setMe] = useState<MeState>(INITIAL);
  useEffect(() => {
    let live = true;
    void load().then((m) => {
      if (live) setMe(m);
    });
    return () => {
      live = false;
    };
  }, []);
  return me;
}
