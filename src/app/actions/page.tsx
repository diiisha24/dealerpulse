import type { Metadata } from 'next';
import { ActionCenter } from '@/components/ActionCenter';
import { PageHeader } from '@/components/PageHeader';
import { getStore } from '@/lib/data';
import { buildAlerts } from '@/lib/insights';
import { parseRange, rangeQuery } from '@/lib/range';

export const metadata: Metadata = { title: 'Action center' };

interface PageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default function ActionsPage({ searchParams }: PageProps) {
  const store = getStore();
  const range = parseRange(searchParams, store.months);
  const query = rangeQuery(range, store.months);
  const alerts = buildAlerts(store, range);
  const branches = store.branches.map((b) => ({ id: b.id, name: b.name }));

  return (
    <>
      <PageHeader
        title="Action center"
        subtitle="Every issue the dashboard found, with the owner and the next step. Lead alerts reflect the latest data; target and conversion alerts follow the selected period."
        crumbs={[{ label: 'Overview', href: `/${query}` }, { label: 'Action center' }]}
        range={range}
      />
      <ActionCenter alerts={alerts} branches={branches} query={query} range={range} />
    </>
  );
}
