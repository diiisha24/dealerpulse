import clsx from 'clsx';

interface Props {
  title: string;
  /** Short noun shown above a takeaway title (e.g. "Sales funnel" above "Biggest drop is …"). */
  kicker?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Marks content that reflects the current state rather than the selected period. */
  asOfNote?: string;
}

export function Section({ title, kicker, description, actions, children, className, asOfNote }: Props) {
  return (
    <section className={clsx('card min-w-0 p-4 sm:p-5', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {kicker && <p className="eyebrow mb-1">{kicker}</p>}
          <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
            {title}
            {asOfNote && (
              <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink-muted">{asOfNote}</span>
            )}
          </h2>
          {description && <p className="mt-0.5 text-[13px] text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink-soft">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[13px] text-ink-muted">{body}</p>}
    </div>
  );
}
