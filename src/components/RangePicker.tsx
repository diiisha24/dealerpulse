'use client';

import clsx from 'clsx';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import type { RangePreset } from '@/lib/range';
import type { MonthRange } from '@/lib/types';

interface Props {
  months: { value: string; label: string }[];
  presets: RangePreset[];
  value: MonthRange;
}

export function RangePicker({ months, presets, value }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const allMonths = presets[0]?.range;
  const apply = (next: MonthRange) => {
    const isAll = allMonths && next.from === allMonths.from && next.to === allMonths.to;
    const url = isAll ? pathname : `${pathname}?from=${next.from}&to=${next.to}`;
    startTransition(() => router.push(url, { scroll: false }));
  };

  const activePreset = presets.find((p) => p.range.from === value.from && p.range.to === value.to)?.id;

  return (
    <div className="flex flex-wrap items-center gap-2 xl:justify-end" aria-busy={pending}>
      <div role="group" aria-label="Time period" className="flex flex-wrap rounded-lg border border-line bg-white p-0.5">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => apply(p.range)}
            aria-pressed={activePreset === p.id}
            className={clsx(
              'rounded-md px-2.5 py-1 text-[13px] font-medium transition',
              activePreset === p.id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-canvas',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 text-[13px] text-ink-muted">
        <label htmlFor="range-from" className="sr-only">
          From month
        </label>
        <select
          id="range-from"
          value={value.from}
          onChange={(e) => apply({ from: e.target.value, to: value.to < e.target.value ? e.target.value : value.to })}
          className="rounded-md border border-line bg-white px-2 py-1 text-[13px] text-ink"
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <span aria-hidden="true">to</span>
        <label htmlFor="range-to" className="sr-only">
          To month
        </label>
        <select
          id="range-to"
          value={value.to}
          onChange={(e) => apply({ from: value.from > e.target.value ? e.target.value : value.from, to: e.target.value })}
          className="rounded-md border border-line bg-white px-2 py-1 text-[13px] text-ink"
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <span
        className={clsx('h-4 w-4 rounded-full border-2 border-brand border-t-transparent', pending ? 'animate-spin' : 'invisible')}
        role="status"
        aria-label={pending ? 'Updating' : undefined}
      />
    </div>
  );
}
