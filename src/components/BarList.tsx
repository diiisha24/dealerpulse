import clsx from 'clsx';
import { formatPct } from '@/lib/format';
import type { CountRow } from '@/lib/metrics';
import { EmptyState } from './Section';

type Tone = 'neutral' | 'bad' | 'warn' | 'brand';

interface Props {
  rows: CountRow[];
  emptyTitle: string;
  /** Labels to render muted (e.g. "Not recorded"). */
  mutedLabels?: string[];
  /**
   * Base bar colour. Defaults to neutral so colour only marks what matters.
   * Legacy: `tone="warn"` or `tone="bad"` without `highlightTop` keeps the bars neutral and
   * highlights the top bar in that tone (same as `highlightTop`).
   */
  tone?: Tone;
  /**
   * Colour only the top bar. `'bad'` applies only when its share is above 25%; `'warn'` always.
   * Skipped when the top bar is muted or tied with the next one.
   */
  highlightTop?: 'bad' | 'warn';
}

/** A top bar must hold more than this share of the total to be shown in red. */
const BAD_SHARE = 0.25;

const BAR: Record<Tone, string> = {
  neutral: 'bg-ink-soft/50',
  bad: 'bg-bad/80',
  warn: 'bg-warn/80',
  brand: 'bg-brand/80',
};

export function BarList({ rows, emptyTitle, mutedLabels = [], tone = 'neutral', highlightTop }: Props) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} />;

  const legacyHighlight = tone === 'bad' || tone === 'warn' ? tone : undefined;
  const highlight = highlightTop ?? legacyHighlight;
  const base: Tone = legacyHighlight && !highlightTop ? 'neutral' : tone;

  const max = Math.max(...rows.map((r) => r.count));
  const [first, second] = rows;
  const topIsClear =
    !!first && !mutedLabels.includes(first.label) && (second === undefined || first.count > second.count);
  const topTone =
    highlight && topIsClear && (highlight === 'warn' || (first?.share ?? 0) > BAD_SHARE) ? highlight : null;

  return (
    <ul className="grid gap-2.5">
      {rows.map((r, i) => {
        const muted = mutedLabels.includes(r.label);
        const barTone: Tone = i === 0 && topTone ? topTone : base;
        return (
          <li key={r.label} className="min-w-0">
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span
                className={clsx(
                  'min-w-0 truncate',
                  muted ? 'italic text-ink-muted' : 'text-ink-soft',
                  i === 0 && topTone && 'font-medium text-ink',
                )}
                title={r.label}
              >
                {r.label}
              </span>
              <span className="num shrink-0 text-ink">
                {r.count} <span className="text-ink-muted">· {formatPct(r.share)}</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-canvas">
              <div
                className={clsx('h-full rounded-full', muted ? 'bg-ink-muted/40' : BAR[barTone])}
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
