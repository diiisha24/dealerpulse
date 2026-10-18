import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AlertList } from '@/components/AlertList';
import { BarList } from '@/components/BarList';
import { BriefingCard } from '@/components/BriefingCard';
import { FunnelChart } from '@/components/FunnelChart';
import { KpiStrip } from '@/components/KpiStrip';
import { LeadTable } from '@/components/LeadTable';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, Section } from '@/components/Section';
import { TrendChart } from '@/components/TrendChart';
import { getStore } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { buildAlerts, sortAlerts } from '@/lib/insights';
import { toLeadRows } from '@/lib/leadRows';
import { NOT_RECORDED, cohort, funnel, lostReasons, monthlyTrend, scopedLeads, summarize } from '@/lib/metrics';
import { buildBriefing } from '@/lib/narrative';
import { parseRange, rangeQuery } from '@/lib/range';

interface PageProps {
  params: { repId: string };
  searchParams: Record<string, string | string[] | undefined>;
}

export function generateMetadata({ params }: PageProps): Metadata {
  const rep = getStore().repById.get(params.repId);
  // The segment layout already answers 404 for an unknown ID; this keeps the type narrowed.
  if (!rep) notFound();
  return { title: rep.name };
}

export default function RepPage({ params, searchParams }: PageProps) {
  const store = getStore();
  const rep = store.repById.get(params.repId);
  if (!rep) notFound();
  const branch = store.branchById.get(rep.branch_id);

  const range = parseRange(searchParams, store.months);
  const query = rangeQuery(range, store.months);
  const scope = { repId: rep.id };

  const s = summarize(store, scope, range);
  const branchSummary = summarize(store, { branchId: rep.branch_id }, range);
  // Lead-level alerts scoped to this rep, plus the peer comparisons the branch view raised about them.
  const alerts = sortAlerts([
    ...buildAlerts(store, range, scope),
    ...buildAlerts(store, range, { branchId: rep.branch_id }).filter((a) => a.repId === rep.id),
  ]);
  const leads = cohort(store, scope, range);
  const allLeads = scopedLeads(store, scope);
  const role = rep.role === 'branch_manager' ? 'Branch manager' : 'Sales officer';
  const crumbs = [
    { label: 'Overview', href: `/${query}` },
    ...(branch ? [{ label: branch.name, href: `/branches/${branch.id}${query}` }] : []),
    { label: rep.name },
  ];

  return (
    <>
      <PageHeader
        title={rep.name}
        subtitle={`${role} · ${branch?.name ?? rep.branch_id} · joined ${formatDate(rep.joined)}`}
        crumbs={crumbs}
        range={range}
      />

      {allLeads.length === 0 ? (
        <div className="card p-6">
          <EmptyState
            title={`${rep.name} has no leads assigned`}
            body="Branch managers in this dataset do not own leads directly. Open the branch view to see the team they manage."
          />
        </div>
      ) : (
        <div className="grid gap-5">
          <BriefingCard briefing={buildBriefing(store, scope, range, alerts)} title="Rep briefing" />
          <KpiStrip s={s} benchmark={branchSummary} benchmarkLabel="branch" />

          <div className="grid gap-5 xl:grid-cols-5">
            <Section
              className="xl:col-span-3"
              title="Needs attention"
              asOfNote={`As of ${formatDate(store.asOf)}`}
              description="Alerts that involve this rep's leads."
            >
              <AlertList
                alerts={alerts}
                query={query}
                branchNames={branch ? { [branch.id]: branch.name } : {}}
                emptyTitle={`Nothing urgent for ${rep.name}`}
                currentRepId={rep.id}
              />
            </Section>
            <Section className="xl:col-span-2" title="Monthly deliveries" description="Reps have no individual targets in this data.">
              <TrendChart points={monthlyTrend(store, scope, range)} hasTarget={false} />
            </Section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Sales funnel" description="Leads created in the period, by the furthest stage they reached.">
              <FunnelChart steps={funnel(leads)} />
            </Section>
            <Section title="Why leads are lost">
              <BarList rows={lostReasons(leads)} emptyTitle="No lost leads in this period" mutedLabels={[NOT_RECORDED]} />
            </Section>
          </div>

          <Section title="Leads" description="Every lead assigned to this rep.">
            <LeadTable rows={toLeadRows(store, allLeads)} showRep={false} query={query} filename={`${rep.id}-leads.csv`} />
          </Section>
        </div>
      )}
    </>
  );
}
