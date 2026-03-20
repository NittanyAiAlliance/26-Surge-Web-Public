"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("Root error boundary caught:", error)
  }, [error])

  const isRateLimit =
    error.message?.toLowerCase().includes("rate limit") ||
    error.message?.toLowerCase().includes("too many requests") ||
    error.message?.includes("429")

  if (isRateLimit) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--dash-bg)] px-6 text-white">
        <div className="text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-[var(--dash-vermillion)]/[0.08] ring-1 ring-[var(--dash-vermillion)]/20">
            <ShieldAlert className="size-7 text-[var(--dash-vermillion)]" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Rate limit exceeded
          </h1>
          <p className="mt-3 text-lg text-white/50">
            You&apos;ve made too many requests
          </p>
          <p className="mt-2 max-w-md text-sm text-white/30">
            Please wait a moment before trying again. This helps us keep the
            service running smoothly for everyone.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={reset}
              variant="outline"
              className="border-white/[0.08] bg-white/[0.03] text-white hover:bg-white/[0.06]"
            >
              <RefreshCw className="size-4" />
              Try Again
            </Button>
            <Button
              className="bg-[var(--dash-vermillion)] text-white font-semibold hover:bg-[var(--dash-vermillion)]/90"
              asChild
            >
              <Link href="/">
                <Home className="size-4" />
                Home
              </Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--dash-bg)] px-6 text-white">
      <div className="text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-red-500/[0.08] ring-1 ring-red-500/20">
          <AlertTriangle className="size-7 text-red-400" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-3 text-lg text-white/50">
          An unexpected error occurred
        </p>
        <p className="mt-2 max-w-md text-sm text-white/30">
          Don&apos;t worry — your data is safe. Try refreshing the page or head
          back to the homepage.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            onClick={reset}
            variant="outline"
            className="border-white/[0.08] bg-white/[0.03] text-white hover:bg-white/[0.06]"
            data-testid="error-retry-btn"
          >
            <RefreshCw className="size-4" />
            Try Again
          </Button>
          <Button
            className="bg-[var(--dash-vermillion)] text-white font-semibold hover:bg-[var(--dash-vermillion)]/90"
            asChild
          >
            <Link href="/">
              <Home className="size-4" />
              Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
