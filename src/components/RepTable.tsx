import clsx from 'clsx';
import Link from 'next/link';
import { formatInr, formatPct } from '@/lib/format';
import type { RepRow } from '@/lib/metrics';
import { ClickableRow, ColHead, ScrollShadow } from './ScrollShadow';
import { EmptyState } from './Section';

// Opaque versions of the header and row-hover tints, so a sticky cell hides what scrolls under it.
const TINT = 'bg-[image:linear-gradient(rgb(244_246_249/0.6),rgb(244_246_249/0.6))]';
const TINT_HOVER = 'group-hover:bg-[image:linear-gradient(rgb(244_246_249/0.6),rgb(244_246_249/0.6))]';
const STICKY = 'sticky left-0 z-10 bg-white [[data-scrolled=true]_&]:shadow-[inset_-1px_0_0_#e2e6ee]';

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function RepTable({ rows, query }: { rows: RepRow[]; query: string }) {
  const officers = rows.filter((r) => r.role === 'sales_officer');
  const managers = rows.filter((r) => r.role === 'branch_manager');
  if (officers.length === 0) return <EmptyState title="No sales officers at this branch" />;

  const maxRevenue = Math.max(...officers.map((r) => r.summary.revenue), 1);
  const coldMedian = median(officers.map((r) => r.summary.coldLeads));

  return (
    <>
      <ScrollShadow className="-mx-4 sm:-mx-5">
        <table className="table-base whitespace-nowrap">
          <thead>
            <tr>
              <th className={clsx(STICKY, TINT, '!bg-white pl-4 sm:pl-5')}>
                <ColHead full="Sales officer" short="Officer" />
              </th>
              <th>
                <ColHead full="Delivered revenue" short="Revenue" />
              </th>
              <th className="text-right">Units</th>
              <th className="text-right">
                <ColHead full="New leads" short="Leads" />
              </th>
              <th className="text-right">
                <ColHead full="Lead → order" short="L → O" tip={{ term: 'lead_to_order' }} />
              </th>
              <th className="text-right">
                <ColHead
                  full="First contact"
                  short="1st call"
                  tip={{
                    label: 'First contact',
                    definition: 'Median hours from a lead being created to the first contact with the customer.',
                  }}
                />
              </th>
              <th className="text-right">
                <ColHead full="Open" tip={{ term: 'open_pipeline', label: 'Open leads' }} />
              </th>
              <th className="text-right">
                <ColHead full="Cold" tip={{ term: 'cold_lead' }} />
              </th>
              <th className="w-8 pr-4 sm:pr-5">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {officers.map((r, i) => {
              const s = r.summary;
              const href = `/reps/${r.repId}${query}`;
              const coldHigh = s.coldLeads > coldMedian;
              return (
                <ClickableRow key={r.repId} href={href}>
                  <td className={clsx(STICKY, TINT_HOVER, 'pl-4 sm:pl-5')}>
                    <div className="flex items-center gap-2">
                      <span className="num w-4 text-[12px] text-ink-muted">{i + 1}</span>
                      <Link href={href} className="font-medium text-ink group-hover:text-brand group-hover:underline">
                        {r.name}
                      </Link>
                    </div>
                  </td>
                  <td>
                    <div className="flex min-w-[140px] items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-canvas">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${(s.revenue / maxRevenue) * 100}%` }} />
                      </div>
                      <span className="num w-20 text-right text-[13px]">{formatInr(s.revenue)}</span>
                    </div>
                  </td>
                  <td className="num text-right">{s.units}</td>
                  <td className="num text-right">{s.leads}</td>
                  <td
                    className={clsx('num text-right', r.belowPeers && 'font-semibold text-bad')}
                    title={Number.isFinite(r.peerConversion) ? `Peers at this branch: ${formatPct(r.peerConversion)}` : undefined}
                  >
                    {formatPct(s.conversion)}
                    {r.belowPeers && <span className="sr-only"> (well below peers)</span>}
                  </td>
                  <td className="num text-right">
                    {Number.isFinite(s.medianFirstContactHours) ? `${Math.round(s.medianFirstContactHours)} h` : '–'}
                  </td>
                  <td className="num text-right">{s.openLeads}</td>
                  <td className={clsx('num text-right', coldHigh ? 'font-semibold text-warn' : s.coldLeads === 0 && 'text-ink-muted')}>
                    {s.coldLeads}
                    {coldHigh && <span className="sr-only"> (above the team median)</span>}
                  </td>
                  <td aria-hidden="true" className="pr-4 text-right text-lg leading-none text-ink-muted group-hover:text-brand sm:pr-5">
                    ›
                  </td>
                </ClickableRow>
              );
            })}
          </tbody>
        </table>
      </ScrollShadow>
      {managers.length > 0 && (
        <p className="mt-3 text-[12px] text-ink-muted">
          Branch manager: {managers.map((m) => m.name).join(', ')}. Managers carry no leads of their own in this data.
        </p>
      )}
    </>
  );
}
