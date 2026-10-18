function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-line/70 motion-reduce:animate-none ${className}`} />;
}

/**
 * The loading skeleton shared by every route segment. It lives here, not in a root `loading.tsx`,
 * because a root loading boundary starts streaming (HTTP 200) before a page can call `notFound()`.
 */
export function PageSkeleton({ label = 'Loading dashboard' }: { label?: string }) {
  return (
    <div aria-busy="true" aria-label={label}>
      <div className="mb-6 flex flex-col gap-3">
        <Block className="h-4 w-32" />
        <Block className="h-8 w-64" />
      </div>
      <div className="grid gap-5">
        <Block className="h-36" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 min-[1360px]:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Block key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-5">
          <Block className="h-96 xl:col-span-3" />
          <Block className="h-96 xl:col-span-2" />
        </div>
      </div>
    </div>
  );
}
