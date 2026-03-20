"use client"

import Link from "next/link"
import { RevealSection, StaggerHeading } from "./animations"

export function Pricing() {
  return (
    <RevealSection id="pricing" className="px-6 md:px-12 py-[120px] md:py-[200px]">
      <div className="mx-auto max-w-[1440px]">
        <StaggerHeading
          text="Simple, honest pricing."
          as="h2"
          className="font-display text-section font-bold text-[var(--editorial-ink)]"
        />

        <div className="mt-16 md:mt-24 grid grid-cols-1 md:grid-cols-2 gap-px bg-[var(--editorial-border)]">
          {/* Free plan */}
          <div className="bg-[var(--editorial-bg)] p-8 md:p-12">
            <p className="font-body text-xs font-semibold uppercase tracking-[0.1em] text-[var(--editorial-muted)]">
              Free
            </p>
            <p className="mt-4 font-display text-subsection font-bold text-[var(--editorial-ink)]">
              Start free
            </p>
            <p className="mt-6 font-body text-base text-[var(--editorial-ink-soft)] leading-relaxed">
              Generate one site. Custom subdomain. See what Surge can do.
              No credit card needed.
            </p>
            <Link
              href="/dashboard/create"
              className="group mt-8 inline-flex items-center gap-2 font-body text-sm font-semibold text-[var(--editorial-sapphire)] hover:text-[var(--editorial-ink)] transition-colors"
            >
              Get started
              <svg className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 8h14M9 2l6 6-6 6" />
              </svg>
            </Link>
          </div>

          {/* Pro plan */}
          <div className="bg-[var(--editorial-bg)] p-8 md:p-12">
            <p className="font-body text-xs font-semibold uppercase tracking-[0.1em] text-[var(--editorial-muted)]">
              Pro
            </p>
            <p className="mt-4 font-display text-subsection font-bold text-[var(--editorial-ink)]">
              $35<span className="text-[var(--editorial-muted)] font-normal text-lg">/mo</span>
            </p>
            <p className="mt-6 font-body text-base text-[var(--editorial-ink-soft)] leading-relaxed">
              3 sites. All industries. Priority generation. Edit and regenerate.
              Email support.
            </p>
            <Link
              href="/signup"
              className="group mt-8 relative inline-flex items-center gap-2 overflow-hidden bg-[var(--editorial-vermillion)] px-6 py-3 font-body text-sm font-semibold text-white transition-colors hover:bg-[var(--editorial-ink)]"
            >
              Start Pro trial
              <svg className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 8h14M9 2l6 6-6 6" />
              </svg>
            </Link>
          </div>
        </div>

        <p className="mt-8 font-body text-sm text-[var(--editorial-muted)] text-center">
          Need unlimited sites or white-label?{" "}
          <a href="mailto:hello@surgeweb.site" className="text-[var(--editorial-sapphire)] hover:text-[var(--editorial-ink)] transition-colors underline underline-offset-2">
            Let&apos;s talk.
          </a>
        </p>
      </div>
    </RevealSection>
  )
}
