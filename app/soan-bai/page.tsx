'use client';

import { Shell } from '@/components/Shell';
import { SoanBaiView } from '@/components/soan-bai/SoanBaiView';

export default function SoanBaiPage() {
  return (
    <Shell
      title="Soạn bài từ Kho"
      subtitle="Điền 7 thông số có ràng buộc, hệ thống lấy bản chuẩn từ Kho để sinh học liệu. Bạn xem · chỉnh · duyệt · dạy."
    >
      <SoanBaiView />
    </Shell>
  );
}
