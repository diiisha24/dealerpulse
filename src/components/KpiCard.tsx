import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { TermId } from '@/lib/glossary';
import { InfoTip } from './InfoTip';

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

interface Props {
  label: string;
  value: string;
  hint?: ReactNode;
  /** A second, muted line under the hint (e.g. "targets ≈ 9× actual"). */
  note?: ReactNode;
  tone?: Tone;
  /** 0..1 progress toward a goal; draws a bar. */
  progress?: number;
  /** Rendered as a red chip (e.g. "3 stuck orders"). */
  badge?: string;
  /** Glossary term explained by an InfoTip next to the label. */
  term?: TermId;
  /** Marks a figure that reflects the current state, not the selected period ("As of 31 Dec 2025"). */
  asOf?: string;
}

const TONE_TEXT: Record<Tone, string> = {
  good: 'text-good',
  warn: 'text-warn',
  bad: 'text-bad',
  neutral: 'text-ink-muted',
};

const TONE_BAR: Record<Tone, string> = {
  good: 'bg-good',
  warn: 'bg-warn',
  bad: 'bg-bad',
  neutral: 'bg-brand',
};

const TONE_DOT: Record<Tone, string> = {
  good: 'bg-good',
  warn: 'bg-warn',
  bad: 'bg-bad',
  neutral: 'bg-line',
};

export function KpiCard({ label, value, hint, note, tone = 'neutral', progress, badge, term, asOf }: Props) {
  const pct = progress !== undefined && Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 1) : null;
  return (
    <div className="card flex min-w-0 flex-col gap-1.5 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow inline-flex min-w-0 items-center gap-1.5">
          {label}
          {term && <InfoTip term={term} label={label} />}
        </span>
        {tone !== 'neutral' && <span className={clsx('h-2 w-2 shrink-0 rounded-full', TONE_DOT[tone])} aria-hidden="true" />}
      </div>
      <div className="num whitespace-nowrap text-[24px] font-semibold leading-tight tracking-tight text-ink sm:text-[26px]">{value}</div>
      {pct !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas" aria-hidden="true">
          <div className={clsx('h-full rounded-full', TONE_BAR[tone])} style={{ width: `${Math.max(pct * 100, 1.5)}%` }} />
        </div>
      )}
      {(hint || badge) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          {hint && <span className={clsx(TONE_TEXT[tone], tone === 'neutral' && 'text-ink-muted')}>{hint}</span>}
          {badge && (
            <span className="whitespace-nowrap rounded-full bg-bad-soft px-2 py-0.5 text-[12px] font-medium text-bad">{badge}</span>
          )}
        </div>
      )}
      {note && <div className="text-[12px] text-ink-muted">{note}</div>}
      {asOf && <div className="mt-auto pt-0.5 text-[11px] font-medium text-ink-muted">{asOf}</div>}
    </div>
  );
}

/**
 * Attainment of a target. Against peers: under half the group pace is red, under
 * pace is amber. Beating weak peers never turns a branch green while it is still
 * below half its own target.
 */
export function attainmentTone(value: number, benchmark?: number): Tone {
  if (!Number.isFinite(value)) return 'neutral';
  if (benchmark !== undefined && Number.isFinite(benchmark)) {
    if (value < benchmark * 0.5) return 'bad';
    if (value < benchmark * 0.9) return 'warn';
    return value >= 0.5 ? 'good' : 'warn';
  }
  if (value >= 0.9) return 'good';
  if (value >= 0.6) return 'warn';
  return 'bad';
}
