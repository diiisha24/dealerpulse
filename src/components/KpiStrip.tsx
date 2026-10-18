import { formatInr, formatNumber, formatPct, plural } from '@/lib/format';
import { term } from '@/lib/glossary';
import type { Summary } from '@/lib/metrics';
import { NOTE_MIN_MULTIPLE, overallMultiple } from '@/lib/targetMultiples';
import { InfoTip } from './InfoTip';
import { attainmentTone, KpiCard, type Tone } from './KpiCard';

interface Props {
  s: Summary;
  /** Group figures to compare a branch or rep against. Omit on the group view. */
  benchmark?: Summary;
  /** What the benchmark is, for hints like "+4 pts vs branch". */
  benchmarkLabel?: string;
  /** "As of 31 Dec 2025": marks Open pipeline, cold and stuck as current state, not the period. */
  asOf?: string;
}

function compareTone(value: number, benchmark: number | undefined, higherIsBetter: boolean): Tone {
  if (benchmark === undefined || !Number.isFinite(value) || !Number.isFinite(benchmark)) return 'neutral';
  const diff = (value - benchmark) * (higherIsBetter ? 1 : -1);
  if (diff >= -0.02) return 'good';
  if (diff >= -0.1) return 'warn';
  return 'bad';
}

export function KpiStrip({ s, benchmark, benchmarkLabel = 'group', asOf }: Props) {
  const hasTarget = s.targetUnits !== null;
  const multiple = overallMultiple(s.targetUnits, s.units);
  const targetNote =
    multiple !== null && Math.round(multiple) >= NOTE_MIN_MULTIPLE ? `targets ≈ ${Math.round(multiple)}× actual` : undefined;
  const vsGroup = (value: number, base: number | undefined): string | undefined => {
    if (base === undefined || !Number.isFinite(value) || !Number.isFinite(base)) return undefined;
    const pts = Math.round((value - base) * 100);
    if (pts === 0) return `in line with ${benchmarkLabel}`;
    return `${pts > 0 ? '+' : ''}${pts} pts vs ${benchmarkLabel}`;
  };
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 min-[1360px]:grid-cols-6">
      <KpiCard
        label={term('units_delivered').label}
        term="units_delivered"
        value={String(s.units)}
        progress={hasTarget ? s.unitAttainment : undefined}
        tone={hasTarget ? attainmentTone(s.unitAttainment, benchmark?.unitAttainment) : 'neutral'}
        hint={
          hasTarget && s.targetUnits !== null
            ? `${formatPct(s.unitAttainment)} of ${formatNumber(s.targetUnits)} target`
            : `${plural(s.orders, 'order')} booked`
        }
        note={targetNote}
      />
      <KpiCard
        label="Revenue delivered"
        value={formatInr(s.revenue)}
        progress={hasTarget ? s.revenueAttainment : undefined}
        tone={hasTarget ? attainmentTone(s.revenueAttainment, benchmark?.revenueAttainment) : 'neutral'}
        hint={
          hasTarget && s.targetRevenue !== null
            ? `${formatPct(s.revenueAttainment)} of ${formatInr(s.targetRevenue)}`
            : Number.isFinite(s.avgDealValue)
              ? `avg deal ${formatInr(s.avgDealValue)}`
              : undefined
        }
      />
      <KpiCard
        label={term('lead_to_order').label}
        term="lead_to_order"
        value={formatPct(s.conversion)}
        tone={compareTone(s.conversion, benchmark?.conversion, true)}
        hint={vsGroup(s.conversion, benchmark?.conversion) ?? `of ${plural(s.leads, 'new lead')}`}
      />
      <KpiCard
        label={term('leads_lost').label}
        term="leads_lost"
        value={formatPct(s.lossRate)}
        tone={compareTone(s.lossRate, benchmark?.lossRate, false)}
        hint={vsGroup(s.lossRate, benchmark?.lossRate) ?? 'of leads created in period'}
      />
      <KpiCard
        label={term('days_to_deliver').label}
        term="days_to_deliver"
        value={Number.isFinite(s.avgDaysToDeliver) ? `${s.avgDaysToDeliver.toFixed(1)} days` : '–'}
        tone={Number.isFinite(s.onTimeRate) ? (s.onTimeRate >= 0.7 ? 'good' : s.onTimeRate >= 0.5 ? 'warn' : 'bad') : 'neutral'}
        hint={Number.isFinite(s.onTimeRate) ? `${formatPct(s.onTimeRate)} without delay` : 'no deliveries'}
      />
      <KpiCard
        label={term('open_pipeline').label}
        term="open_pipeline"
        value={formatInr(s.openPipelineValue)}
        tone={s.coldLeads > 0 || s.stuckOrders > 0 ? 'warn' : 'neutral'}
        hint={
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            {plural(s.openLeads, 'lead')} · {s.coldLeads} cold
            <InfoTip term="cold_lead" />
          </span>
        }
        badge={s.stuckOrders > 0 ? plural(s.stuckOrders, 'stuck order') : undefined}
        note={
          s.statusUnclear > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              incl. {s.statusUnclear} status unclear
              <InfoTip term="status_unclear" />
            </span>
          ) : undefined
        }
        asOf={asOf}
      />
    </div>
  );
}
