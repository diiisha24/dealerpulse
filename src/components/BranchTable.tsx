import clsx from 'clsx';
import Link from 'next/link';
import { formatInr, formatPct } from '@/lib/format';
import type { BranchRow, Summary } from '@/lib/metrics';
import { attainmentTone } from './KpiCard';
import { ClickableRow, ColHead, ScrollShadow } from './ScrollShadow';

// Opaque versions of the header, row-hover and footer tints, so a sticky cell hides what scrolls under it.
const TINT = 'bg-[image:linear-gradient(rgb(244_246_249/0.6),rgb(244_246_249/0.6))]';
const TINT_HOVER = 'group-hover:bg-[image:linear-gradient(rgb(244_246_249/0.6),rgb(244_246_249/0.6))]';
const STICKY = 'sticky left-0 z-10 bg-white [[data-scrolled=true]_&]:shadow-[inset_-1px_0_0_#e2e6ee]';

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Bar against target, with a tick at the group's pace. Red only for a branch far behind the group. */
function Attainment({ value, benchmark }: { value: number; benchmark?: number }) {
  const behind = benchmark !== undefined && attainmentTone(value, benchmark) === 'bad';
  const shown = Number.isFinite(value) ? Math.min(value, 1) : 0;
  const pace = benchmark !== undefined && Number.isFinite(benchmark) ? Math.min(benchmark, 1) : null;
  return (
    <div className="flex min-w-[100px] items-center gap-2">
      <div className="relative h-1.5 flex-1 rounded-full bg-canvas">
        <div
          className={clsx('h-full rounded-full', behind ? 'bg-bad' : 'bg-brand')}
          style={{ width: `${Math.max(shown * 100, 2)}%` }}
        />
        {pace !== null && (
          <div
            className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-ink-soft"
            style={{ left: `${pace * 100}%` }}
            title={`Group pace ${formatPct(pace)}`}
          />
        )}
      </div>
      <span className={clsx('num w-10 text-right text-[13px] font-medium', behind && 'text-bad')}>{formatPct(value)}</span>
      {pace !== null && <span className="sr-only">, group pace {formatPct(pace)}</span>}
    </div>
  );
}

/** Plain number unless it is above the median of the branches shown. */
function Count({ count, median: mid, tone }: { count: number; median: number; tone: 'bad' | 'warn' }) {
  if (count <= mid) return <span className={clsx('num', count === 0 && 'text-ink-muted')}>{count}</span>;
  return (
    <span
      className={clsx(
        'num inline-flex min-w-[24px] justify-center rounded px-1.5 py-0.5 text-[12px] font-semibold',
        tone === 'bad' ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn',
      )}
    >
      {count}
      <span className="sr-only"> (above the branch median)</span>
    </span>
  );
}

function days(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : '–';
}

export function BranchTable({ rows, group, query }: { rows: BranchRow[]; group: Summary; query: string }) {
  const sorted = [...rows].sort((a, b) => b.summary.unitAttainment - a.summary.unitAttainment);
  const coldMedian = median(rows.map((r) => r.summary.coldLeads));
  const stuckMedian = median(rows.map((r) => r.summary.stuckOrders));

  return (
    <ScrollShadow className="-mx-4 sm:-mx-5">
      <table className="table-base whitespace-nowrap">
        <thead>
          <tr>
            {/* `!bg-white`: `.table-base th` sets a translucent background with higher specificity. */}
            <th className={clsx(STICKY, TINT, '!bg-white pl-4 sm:pl-5')}>Branch</th>
            <th>
              <ColHead full="Unit target" short="Target" tip={{ term: 'attainment' }} />
            </th>
            <th className="text-right">Units</th>
            <th className="text-right">Revenue</th>
            <th className="text-right">
              <ColHead full="Lead → order" short="L → O" tip={{ term: 'lead_to_order' }} />
            </th>
            <th className="text-right">
              <ColHead full="Loss rate" short="Lost" tip={{ term: 'leads_lost' }} />
            </th>
            <th className="text-right">
              <ColHead full="Avg days to deliver" short="Days" tip={{ term: 'days_to_deliver' }} />
            </th>
            <th className="text-right">
              <ColHead full="Cold leads" short="Cold" tip={{ term: 'cold_lead' }} />
            </th>
            <th className="text-right">
              <ColHead full="Stuck orders" short="Stuck" tip={{ term: 'stuck_order' }} />
            </th>
            <th className="w-8 pr-4 sm:pr-5">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const s = r.summary;
            const lossHigh = s.lossRate - group.lossRate >= 0.15;
            const convLow = s.conversion < group.conversion * 0.6;
            const href = `/branches/${r.branchId}${query}`;
            return (
              <ClickableRow key={r.branchId} href={href}>
                <td className={clsx(STICKY, TINT_HOVER, 'pl-4 sm:pl-5')}>
                  <Link href={href} className="font-medium text-ink group-hover:text-brand group-hover:underline">
                    {r.name}
                  </Link>
                  <div className="text-[12px] text-ink-muted">{r.city}</div>
                </td>
                <td>
                  <Attainment value={s.unitAttainment} benchmark={group.unitAttainment} />
                </td>
                <td className="num text-right">
                  {s.units}
                  <span className="text-ink-muted"> / {s.targetUnits ?? '–'}</span>
                </td>
                <td className="num text-right">{formatInr(s.revenue)}</td>
                <td className={clsx('num text-right', convLow && 'font-semibold text-bad')}>{formatPct(s.conversion)}</td>
                <td className={clsx('num text-right', lossHigh && 'font-semibold text-bad')}>{formatPct(s.lossRate)}</td>
                <td className="num text-right">{days(s.avgDaysToDeliver)}</td>
                <td className="text-right">
                  <Count count={s.coldLeads} median={coldMedian} tone="warn" />
                </td>
                <td className="text-right">
                  <Count count={s.stuckOrders} median={stuckMedian} tone="bad" />
                </td>
                <td aria-hidden="true" className="pr-4 text-right text-lg leading-none text-ink-muted group-hover:text-brand sm:pr-5">
                  ›
                </td>
              </ClickableRow>
            );
          })}
        </tbody>
        <tfoot>
          <tr className={clsx(TINT, 'font-medium')}>
            <td className={clsx(STICKY, TINT, 'pl-4 sm:pl-5')}>Group</td>
            <td>
              <Attainment value={group.unitAttainment} />
            </td>
            <td className="num text-right">
              {group.units}
              <span className="text-ink-muted"> / {group.targetUnits ?? '–'}</span>
            </td>
            <td className="num text-right">{formatInr(group.revenue)}</td>
            <td className="num text-right">{formatPct(group.conversion)}</td>
            <td className="num text-right">{formatPct(group.lossRate)}</td>
            <td className="num text-right">{days(group.avgDaysToDeliver)}</td>
            <td className="num text-right">{group.coldLeads}</td>
            <td className="num text-right">{group.stuckOrders}</td>
            <td className="pr-4 sm:pr-5" />
          </tr>
        </tfoot>
      </table>
    </ScrollShadow>
  );
}
