import { Skeleton } from "@/components/ui/skeleton"

export default function PreviewLoading() {
  return (
    <div className="flex h-screen flex-col bg-[var(--dash-bg)] text-white">
      {/* Toolbar skeleton */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] px-4 gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-lg bg-white/[0.06]" />
          <div className="h-5 w-px bg-white/[0.08]" />
          <Skeleton className="size-7 rounded-md bg-white/[0.06]" />
          <div className="h-5 w-px bg-white/[0.08]" />
          <Skeleton className="h-5 w-40 bg-white/[0.06]" />
        </div>

        <Skeleton className="h-8 w-48 rounded-lg bg-white/[0.06]" />

        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-16 rounded-md bg-white/[0.06]" />
          <Skeleton className="h-8 w-24 rounded-md bg-white/[0.06]" />
          <Skeleton className="h-8 w-20 rounded-md bg-white/[0.06]" />
        </div>
      </div>

      {/* URL bar skeleton */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/[0.04] px-4">
        <Skeleton className="size-3.5 rounded bg-white/[0.06]" />
        <Skeleton className="h-3.5 w-56 bg-white/[0.06]" />
      </div>

      {/* Preview area skeleton */}
      <div className="relative flex-1 overflow-hidden">
        <div className="flex h-full items-start justify-center p-4">
          <Skeleton className="h-full w-full rounded-xl bg-white/[0.04]" />
        </div>
      </div>
    </div>
  )
}
