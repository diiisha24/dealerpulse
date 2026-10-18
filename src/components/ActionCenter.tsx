'use client';

import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { downloadCsv, periodFilename, toCsv } from '@/lib/csv';
import { formatInr } from '@/lib/format';
import { KIND_LABEL, type Alert, type AlertKind, type Severity } from '@/lib/insights';
import type { LeadStatus, MonthRange } from '@/lib/types';
import { AlertCounts, AlertList, ownerLabel, SEVERITY_LABEL } from './AlertList';

interface Props {
  alerts: Alert[];
  branches: { id: string; name: string }[];
  query: string;
  range: MonthRange;
}

const SEVERITIES: { id: Severity | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: SEVERITY_LABEL.critical },
  { id: 'warning', label: SEVERITY_LABEL.warning },
  { id: 'info', label: SEVERITY_LABEL.info },
];

// By effective status: status-unclear leads carry their last open stage, so they count as winnable.
const WINNABLE: readonly LeadStatus[] = ['new', 'contacted', 'test_drive', 'negotiation', 'order_placed'];

/**
 * Deal value of the distinct leads behind the issues, split into money that can still be won
 * (open, status unclear, or booked and not delivered) and money already lost. Delivered leads
 * count in neither; alerts without leads add nothing.
 */
function stakeSplit(alerts: Alert[]): { winnable: number; lost: number } {
  const leads = new Map<string, { status: LeadStatus; value: number }>();
  for (const a of alerts) for (const l of a.leads) leads.set(l.id, l);
  let winnable = 0;
  let lost = 0;
  for (const l of leads.values()) {
    if (WINNABLE.includes(l.status)) winnable += l.value;
    else if (l.status === 'lost') lost += l.value;
  }
  return { winnable, lost };
}

export function ActionCenter({ alerts, branches, query, range }: Props) {
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [branch, setBranch] = useState('all');
  const [kind, setKind] = useState<AlertKind | 'all'>('all');

  const branchNames = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, b.name])), [branches]);
  const kinds = useMemo(() => [...new Set(alerts.map((a) => a.kind))], [alerts]);

  const visible = alerts.filter(
    (a) =>
      (severity === 'all' || a.severity === severity) &&
      (branch === 'all' || a.branchId === branch || (branch === 'group' && !a.branchId)) &&
      (kind === 'all' || a.kind === kind),
  );

  // Groups keep the alerts' priority order: the kind of the most urgent issue comes first.
  const groups = useMemo(() => {
    const byKind = new Map<AlertKind, Alert[]>();
    for (const a of visible) byKind.set(a.kind, [...(byKind.get(a.kind) ?? []), a]);
    return [...byKind.entries()];
  }, [visible]);

  const today = visible.filter((a) => a.severity === 'critical').length;
  const stake = stakeSplit(visible);
  const filtered = visible.length !== alerts.length;

  const exportCsv = () => {
    const csv = toCsv(visible, [
      { header: 'Priority', value: (a) => SEVERITY_LABEL[a.severity] },
      { header: 'Type', value: (a) => KIND_LABEL[a.kind] },
      { header: 'Branch', value: (a) => (a.branchId ? branchNames[a.branchId] ?? a.branchId : 'Group') },
      { header: 'Owner', value: (a) => (a.owner ? ownerLabel(a.owner) : '') },
      { header: 'Issue', value: (a) => a.title },
      { header: 'Detail', value: (a) => a.detail },
      { header: 'Next step', value: (a) => a.action },
      { header: 'Impact', value: (a) => a.impact },
      { header: 'Lead IDs', value: (a) => a.leads.map((l) => l.id).join('; ') },
      { header: 'Leads', value: (a) => a.leads.map((l) => `${l.customer} (${l.model})`).join('; ') },
    ]);
    downloadCsv(periodFilename('dealerpulse-actions', range), csv);
  };

  return (
    <div className="card p-4 sm:p-5">
      <div className="z-30 mb-4 flex flex-wrap items-center gap-2 bg-white md:sticky md:top-0 md:-mx-5 md:-mt-5 md:rounded-t-xl md:border-b md:border-line md:px-5 md:py-3">
        <div role="group" aria-label="Priority" className="flex flex-wrap rounded-lg border border-line p-0.5">
          {SEVERITIES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={severity === s.id}
              onClick={() => setSeverity(s.id)}
              className={clsx(
                'rounded-md px-2.5 py-1 text-[13px] font-medium transition motion-reduce:transition-none',
                severity === s.id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-canvas',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <label htmlFor="ac-branch" className="sr-only">
          Branch
        </label>
        <select
          id="ac-branch"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          className="rounded-lg border border-line bg-white px-2 py-1.5 text-[13px]"
        >
          <option value="all">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
          <option value="group">Group-wide only</option>
        </select>

        <label htmlFor="ac-kind" className="sr-only">
          Alert type
        </label>
        <select
          id="ac-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as AlertKind | 'all')}
          className="rounded-lg border border-line bg-white px-2 py-1.5 text-[13px]"
        >
          <option value="all">All types</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>

        <button type="button" className="btn ml-auto" onClick={exportCsv} disabled={visible.length === 0}>
          Export CSV
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="num text-[14px] font-medium text-ink" aria-live="polite">
          {visible.length} {visible.length === 1 ? 'issue' : 'issues'} · {formatInr(stake.winnable)} still winnable
          {stake.lost > 0 && ` · ${formatInr(stake.lost)} already lost on these issues`} · {today}{' '}
          {today === 1 ? 'needs' : 'need'} action today
          {filtered && <span className="font-normal text-ink-muted"> (filtered from {alerts.length})</span>}
        </p>
        <AlertCounts alerts={visible} />
      </div>

      {groups.length === 0 ? (
        <AlertList
          alerts={[]}
          query={query}
          branchNames={branchNames}
          emptyTitle="No alerts match these filters"
          emptyBody="Clear a filter to see more."
        />
      ) : (
        <div className="grid gap-4">
          {groups.map(([k, list]) => (
            <details key={k} open className="group/kind">
              <summary className="mb-2 flex cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-ink">
                <span className="text-ink-muted transition group-open/kind:rotate-90 motion-reduce:transition-none" aria-hidden="true">
                  ›
                </span>
                {KIND_LABEL[k]}
                <span className="num rounded-full bg-canvas px-2 py-0.5 text-[12px] font-medium text-ink-muted">{list.length}</span>
              </summary>
              <AlertList alerts={list} query={query} branchNames={branchNames} leadCap={null} />
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
