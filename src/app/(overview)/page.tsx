import Link from 'next/link';
import { AlertCounts, AlertList } from '@/components/AlertList';
import { BarList } from '@/components/BarList';
import { BranchTable } from '@/components/BranchTable';
import { BriefingCard } from '@/components/BriefingCard';
import { FunnelChart } from '@/components/FunnelChart';
import { KpiStrip } from '@/components/KpiStrip';
import { PageHeader } from '@/components/PageHeader';
import { Section } from '@/components/Section';
import { SourceList } from '@/components/SourceList';
import { TargetNote } from '@/components/TargetNote';
import { TrendChart } from '@/components/TrendChart';
import { WhatIf } from '@/components/WhatIf';
import { getStore } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { buildAlerts } from '@/lib/insights';
import {
  NOT_RECORDED,
  branchRows,
  cohort,
  delayReasons,
  funnel,
  lostReasons,
  monthlyTrend,
  scopedDeliveries,
  sourcePerformance,
  summarize,
  whatIfBase,
} from '@/lib/metrics';
import { buildBriefing } from '@/lib/narrative';
import { inRange, parseRange, rangeQuery } from '@/lib/range';
import { targetRealism } from '@/lib/targets';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OverviewPage({ searchParams }: PageProps) {
  const queryParams = await searchParams;
  const store = getStore();
  const range = parseRange(queryParams, store.months);
  const query = rangeQuery(range, store.months);

  const group = summarize(store, {}, range);
  const alerts = buildAlerts(store, range, {}, { rollUpBranches: true });
  const briefing = buildBriefing(store, {}, range, alerts);
  const leads = cohort(store, {}, range);
  const deliveries = scopedDeliveries(store, {}).filter((d) => inRange(d.deliveryMonth, range));
  const branchNames = Object.fromEntries(store.branches.map((b) => [b.id, b.name]));
  const officers = store.reps.filter((r) => r.role === 'sales_officer').length;
  const trend = monthlyTrend(store, {}, range);
  const asOf = `As of ${formatDate(store.asOf)}`;

  return (
    <>
      <PageHeader
        title="Group overview"
        subtitle={`${store.branches.length} branches · ${officers} sales officers`}
        range={range}
      />

      <div className="grid gap-5">
        <BriefingCard briefing={briefing} title="CEO briefing" query={query} />
        <KpiStrip s={group} asOf={asOf} />
        <TargetNote realism={targetRealism(store, {}, range, trend)} />

        <div className="grid items-start gap-5 xl:grid-cols-5">
          <Section
            className="xl:col-span-3"
            title="Needs attention"
            description="Ranked by urgency, then by money at stake."
            asOfNote={`As of ${formatDate(store.asOf)}`}
            actions={
              <Link href={`/actions${query}`} className="btn">
                Open Action center
              </Link>
            }
          >
            <div className="mb-3">
              <AlertCounts alerts={alerts} />
            </div>
            <AlertList
              alerts={alerts}
              query={query}
              branchNames={branchNames}
              limit={5}
              actionCenterCount={buildAlerts(store, range).length} />
          </Section>

          <Section className="xl:col-span-2" title="Deliveries vs target" description="By month of delivery.">
            <TrendChart points={trend} hasTarget />
          </Section>
        </div>

        <Section
          title="Branch scorecard"
          description="Sorted by unit target attainment. The tick on each bar marks the group pace; red flags a branch well behind the group."
        >
          <BranchTable rows={branchRows(store, range)} group={group} query={query} />
        </Section>

        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="Sales funnel" description="Leads created in the period, by the furthest stage they reached.">
            <FunnelChart steps={funnel(leads)} />
          </Section>
          <Section title="Why leads are lost" description="Recorded reason for every lost lead.">
            <BarList rows={lostReasons(leads)} emptyTitle="No lost leads in this period" mutedLabels={[NOT_RECORDED]} highlightTop="bad" />
          </Section>
        </div>

        <div className="grid gap-5 lg:grid-cols-5">
          <Section
            className="lg:col-span-3"
            title="What if we convert better?"
            description="Revenue impact of improving the funnel for leads created in this period."
          >
            <WhatIf base={whatIfBase(store, {}, range)} />
          </Section>
          <Section className="lg:col-span-2" title="Delivery delays" description="Deliveries that slipped, by cause.">
            <BarList rows={delayReasons(deliveries)} emptyTitle="No delayed deliveries in this period" tone="warn" />
          </Section>
        </div>

        <Section title="Lead sources" description="Where leads come from and how well each source converts. Green is the best, red the weakest.">
          <SourceList rows={sourcePerformance(leads)} />
        </Section>
      </div>
    </>
  );
}
