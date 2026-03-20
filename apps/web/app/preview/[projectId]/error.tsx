"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PreviewErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function PreviewError({ error, reset }: PreviewErrorProps) {
  useEffect(() => {
    console.error("Preview error boundary caught:", error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--dash-bg)] px-6 text-white">
      <div className="text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-red-500/[0.08] ring-1 ring-red-500/20">
          <AlertTriangle className="size-7 text-red-400" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          Failed to load preview
        </h1>
        <p className="mt-3 text-lg text-white/50">
          We couldn&apos;t load this project
        </p>
        <p className="mt-2 max-w-md text-sm text-white/30">
          The project may have been deleted or there was a server error.
          Try again or go back to generate a new site.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            onClick={reset}
            variant="outline"
            className="border-white/[0.08] bg-white/[0.03] text-white hover:bg-white/[0.06]"
            data-testid="preview-error-retry-btn"
          >
            <RefreshCw className="size-4" />
            Try Again
          </Button>
          <Button
            className="bg-[var(--dash-vermillion)] text-white font-semibold hover:bg-[var(--dash-vermillion)]/90"
            asChild
          >
            <Link href="/dashboard/create">
              <ArrowLeft className="size-4" />
              Generate New Site
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
