import Link from 'next/link';
import { getStore } from '@/lib/data';
import { formatDate, formatMonth } from '@/lib/format';
import { buildPresets } from '@/lib/range';
import type { MonthRange } from '@/lib/types';
import { RangePicker } from './RangePicker';

export interface Crumb {
  label: string;
  href?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  crumbs?: Crumb[];
  range: MonthRange;
  /** Hide the range picker on pages whose content does not depend on it. */
  showRange?: boolean;
}

export function PageHeader({ title, subtitle, crumbs, range, showRange = true }: Props) {
  const store = getStore();
  const months = store.months.map((m) => ({ value: m, label: formatMonth(m) }));

  return (
    <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1.5">
            <ol className="flex flex-wrap items-center gap-1 text-[13px] text-ink-muted">
              {crumbs.map((c, i) => (
                <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                  {c.href ? (
                    <Link href={c.href} className="hover:text-brand">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="text-ink-soft">
                      {c.label}
                    </span>
                  )}
                  {i < crumbs.length - 1 && <span aria-hidden="true">/</span>}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[26px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-col gap-1.5 xl:shrink-0 xl:items-end">
        {showRange && <RangePicker months={months} presets={buildPresets(store.months)} value={range} />}
        <p className="text-xs text-ink-muted">Data as of {formatDate(store.asOf)}</p>
      </div>
    </header>
  );
}
