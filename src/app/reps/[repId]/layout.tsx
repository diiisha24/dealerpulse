import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getStore } from '@/lib/data';

/**
 * Validates the rep ID outside this segment's loading boundary. `loading.tsx` wraps only the
 * page, so an unknown ID reaches `notFound()` before anything streams and the response is a 404.
 */
export default function RepLayout({ children, params }: { children: ReactNode; params: { repId: string } }) {
  if (!getStore().repById.has(params.repId)) notFound();
  return children;
}
