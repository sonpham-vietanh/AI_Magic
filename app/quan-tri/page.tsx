'use client';

import { Shell } from '@/components/Shell';
import { AdminUsers } from '@/components/quan-tri/AdminUsers';
import '../ui-qt.css';

export default function QuanTriPage() {
  return (
    <Shell title="Quản trị người dùng" subtitle="Phân quyền giáo viên, người duyệt và quản trị viên; chặn tài khoản và xem nhật ký thao tác.">
      <AdminUsers />
    </Shell>
  );
}
