import { AppShell } from '@/components/app-shell';
import { ManagerWorkspace } from '@/components/manager/manager-workspace';

export default async function ManagerPage({ searchParams }: {
  searchParams: Promise<{ managerId?: string | string[]; month?: string | string[] }>;
}) {
  const query = await searchParams;
  const managerId = typeof query.managerId === 'string' && /^[1-9]\d*$/.test(query.managerId)
    && Number.isSafeInteger(Number(query.managerId)) ? Number(query.managerId) : undefined;
  const month = typeof query.month === 'string' && /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(query.month)
    ? query.month : undefined;
  return (
    <AppShell>
      <ManagerWorkspace key={`${managerId ?? 'self'}:${month ?? 'current'}`} initialManagerId={managerId} initialMonth={month} />
    </AppShell>
  );
}
