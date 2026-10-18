'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatDate, formatInr, SOURCE_LABEL, STATUS_LABEL } from '@/lib/format';
import { GLOSSARY } from '@/lib/glossary';
import type { LeadRow } from '@/lib/leadRows';
import { COLD_LEAD_DAYS } from '@/lib/thresholds';
import type { LeadStatus } from '@/lib/types';
import { ColHead, ScrollShadow } from './ScrollShadow';
import { EmptyState } from './Section';

type Filter = 'open' | 'order_placed' | 'delivered' | 'lost' | 'all';
type SortKey = 'daysIdle' | 'value' | 'createdAt';

const OPEN: LeadStatus[] = ['new', 'contacted', 'test_drive', 'negotiation'];
const isOpen = (s: LeadStatus) => OPEN.includes(s);
const isClosed = (s: LeadStatus) => s === 'delivered' || s === 'lost';

const FILTERS: { id: Filter; label: string; match: (s: LeadStatus) => boolean }[] = [
  { id: 'open', label: 'Open', match: isOpen },
  { id: 'order_placed', label: 'Booked', match: (s) => s === 'order_placed' },
  { id: 'delivered', label: 'Delivered', match: (s) => s === 'delivered' },
  { id: 'lost', label: 'Lost', match: (s) => s === 'lost' },
  { id: 'all', label: 'All', match: () => true },
];

const STATUS_CHIP: Record<LeadStatus, string> = {
  new: 'bg-brand-soft text-brand-dark',
  contacted: 'bg-brand-soft text-brand-dark',
  test_drive: 'bg-warn-soft text-warn',
  negotiation: 'bg-warn-soft text-warn',
  order_placed: 'bg-good-soft text-good',
  delivered: 'bg-good-soft text-good',
  lost: 'bg-bad-soft/60 text-bad',
};

const SORT_LABEL: Record<SortKey, string> = { daysIdle: 'Longest idle', value: 'Highest value', createdAt: 'Newest' };

// Opaque version of the header and row-hover tints, so the sticky column hides what scrolls under it.
const TINT = 'bg-[image:linear-gradient(rgb(244_246_249/0.6),rgb(244_246_249/0.6))]';
const TINT_HOVER = 'group-hover:bg-[image:linear-gradient(rgb(244_246_249/0.6),rgb(244_246_249/0.6))]';
const STICKY = 'sticky left-0 z-10 bg-white [[data-scrolled=true]_&]:shadow-[inset_-1px_0_0_#e2e6ee]';

/** "Longest idle": leads still in play by idle days, then closed leads by close date, newest first. */
function byIdle(a: LeadRow, b: LeadRow): number {
  const ac = isClosed(a.status);
  const bc = isClosed(b.status);
  if (ac !== bc) return ac ? 1 : -1;
  if (ac) return b.lastActivityAt.localeCompare(a.lastActivityAt);
  return b.daysIdle - a.daysIdle;
}

interface Props {
  rows: LeadRow[];
  showRep?: boolean;
  query: string;
  filename: string;
  /** Rows shown at first and added by each "Show more". */
  pageSize?: number;
}

export function LeadTable({ rows, showRep = true, query, filename, pageSize = 25 }: Props) {
  const [filter, setFilter] = useState<Filter>(() => (rows.some((r) => isOpen(r.status)) ? 'open' : 'all'));
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('daysIdle');
  const [limit, setLimit] = useState(pageSize);

  const counts = useMemo(() => {
    const c = {} as Record<Filter, number>;
    for (const f of FILTERS) c[f.id] = rows.filter((r) => f.match(r.status)).length;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => f.match(r.status))
      .filter(
        (r) =>
          !q ||
          r.customer.toLowerCase().includes(q) ||
          r.model.toLowerCase().includes(q) ||
          r.repName.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        if (sort === 'value') return b.value - a.value;
        if (sort === 'createdAt') return b.createdAt.localeCompare(a.createdAt);
        return byIdle(a, b);
      });
  }, [rows, filter, search, sort]);

  const exportCsv = () => {
    const csv = toCsv(visible, [
      { header: 'Lead ID', value: (r) => r.id },
      { header: 'Customer', value: (r) => r.customer },
      { header: 'Phone (masked)', value: (r) => r.phone },
      { header: 'Source', value: (r) => SOURCE_LABEL[r.source] },
      { header: 'Model', value: (r) => r.model },
      { header: 'Status', value: (r) => STATUS_LABEL[r.status] },
      { header: 'Status unclear', value: (r) => (r.statusUnclear ? 'Yes' : 'No') },
      { header: 'Sales officer', value: (r) => r.repName },
      { header: 'Created', value: (r) => formatDate(r.createdAt) },
      { header: 'Last activity', value: (r) => formatDate(r.lastActivityAt) },
      { header: 'Deal value (INR)', value: (r) => r.value },
      { header: 'Lost reason', value: (r) => r.lostReason },
      { header: 'Latest note', value: (r) => r.lastNote },
    ]);
    downloadCsv(filename, csv);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Lead status" className="flex flex-wrap rounded-lg border border-line p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFilter(f.id);
                setLimit(pageSize);
              }}
              aria-pressed={filter === f.id}
              className={clsx(
                'rounded-md px-2.5 py-1 text-[13px] font-medium transition motion-reduce:transition-none',
                filter === f.id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-canvas',
              )}
            >
              {f.label} <span className={clsx('num', filter === f.id ? 'text-white/70' : 'text-ink-muted')}>{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <label htmlFor="lead-search" className="sr-only">
          Search leads
        </label>
        <input
          id="lead-search"
          type="search"
          placeholder="Search customer, model, rep"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(pageSize);
          }}
          maxLength={60}
          className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] placeholder:text-ink-muted sm:max-w-[240px]"
        />
        <label htmlFor="lead-sort" className="sr-only">
          Sort leads
        </label>
        <select
          id="lead-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-line bg-white px-2 py-1.5 text-[13px]"
        >
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABEL[k]}
            </option>
          ))}
        </select>
        <button type="button" onClick={exportCsv} className="btn ml-auto" disabled={visible.length === 0}>
          Export CSV
        </button>
      </div>

      {filter === 'all' && counts.open === 0 && rows.length > 0 && !search && (
        <p className="mb-3 text-[13px] text-ink-muted">No open leads; showing all {rows.length}.</p>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title={search ? `No leads match "${search}"` : 'No leads in this view'}
          body={search ? 'Try a different name or clear the search.' : 'Switch to another status to see more leads.'}
        />
      ) : (
        <>
          <ScrollShadow className="-mx-4 sm:-mx-5">
            <table className="table-base whitespace-nowrap">
              <thead>
                <tr>
                  <th className={clsx(STICKY, TINT, '!bg-white pl-4 sm:pl-5')}>Customer</th>
                  <th>Model</th>
                  <th>Status</th>
                  {showRep && <th>Owner</th>}
                  <th>Latest note</th>
                  <th className="text-right">
                    <ColHead
                      full="Idle / closed"
                      short="Idle"
                      tip={{
                        label: 'Idle / closed',
                        definition: `Days since the last activity for leads still in play (amber at ${COLD_LEAD_DAYS}+ days for open leads), or the close date for delivered and lost leads.`,
                      }}
                    />
                  </th>
                  <th className="pr-4 text-right sm:pr-5">Value</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, limit).map((r) => {
                  const open = isOpen(r.status);
                  const closed = isClosed(r.status);
                  return (
                    <tr key={r.id} className="group hover:bg-canvas/60">
                      <td className={clsx(STICKY, TINT_HOVER, 'pl-4 sm:pl-5')}>
                        <div className="font-medium">{r.customer}</div>
                        <div className="num text-[12px] text-ink-muted">
                          {r.phone} · {SOURCE_LABEL[r.source]}
                        </div>
                      </td>
                      <td className="text-ink-soft">{r.model}</td>
                      <td>
                        <span className={clsx('rounded px-1.5 py-0.5 text-[12px] font-medium', STATUS_CHIP[r.status])}>
                          {STATUS_LABEL[r.status]}
                        </span>
                        {r.statusUnclear && (
                          <span
                            className="ml-1 rounded bg-warn-soft px-1.5 py-0.5 text-[12px] font-medium text-warn"
                            title={GLOSSARY.status_unclear.definition}
                          >
                            {GLOSSARY.status_unclear.label}
                          </span>
                        )}
                      </td>
                      {showRep && (
                        <td>
                          <Link href={`/reps/${r.repId}${query}`} className="text-ink-soft hover:text-brand">
                            {r.repName}
                          </Link>
                        </td>
                      )}
                      <td className="max-w-[260px] truncate text-[13px] text-ink-muted" title={r.lostReason ?? r.lastNote}>
                        {r.status === 'lost' && r.lostReason ? r.lostReason : r.lastNote}
                      </td>
                      <td
                        className={clsx(
                          'num text-right',
                          open && r.daysIdle >= COLD_LEAD_DAYS ? 'font-semibold text-warn' : !open && 'text-ink-muted',
                        )}
                      >
                        {closed ? `Closed ${formatDate(r.lastActivityAt)}` : `${r.daysIdle} d`}
                      </td>
                      <td className="num pr-4 text-right sm:pr-5">{formatInr(r.value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollShadow>
          <div className="mt-3 flex items-center justify-between text-[13px] text-ink-muted">
            <span className="num">
              Showing {Math.min(limit, visible.length)} of {visible.length}
            </span>
            {limit < visible.length && (
              <button type="button" className="btn" onClick={() => setLimit((l) => l + pageSize)}>
                Show more
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
