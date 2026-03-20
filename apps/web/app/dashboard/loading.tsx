import { SkeletonGrid } from "@/components/feedback/loading-skeleton"

export default function DashboardLoading() {
  return (
    <div>
      <div className="mb-8">
        <div className="h-9 w-40 animate-pulse rounded bg-[var(--dash-active)]" />
        <div className="mt-2 h-5 w-64 animate-pulse rounded bg-[var(--dash-active)]" />
      </div>
      <SkeletonGrid />
    </div>
  )
}
