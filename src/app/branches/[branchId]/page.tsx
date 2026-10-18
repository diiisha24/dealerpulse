import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AlertList } from '@/components/AlertList';
import { BarList } from '@/components/BarList';
import { BriefingCard } from '@/components/BriefingCard';
import { FunnelChart } from '@/components/FunnelChart';
import { KpiStrip } from '@/components/KpiStrip';
import { LeadTable } from '@/components/LeadTable';
import { PageHeader } from '@/components/PageHeader';
import { RepTable } from '@/components/RepTable';
import { Section } from '@/components/Section';
import { TargetNote } from '@/components/TargetNote';
import { TrendChart } from '@/components/TrendChart';
import { getStore } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { buildAlerts } from '@/lib/insights';
import { toLeadRows } from '@/lib/leadRows';
import { NOT_RECORDED, cohort, funnel, lostReasons, monthlyTrend, repRows, scopedLeads, summarize } from '@/lib/metrics';
import { buildBriefing } from '@/lib/narrative';
import { inRange, parseRange, rangeQuery } from '@/lib/range';
import { funnelTakeaway, lostTakeaway, trendTakeaway } from '@/lib/takeaways';
import { targetRealism } from '@/lib/targets';

interface PageProps {
  params: { branchId: string };
  searchParams: Record<string, string | string[] | undefined>;
}

export function generateMetadata({ params }: PageProps): Metadata {
  const branch = getStore().branchById.get(params.branchId);
  // The segment layout already answers 404 for an unknown ID; this keeps the type narrowed.
  if (!branch) notFound();
  return { title: branch.name };
}

export default function BranchPage({ params, searchParams }: PageProps) {
  const store = getStore();
  const branch = store.branchById.get(params.branchId);
  if (!branch) notFound();

  const range = parseRange(searchParams, store.months);
  const query = rangeQuery(range, store.months);
  const scope = { branchId: branch.id };

  const s = summarize(store, scope, range);
  const group = summarize(store, {}, range);
  const alerts = buildAlerts(store, range, scope);
  const leads = cohort(store, scope, range);
  const trend = monthlyTrend(store, scope, range);
  const steps = funnel(leads);
  const lost = lostReasons(leads);
  const manager = store.reps.find((r) => r.branch_id === branch.id && r.role === 'branch_manager');
  const officers = store.reps.filter((r) => r.branch_id === branch.id && r.role === 'sales_officer').length;

  // The lead list shows the period's leads plus anything still in flight, so nothing actionable hides behind the filter.
  const tableLeads = scopedLeads(store, scope).filter(
    (l) => inRange(l.createdMonth, range) || l.isOpen || l.status === 'order_placed',
  );

  return (
    <>
      <PageHeader
        title={branch.name}
        subtitle={`${branch.city} · ${manager ? `Managed by ${manager.name} · ` : ''}${officers} sales officers`}
        crumbs={[{ label: 'Overview', href: `/${query}` }, { label: branch.name }]}
        range={range}
      />

      <div className="grid gap-5">
        <BriefingCard briefing={buildBriefing(store, scope, range, alerts)} title="Branch briefing" query={query} />
        <KpiStrip s={s} benchmark={group} asOf={`As of ${formatDate(store.asOf)}`} />
        <TargetNote realism={targetRealism(store, scope, range, trend)} subject={branch.name} />

        <div className="grid gap-5 xl:grid-cols-5">
          <Section
            className="xl:col-span-3"
            title="Needs attention"
            asOfNote={`As of ${formatDate(store.asOf)}`}
            description="What this branch should act on first."
          >
            <AlertList
              alerts={alerts}
              query={query}
              branchNames={{ [branch.id]: branch.name }}
              emptyTitle={`Nothing urgent at ${branch.name}`}
            />
          </Section>
          <Section className="xl:col-span-2" {...trendTakeaway(trend)} description="By month of delivery.">
            <TrendChart points={trend} hasTarget />
          </Section>
        </div>

        <Section title="Sales team" description="Ranked by delivered revenue in the period. Red marks a rep well below their peers.">
          <RepTable rows={repRows(store, branch.id, range)} query={query} />
        </Section>

        <div className="grid gap-5 lg:grid-cols-2">
          <Section {...funnelTakeaway(steps)} description="Leads created in the period, by the furthest stage they reached.">
            <FunnelChart steps={steps} />
          </Section>
          <Section {...lostTakeaway(lost)}>
            <BarList rows={lost} emptyTitle="No lost leads in this period" mutedLabels={[NOT_RECORDED]} highlightTop="bad" />
          </Section>
        </div>

        <Section title="Leads" description="Leads created in the period, plus every lead still open or awaiting delivery.">
          <LeadTable rows={toLeadRows(store, tableLeads)} query={query} filename={`${branch.id}-leads.csv`} pageSize={10} />
        </Section>
      </div>
    </>
  );
}
