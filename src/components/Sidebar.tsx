'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';

interface NavBranch {
  id: string;
  name: string;
  city: string;
}

function useRangeQuery(): string {
  const params = useSearchParams();
  const from = params.get('from');
  const to = params.get('to');
  return from && to ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : '';
}

export function Sidebar({ branches }: { branches: NavBranch[] }) {
  const pathname = usePathname();
  const query = useRangeQuery();
  const [menuOpen, setMenuOpen] = useState(false);

  const main = [
    { href: '/', label: 'Overview' },
    { href: '/actions', label: 'Action center' },
  ];

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <aside className="sticky top-0 z-20 bg-ink text-white lg:h-screen lg:w-60 lg:shrink-0">
      <div className="px-4 py-3 lg:px-5 lg:py-6">
        <div className="flex items-center justify-between gap-4">
          <Link href={`/${query}`} className="flex shrink-0 items-center gap-2" onClick={() => setMenuOpen(false)}>
            <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
              <rect width="26" height="26" rx="7" fill="#1f4fd1" />
              <path d="M5 14h4l2.5-6 3 11 2.5-5H21" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[15px] font-semibold tracking-tight">DealerPulse</span>
          </Link>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:ring-offset-ink lg:hidden"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>

        <nav
          id="primary-navigation"
          aria-label="Main"
          className={clsx(
            'min-w-0 flex-col gap-1 lg:mt-8 lg:flex',
            menuOpen ? 'mt-3 flex border-t border-white/15 pt-3' : 'hidden',
          )}
        >
          {main.map((item) => (
            <Link
              key={item.href}
              href={`${item.href}${query}`}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={clsx(
                'rounded-md px-3 py-2 text-sm transition lg:whitespace-nowrap lg:py-1.5',
                isActive(item.href) ? 'bg-white/15 font-medium text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
              )}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}

          <p className="mt-4 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40 lg:mt-6">
            Branches
          </p>
          {branches.map((b) => {
            const href = `/branches/${b.id}`;
            return (
              <Link
                key={b.id}
                href={`${href}${query}`}
                aria-current={isActive(href) ? 'page' : undefined}
                className={clsx(
                  'rounded-md px-3 py-2 text-sm transition lg:whitespace-nowrap lg:py-1.5',
                  isActive(href) ? 'bg-white/15 font-medium text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
                )}
                onClick={() => setMenuOpen(false)}
              >
                {b.name.replace(' Toyota', '')}
                {' · '}
                <span className="text-xs text-white/50">{b.city}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
