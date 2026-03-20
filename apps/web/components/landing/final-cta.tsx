"use client"

import Link from "next/link"
import { StaggerHeading } from "./animations"

export function FinalCTA() {
  return (
    <section className="px-6 md:px-12 py-[160px] md:py-[280px]">
      <div className="mx-auto max-w-[1440px] text-center">
        <StaggerHeading
          text="Ready?"
          as="h2"
          className="font-display text-hero font-black text-[var(--editorial-ink)]"
        />

        <p className="mt-8 font-body text-lg text-[var(--editorial-muted)]">
          6 minutes from now, you could have a website.
        </p>

        <div className="mt-12 flex flex-col items-center gap-4">
          <Link
            href="/dashboard/create"
            className="group relative inline-flex items-center gap-3 overflow-hidden bg-[var(--editorial-vermillion)] px-10 py-4 font-body text-base font-semibold text-white transition-colors hover:bg-[var(--editorial-ink)]"
          >
            <span>Generate your website</span>
            <svg className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 8h14M9 2l6 6-6 6" />
            </svg>
          </Link>
          <span className="font-body text-xs text-[var(--editorial-muted)]">
            Free. Takes 6 minutes. No credit card.
          </span>
        </div>
      </div>
    </section>
  )
}
