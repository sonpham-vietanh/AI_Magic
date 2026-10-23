'use client';

import { useCallback, useState } from 'react';

/**
 * Xuất Word: thư viện docx chỉ được nạp khi cô/thầy bấm nút (await import), không nằm trong gói tải ban đầu.
 * Lỗi kỹ thuật không lộ ra ngoài, chỉ hiện thông báo tiếng Việt.
 */
export function useWordExport() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async (build: () => Promise<{ blob: Blob; filename: string }>) => {
    setBusy(true);
    setError('');
    try {
      const { blob, filename } = await build();
      const { downloadBlob } = await import('@/lib/export/docx');
      downloadBlob(blob, filename);
    } catch {
      setError('Chưa tạo được tệp Word. Cô/thầy thử lại, hoặc dùng nút In để lưu PDF nhé.');
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run };
}
