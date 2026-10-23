'use client';

import { useEffect, useState } from 'react';
import { EMPTY_ME, parseMe, type MeInfo } from '@/lib/agent/prefs';

export interface UsageInfo {
  today: { used: number; limit: number };
  month: { runs: number; tokens: number };
}

let mePromise: Promise<MeInfo> | null = null;

/** Gọi /api/me một lần cho cả trang; lỗi (API chưa có, mạng) trả về "chưa đăng nhập" để giao diện không vỡ. */
export function loadMe(force = false): Promise<MeInfo> {
  if (!mePromise || force) {
    mePromise = fetch('/api/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => parseMe(j))
      .catch(() => EMPTY_ME);
  }
  return mePromise;
}

/** Trả về [me, ready]. `ready` = đã có phản hồi (kể cả khi lỗi). */
export function useMe(): [MeInfo, boolean] {
  const [me, setMe] = useState<MeInfo>(EMPTY_ME);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadMe().then((m) => {
      if (!alive) return;
      setMe(m);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return [me, ready];
}

/** Hạn mức hôm nay từ /api/usage/me; bỏ qua êm khi API chưa có hoặc lỗi. */
export function useUsage(refreshKey: unknown): UsageInfo | null {
  const [u, setU] = useState<UsageInfo | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/usage/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j || j.ok !== true) return;
        const t = j.today;
        if (t && typeof t.used === 'number' && typeof t.limit === 'number') {
          setU({
            today: { used: t.used, limit: t.limit },
            month: { runs: Number(j.month?.runs) || 0, tokens: Number(j.month?.tokens) || 0 },
          });
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  return u;
}
