'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

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

  const main = [
    { href: '/', label: 'Overview' },
    { href: '/actions', label: 'Action center' },
  ];

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <aside className="sticky top-0 z-20 bg-ink text-white lg:h-screen lg:w-60 lg:shrink-0">
      <div className="flex items-center gap-4 px-4 py-3 lg:block lg:px-5 lg:py-6">
        <Link href={`/${query}`} className="flex shrink-0 items-center gap-2">
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <rect width="26" height="26" rx="7" fill="#1f4fd1" />
            <path d="M5 14h4l2.5-6 3 11 2.5-5H21" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[15px] font-semibold tracking-tight">DealerPulse</span>
        </Link>

        <nav aria-label="Main" className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto lg:mx-0 lg:mt-8 lg:flex-col lg:overflow-visible">
          {main.map((item) => (
            <Link
              key={item.href}
              href={`${item.href}${query}`}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={clsx(
                'whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition',
                isActive(item.href) ? 'bg-white/15 font-medium text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
              )}
            >
              {item.label}
            </Link>
          ))}

          <p className="mt-6 hidden px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40 lg:block">
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
                  'whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition',
                  isActive(href) ? 'bg-white/15 font-medium text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
                )}
              >
                {b.name.replace(' Toyota', '')}
                <span className="ml-1.5 hidden text-xs text-white/40 lg:inline">{b.city}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
