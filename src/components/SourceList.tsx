import clsx from 'clsx';
import { formatInr, formatPct, SOURCE_LABEL } from '@/lib/format';
import type { SourceRow } from '@/lib/metrics';
import { InfoTip } from './InfoTip';
import { EmptyState } from './Section';

/** Lead sources ranked by volume, with conversion so quality and quantity read together. */
export function SourceList({ rows }: { rows: SourceRow[] }) {
  if (rows.length === 0) return <EmptyState title="No leads in this period" />;
  const finite = rows.filter((r) => Number.isFinite(r.conversion));
  const best = finite.reduce((a, b) => (b.conversion > a.conversion ? b : a), finite[0]!);
  const worst = finite.reduce((a, b) => (b.conversion < a.conversion ? b : a), finite[0]!);

  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Source</th>
            <th className="text-right">Leads</th>
            <th className="text-right">Lead → order</th>
            <th className="text-right">
              <span className="inline-flex items-center gap-1.5">
                Delivered revenue (cohort)
                <InfoTip
                  label="Delivered revenue (cohort)"
                  definition="Revenue from cars delivered to leads created in this period, including deliveries after it ended. It can differ from the revenue KPI, which counts cars delivered during the period."
                />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.source}>
              <td className="whitespace-nowrap">{SOURCE_LABEL[r.source]}</td>
              <td className="num text-right">{r.leads}</td>
              <td
                className={clsx(
                  'num text-right',
                  r === best && 'font-semibold text-good',
                  r === worst && best !== worst && 'font-semibold text-bad',
                )}
              >
                {formatPct(r.conversion)}
              </td>
              <td className="num whitespace-nowrap text-right text-ink-soft">{formatInr(r.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
