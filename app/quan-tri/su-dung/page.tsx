'use client';

import { Shell } from '@/components/Shell';
import { UsageDashboard } from '@/components/usage/UsageDashboard';

export default function SuDungAiPage() {
  return (
    <Shell title="Sử dụng AI và chi phí" subtitle="Theo dõi token, chi phí ước tính và hạn mức soạn bài của giáo viên.">
      <UsageDashboard />
    </Shell>
  );
}
