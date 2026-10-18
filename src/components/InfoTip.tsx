'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { term as glossaryTerm, type TermId } from '@/lib/glossary';

type Props =
  | {
      /** A glossary term. The label and definition come from `glossary.ts`. */
      term: TermId;
      /** Overrides the glossary label in the accessible name and popover heading. */
      label?: string;
      definition?: never;
      className?: string;
    }
  | {
      term?: never;
      label: string;
      definition: string;
      className?: string;
    };

const POPOVER_WIDTH = 256; // matches w-64
const EDGE = 8; // minimum gap to the viewport edge
const GAP = 6; // gap between the button and the popover
const CLOSE_DELAY_MS = 120;

interface Position {
  left: number;
  top: number;
}

/**
 * A small ⓘ button that explains a metric. Opens on hover, keyboard focus and tap; closes on
 * Esc, outside click, blur or mouse leave. The popover uses fixed positioning so it is never
 * clipped by scrolling tables, and it is clamped and flipped to stay inside the viewport.
 */
export function InfoTip(props: Props) {
  const entry = props.term ? glossaryTerm(props.term) : null;
  const label = props.label ?? entry?.label ?? '';
  const definition = props.definition ?? entry?.definition ?? '';

  const id = useId();
  const tipId = `infotip-${id.replace(/:/g, '')}`;
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerType = useRef<string>('');
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position>({ left: 0, top: 0 });

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const place = useCallback(() => {
    const button = buttonRef.current;
    const tip = tipRef.current;
    if (!button || !tip) return;
    const rect = button.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const width = Math.min(POPOVER_WIDTH, vw - EDGE * 2);
    const height = tip.offsetHeight;
    const centre = rect.left + rect.width / 2;
    const left = Math.min(Math.max(centre - width / 2, EDGE), vw - width - EDGE);
    const below = rect.bottom + GAP;
    const above = rect.top - height - GAP;
    const top = below + height > vh - EDGE && above >= EDGE ? above : below;
    setPos({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelClose();
        setOpen(false);
      }
    };
    const onOutside = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { capture: true, passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onOutside);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, { capture: true });
    };
  }, [open, place, cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  const onPointerEnter = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    cancelClose();
    setOpen(true);
  };
  const onPointerLeave = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  if (!label || !definition) return null;

  return (
    <span
      ref={wrapRef}
      className={clsx('relative inline-flex align-middle', props.className)}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={`What is ${label}?`}
        aria-describedby={tipId}
        aria-expanded={open}
        className="-m-[15px] inline-flex items-center justify-center rounded-full p-[15px] text-ink-muted hover:text-ink focus-visible:text-ink focus-visible:outline-none [&:focus-visible>svg]:rounded-full [&:focus-visible>svg]:ring-2 [&:focus-visible>svg]:ring-brand"
        onPointerDown={(e) => {
          pointerType.current = e.pointerType;
        }}
        onFocus={(e) => {
          if (e.currentTarget.matches(':focus-visible')) setOpen(true);
        }}
        onBlur={(e) => {
          if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          cancelClose();
          if (pointerType.current === 'mouse') setOpen(true);
          else setOpen((o) => !o);
          pointerType.current = '';
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 7.25v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="4.75" r="0.9" fill="currentColor" />
        </svg>
      </button>
      <span
        ref={tipRef}
        id={tipId}
        role="tooltip"
        onClick={(e) => e.stopPropagation()}
        style={{ left: pos.left, top: pos.top }}
        className={clsx(
          'fixed z-50 block w-64 max-w-[calc(100vw-16px)] rounded-lg bg-ink p-2.5 text-left text-[12px] font-normal normal-case leading-snug tracking-normal text-white shadow-lg',
          'whitespace-normal transition-opacity duration-150 motion-reduce:transition-none',
          open ? 'visible opacity-100' : 'pointer-events-none invisible opacity-0',
        )}
      >
        <span className="mb-0.5 block font-semibold">{label}</span>
        <span className="block text-white/90">{definition}</span>
      </span>
    </span>
  );
}
