import { DashboardClient } from '@/components/DashboardClient';

export default async function HomePage({
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
