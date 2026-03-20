import { Skeleton } from "@/components/ui/skeleton"

export default function GenerateLoading() {
  return (
    <div className="min-h-screen bg-[var(--dash-bg)] text-white">
      {/* Navbar skeleton */}
      <div className="fixed top-0 z-50 w-full border-b border-white/[0.06] bg-[var(--dash-bg)]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Skeleton className="h-8 w-28 bg-white/[0.06]" />
          <div className="hidden md:flex items-center gap-8">
            <Skeleton className="h-4 w-14 bg-white/[0.06]" />
            <Skeleton className="h-4 w-16 bg-white/[0.06]" />
            <Skeleton className="h-4 w-20 bg-white/[0.06]" />
          </div>
          <Skeleton className="h-8 w-20 bg-white/[0.06]" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="pt-32 pb-20">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <Skeleton className="mx-auto h-10 w-80 bg-white/[0.06]" />
          <Skeleton className="mx-auto mt-4 h-5 w-64 bg-white/[0.04]" />

          {/* Input skeleton */}
          <div className="mt-12">
            <Skeleton className="h-14 w-full rounded-xl bg-white/[0.06]" />
            <Skeleton className="mt-4 h-14 w-full rounded-xl bg-white/[0.06]" />
            <Skeleton className="mt-6 h-12 w-full rounded-xl bg-white/[0.06]" />
          </div>
        </div>
      </div>
    </div>
  )
}
