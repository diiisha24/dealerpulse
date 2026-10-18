'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Briefing, BriefingPart } from '@/lib/narrative';
import { CopyButton } from './CopyButton';

const ROLE_LABEL = { branch_manager: 'Branch manager', sales_officer: 'Sales officer' } as const;

type DoPart = Extract<BriefingPart, { kind: 'do' }>;

function ownerText(part: DoPart): string | null {
  return part.owner ? `${part.owner.name} (${ROLE_LABEL[part.owner.role]})` : null;
}

function OpenLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="font-medium text-brand underline-offset-2 hover:underline">
      {label}
    </Link>
  );
}

/** Keeps the current query string (range and any future filters) on the link. */
function QueryLink({ path, label }: { path: string; label: string }) {
  const params = useSearchParams();
  const qs = params?.toString() ?? '';
  return <OpenLink href={qs ? `${path}?${qs}` : path} label={label} />;
}

/** Plain-text version for the copy button: What, Why, then Do this first. */
function toText(briefing: Briefing): string {
  const lines = [briefing.headline];
  for (const p of briefing.parts) {
    if (p.kind === 'what') lines.push(`• ${p.text}`);
    if (p.kind === 'why') lines.push(`Why: ${p.text}`);
    if (p.kind === 'do') {
      const owner = ownerText(p);
      lines.push(`Do this first: ${p.text}${owner ? ` Owner: ${owner}.` : ''}`);
    }
  }
  return lines.join('\n');
}

/**
 * What / Why / "Do this first" briefing. `query` keeps the current range on the
 * "Open …" link; when it is not passed, the card reads it from the URL.
 */
export function BriefingCard({
  briefing,
  title = 'Briefing',
  query,
}: {
  briefing: Briefing;
  title?: string;
  query?: string;
}) {
  const what = briefing.parts.filter((p) => p.kind === 'what');
  const why = briefing.parts.find((p) => p.kind === 'why');
  const act = briefing.parts.find((p): p is DoPart => p.kind === 'do');
  const owner = act ? ownerText(act) : null;

  return (
    <section className="card relative overflow-hidden p-5" aria-labelledby="briefing-headline">
      <div className="absolute inset-y-0 left-0 w-1 bg-brand" aria-hidden="true" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="eyebrow">{title}</p>
        <CopyButton text={toText(briefing)} label="Copy summary" />
      </div>
      <h2 id="briefing-headline" className="mt-2 text-lg font-semibold leading-snug text-ink sm:text-xl">
        {briefing.headline}
      </h2>

      {what.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ink-muted">What&apos;s happening</p>
          <ul className="mt-1 grid gap-1.5 text-[14px] leading-relaxed text-ink-soft">
            {what.map((p) => (
              <li key={p.text} className="flex gap-2">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-muted" aria-hidden="true" />
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {why && (
        <div className="mt-3">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ink-muted">Why</p>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{why.text}</p>
        </div>
      )}

      {act && (
        <div className="mt-4 rounded-lg bg-bad-soft/60 px-4 py-3">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ink-soft">Do this first</p>
          <p className="mt-1 text-[14px] font-semibold leading-relaxed text-ink">{act.text}</p>
          {(owner || act.href) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-soft">
              {owner && <span>Owner: {owner}</span>}
              {act.href &&
                act.linkLabel &&
                (query !== undefined ? (
                  <OpenLink href={`${act.href}${query}`} label={act.linkLabel} />
                ) : (
                  // useSearchParams needs a Suspense boundary; the fallback links without the query.
                  <Suspense fallback={<OpenLink href={act.href} label={act.linkLabel} />}>
                    <QueryLink path={act.href} label={act.linkLabel} />
                  </Suspense>
                ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
