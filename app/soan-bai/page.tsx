'use client';

import { Shell } from '@/components/Shell';
import { SoanBaiView } from '@/components/soan-bai/SoanBaiView';

export default function SoanBaiPage() {
  return (
    <Shell title="Soạn bài bằng biểu mẫu" subtitle="Điền vài mục, hệ thống soạn từ bản chuẩn trong Kho.">
      <SoanBaiView />
    </Shell>
  );
}
