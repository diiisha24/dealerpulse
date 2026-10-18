'use client';

import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import { InfoTip } from './InfoTip';

/**
 * Horizontal scroll container for wide tables. A fade on the right edge tells the reader there are
 * more columns, and disappears at the scroll end. While scrolled, `data-scrolled="true"` lets a
 * sticky first column draw its divider.
 */
export function ScrollShadow({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const start = el.scrollLeft > 1;
      const end = max > 1 && el.scrollLeft < max - 1;
      setEdge((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, []);

  return (
    <div className={clsx('relative', className)}>
      {/* `relative` keeps absolutely positioned content (sr-only text, bar ticks) clipped by this scroller. */}
      <div ref={ref} data-scrolled={edge.start} className="relative overflow-x-auto overscroll-x-contain">
        {children}
      </div>
      <div
        aria-hidden="true"
        className={clsx(
          'pointer-events-none absolute inset-y-0 right-0 z-20 w-10 bg-gradient-to-l from-white to-transparent',
          'transition-opacity duration-150 motion-reduce:transition-none',
          edge.end ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}

type TipProps = ComponentProps<typeof InfoTip>;

/**
 * A column header with a short label below `lg` and the full label from `lg` up. The InfoTip
 * carries the full name and its definition at every width.
 */
export function ColHead({ full, short, tip }: { full: string; short?: string; tip?: TipProps }) {
  return (
    <span className="inline-flex items-center gap-1">
      {short ? (
        <>
          <abbr title={full} className="no-underline lg:hidden">
            {short}
          </abbr>
          <span className="hidden lg:inline">{full}</span>
        </>
      ) : (
        full
      )}
      {tip && <InfoTip {...tip} />}
    </span>
  );
}

/**
 * A table row that opens `href` when clicked anywhere. Keyboard users reach it through the one
 * link inside the row (the name), so the row adds no tab stop of its own. Modifier and middle
 * clicks open a new tab, like a normal link; clicks on inner controls and text selection are left alone.
 */
export function ClickableRow({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();

  const open = (e: MouseEvent<HTMLTableRowElement>, newTab: boolean) => {
    if (e.defaultPrevented) return;
    if ((e.target as Element).closest('a, button, input, select, textarea, label, [role="tooltip"]')) return;
    if (window.getSelection()?.toString()) return;
    if (newTab) window.open(href, '_blank', 'noopener');
    else router.push(href);
  };

  return (
    <tr
      className={clsx('group cursor-pointer transition-colors hover:bg-canvas/60 motion-reduce:transition-none', className)}
      onClick={(e) => open(e, e.metaKey || e.ctrlKey || e.shiftKey)}
      onAuxClick={(e) => {
        if (e.button === 1) open(e, true);
      }}
    >
      {children}
    </tr>
  );
}
