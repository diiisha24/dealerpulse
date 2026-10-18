import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card mx-auto mt-16 max-w-md p-8 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-1 text-lg font-semibold text-ink">We could not find that page</h1>
      <p className="mt-2 text-sm text-ink-muted">The branch or sales rep in the link does not exist in this dataset.</p>
      <Link href="/" className="btn mt-5">
        Go to overview
      </Link>
    </div>
  );
}
