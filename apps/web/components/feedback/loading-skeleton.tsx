export function SkeletonCard() {
  return (
    <div className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--dash-active)]" />
        <div className="h-5 w-16 animate-pulse rounded bg-[var(--dash-active)]" />
      </div>
      <div className="mb-2 h-5 w-3/4 animate-pulse rounded bg-[var(--dash-active)]" />
      <div className="mb-4 h-3 w-1/2 animate-pulse rounded bg-[var(--dash-active)]" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--dash-active)]" />
    </div>
  )
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
