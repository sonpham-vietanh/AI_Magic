import { DashboardClient } from '@/components/DashboardClient';

export const metadata = { title: 'Kho 82 công cụ' };

export default async function ToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string; nodeId?: string; classId?: string }>;
}) {
  const params = await searchParams;
  return (
    <DashboardClient
      initialToolId={params.tool}
      initialNodeId={params.nodeId}
      initialClassId={params.classId}
    />
  );
}
