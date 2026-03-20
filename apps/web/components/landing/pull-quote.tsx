"use client"

import { ScrollRevealText } from "./animations"

export function PullQuote() {
  return (
    <section className="px-6 md:px-12 py-[120px] md:py-[200px]">
      <div className="mx-auto max-w-4xl">
        <div className="border-t border-[var(--editorial-border)]" />
        <div className="py-16 md:py-24">
          <ScrollRevealText
            text="I showed the Surge site to my web designer. He thought I paid someone $5,000."
            className="font-brand text-3xl md:text-5xl italic font-light text-[var(--editorial-ink)] leading-snug tracking-[0.01em] text-center"
          />
          <p className="mt-8 font-body text-sm text-[var(--editorial-muted)] text-center">
            — Maria Chen, Chen &amp; Associates Law, Chicago
          </p>
        </div>
        <div className="border-t border-[var(--editorial-border)]" />
      </div>
    </section>
  )
}
