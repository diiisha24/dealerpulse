import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getStore } from '@/lib/data';

/**
 * Validates the branch ID outside this segment's loading boundary. `loading.tsx` wraps only the
 * page, so an unknown ID reaches `notFound()` before anything streams and the response is a 404.
 */
export default function BranchLayout({ children, params }: { children: ReactNode; params: { branchId: string } }) {
  if (!getStore().branchById.has(params.branchId)) notFound();
  return children;
}
