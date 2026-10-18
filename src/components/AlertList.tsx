import clsx from 'clsx';
import Link from 'next/link';
import { formatDate, formatInr, STATUS_LABEL } from '@/lib/format';
import { KIND_LABEL, type Alert, type AlertKind, type AlertOwner, type Severity } from '@/lib/insights';
import { ScrollShadow } from './ScrollShadow';
import { EmptyState } from './Section';

const SEVERITY_STYLE: Record<Severity, { stripe: string; chip: string; label: string }> = {
  critical: { stripe: 'bg-bad', chip: 'bg-bad-soft text-bad', label: 'Act now' },
  warning: { stripe: 'bg-warn', chip: 'bg-warn-soft text-warn', label: 'This week' },
  info: { stripe: 'bg-brand', chip: 'bg-brand-soft text-brand-dark', label: 'Watch' },
};

/** Human labels for the severity levels, shared with the CSV export. */
export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: SEVERITY_STYLE.critical.label,
  warning: SEVERITY_STYLE.warning.label,
  info: SEVERITY_STYLE.info.label,
};

const ROLE_SHORT: Record<AlertOwner['role'], string> = { branch_manager: 'BM', sales_officer: 'SO' };

export function ownerLabel(owner: AlertOwner): string {
  return `${owner.name} (${ROLE_SHORT[owner.role]})`;
}

const STUCK_KINDS: readonly AlertKind[] = ['stuck_orders', 'stuck_verify'];

/** What `AlertLead.days` counts for each kind of alert. */
function daysHeader(kind: AlertKind): string {
  if (STUCK_KINDS.includes(kind)) return 'Days since order';
  if (kind === 'never_contacted' || kind === 'never_contacted_process') return 'Days since created';
  return 'Days idle';
}

/** Leads listed in one expander outside the Action center; the rest are a link away. */
const DEFAULT_LEAD_CAP = 20;

interface Props {
  alerts: Alert[];
  /** Appended to branch, rep and Action center links so the period carries over. */
  query: string;
  branchNames: Record<string, string>;
  limit?: number;
  emptyTitle?: string;
  emptyBody?: string;
  /** The rep whose page this is; their own "View rep" link is hidden. */
  currentRepId?: string;
  /** Issues in the Action center. When set, a footer links there with "Showing n of N issues". */
  actionCenterCount?: number;
  /** Leads listed per expander; `null` lists them all (the Action center). */
  leadCap?: number | null;
}

function LeadTableForAlert({ alert, query, cap }: { alert: Alert; query: string; cap: number | null }) {
  const stuck = STUCK_KINDS.includes(alert.kind);
  const leads = cap === null ? alert.leads : alert.leads.slice(0, cap);
  const hidden = alert.leads.length - leads.length;
  return (
    <>
      <ScrollShadow>
        <table className="table-base whitespace-nowrap">
          <thead>
            <tr>
              <th className="pl-5">Customer</th>
              {/* Every stuck lead is "Order placed", so stuck kinds show the promised date instead. */}
              {!stuck && <th>Stage</th>}
              <th className="hidden md:table-cell">Owner</th>
              <th className="w-24 whitespace-normal text-right">{daysHeader(alert.kind)}</th>
              {stuck && <th>Promised</th>}
              <th className="pr-4 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id}>
                <td className="pl-5">
                  <div className="font-medium">{l.customer}</div>
                  <div className="text-[12px] text-ink-muted">{l.model}</div>
                </td>
                {!stuck && <td className="text-ink-soft">{STATUS_LABEL[l.status]}</td>}
                <td className="hidden text-ink-soft md:table-cell">{l.repName}</td>
                <td className="num text-right">{l.days}</td>
                {stuck && (
                  <td className="text-ink-soft">
                    <div className="num">{l.promised ? formatDate(l.promised) : '–'}</div>
                    {alert.kind === 'stuck_verify' && (
                      <span className="mt-0.5 inline-block rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-medium text-warn">
                        Likely cancelled
                      </span>
                    )}
                  </td>
                )}
                <td className="num pr-4 text-right">{formatInr(l.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollShadow>
      {hidden > 0 && (
        <Link href={`/actions${query}`} className="block px-5 py-2 text-[13px] font-medium text-brand hover:underline">
          +{hidden} more in Action center →
        </Link>
      )}
    </>
  );
}

export function AlertList({
  alerts,
  query,
  branchNames,
  limit,
  emptyTitle = 'Nothing needs attention',
  emptyBody = 'No leads are going cold, no orders are stuck and performance is in line with peers.',
  currentRepId,
  actionCenterCount,
  leadCap = DEFAULT_LEAD_CAP,
}: Props) {
  if (alerts.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} />;
  }
  const shown = limit ? alerts.slice(0, limit) : alerts;

  return (
    <>
      <ul className="grid gap-3">
        {shown.map((a) => {
          const style = SEVERITY_STYLE[a.severity];
          return (
            <li key={a.id} className="relative overflow-hidden rounded-lg border border-line bg-white">
              <span className={clsx('absolute inset-y-0 left-0 w-1', style.stripe)} aria-hidden="true" />
              <div className="flex flex-col gap-2 py-3 pl-5 pr-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={clsx('rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', style.chip)}>
                      {style.label}
                    </span>
                    <span className="text-[12px] text-ink-muted">{KIND_LABEL[a.kind]}</span>
                    {a.branchId && (
                      <Link href={`/branches/${a.branchId}${query}`} className="text-[12px] text-brand hover:underline">
                        {branchNames[a.branchId] ?? a.branchId} →
                      </Link>
                    )}
                    {a.owner && (
                      <span className="rounded bg-canvas px-1.5 py-0.5 text-[12px] text-ink-soft">Owner: {ownerLabel(a.owner)}</span>
                    )}
                    {a.repId && a.repId !== currentRepId && (
                      <Link href={`/reps/${a.repId}${query}`} className="text-[12px] text-brand hover:underline">
                        View rep →
                      </Link>
                    )}
                  </div>
                  <p className="text-[14px] font-semibold text-ink">{a.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">{a.detail}</p>
                  <p className="mt-1.5 text-[13px] text-ink">
                    <span className="font-medium">Next step: </span>
                    {a.action}
                  </p>
                </div>
                <div className="num shrink-0 text-[13px] font-semibold text-ink sm:text-right">{a.impact}</div>
              </div>

              {a.leads.length > 0 && (
                <details className="group border-t border-line">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 py-2 pl-5 pr-4 text-[13px] font-medium text-brand hover:bg-canvas/60">
                    <span className="transition group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true">
                      ›
                    </span>
                    Show {a.leads.length === 1 ? 'the lead' : `all ${a.leads.length} leads`}
                  </summary>
                  <LeadTableForAlert alert={a} query={query} cap={leadCap} />
                </details>
              )}
            </li>
          );
        })}
      </ul>
      {actionCenterCount !== undefined && (
        <p className="mt-3 text-[13px] text-ink-muted">
          <span className="num">
            Showing {shown.length} of {alerts.length} issues
          </span>
          {' · '}
          <Link href={`/actions${query}`} className="font-medium text-brand hover:underline">
            {actionCenterCount} in Action center →
          </Link>
        </p>
      )}
    </>
  );
}

export function AlertCounts({ alerts }: { alerts: Alert[] }) {
  const counts: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  for (const a of alerts) counts[a.severity] += 1;
  return (
    <div className="flex flex-wrap gap-2 text-[12px]">
      {(Object.keys(counts) as Severity[]).map((s) => (
        <span key={s} className={clsx('rounded-full px-2 py-0.5 font-medium', SEVERITY_STYLE[s].chip)}>
          {counts[s]} {SEVERITY_STYLE[s].label.toLowerCase()}
        </span>
      ))}
    </div>
  );
}
