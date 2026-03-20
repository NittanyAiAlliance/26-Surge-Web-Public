import Link from "next/link"
import { FileQuestion, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function PreviewNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--dash-bg)] px-6 text-white">
      <div className="text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06]">
          <FileQuestion className="size-7 text-white/30" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">404</h1>
        <p className="mt-3 text-lg text-white/50">Project not found</p>
        <p className="mt-2 max-w-sm text-sm text-white/30">
          This project doesn&apos;t exist or may have been deleted. Check the
          URL or generate a new website.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            className="bg-[var(--dash-vermillion)] text-white font-semibold hover:bg-[var(--dash-vermillion)]/90"
            asChild
          >
            <Link href="/dashboard/create">
              <ArrowLeft className="size-4" />
              Generate a Website
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
