import { type TargetRealism, targetNoteText } from '@/lib/targets';
import { InfoTip } from './InfoTip';

/**
 * Explains why every attainment figure is low: the targets are several times what anyone delivers.
 * Renders nothing when targets look plausible, or for a rep (no targets).
 */
export function TargetNote({ realism, subject }: { realism: TargetRealism; subject?: string }) {
  const text = targetNoteText(realism, subject);
  if (!text) return null;
  return (
    <aside
      aria-label="About the targets"
      className="flex items-start gap-3 rounded-lg border border-line bg-white px-4 py-3 text-[13px] leading-relaxed text-ink-soft shadow-card"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-warn">
        <path d="M8 1.5 15 14H1L8 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="11.75" r="0.9" fill="currentColor" />
      </svg>
      <p className="min-w-0">
        <span className="mr-1.5 inline-flex items-center gap-1.5 font-semibold text-ink">
          About the targets
          <InfoTip term="attainment" />
        </span>
        {text}
      </p>
    </aside>
  );
}
