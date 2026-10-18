import clsx from 'clsx';
import { formatPct, STATUS_LABEL } from '@/lib/format';
import type { FunnelStep } from '@/lib/metrics';
import { EmptyState } from './Section';

/** Horizontal funnel. The biggest stage-to-stage drop is highlighted. Bars are solid so labels keep 4.5:1 contrast. */
export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const total = steps[0]?.count ?? 0;
  if (total === 0) return <EmptyState title="No leads in this period" body="Pick a wider time range to see the funnel." />;

  let worstIndex = -1;
  let worstRate = Infinity;
  steps.forEach((s, i) => {
    if (i > 0 && Number.isFinite(s.fromPrevious) && s.fromPrevious < worstRate) {
      worstRate = s.fromPrevious;
      worstIndex = i;
    }
  });

  return (
    <ol className="grid gap-2">
      {steps.map((s, i) => {
        const width = Math.max(s.ofTotal * 100, 1);
        const inside = width >= 12;
        const last = i === steps.length - 1;
        const label = last && s.stage === 'delivered' ? `${STATUS_LABEL[s.stage]} (to date)` : STATUS_LABEL[s.stage];
        return (
        <li key={s.stage} className="grid grid-cols-[96px_1fr] items-center gap-x-3 gap-y-0.5 sm:grid-cols-[128px_1fr_170px]">
          <span className="text-[13px] font-medium leading-tight text-ink-soft">{label}</span>
          <div className="relative h-7 rounded bg-canvas">
            <div
              className={clsx('absolute inset-y-0 left-0 rounded', last ? 'bg-good' : 'bg-brand')}
              style={{ width: `${width}%` }}
            />
            <span
              className={clsx(
                'num absolute inset-y-0 flex items-center text-[12px] font-semibold',
                inside ? 'left-2 text-white' : 'text-ink',
              )}
              style={inside ? undefined : { left: `calc(${width}% + 6px)` }}
            >
              {s.count}
            </span>
          </div>
          <span className="num col-start-2 text-[12px] text-ink-muted sm:col-start-auto sm:text-right">
            {i === 0 ? (
              '100% of leads'
            ) : (
              <span className={clsx(i === worstIndex && 'font-semibold text-bad')}>
                {formatPct(s.fromPrevious)} moved on
              </span>
            )}
            {s.lostHere > 0 && <span className="text-ink-muted"> · {s.lostHere} lost here</span>}
          </span>
        </li>
        );
      })}
    </ol>
  );
}
