"use client"

import Link from "next/link"
import { motion } from "motion/react"
import { EDITORIAL_EASE } from "./animations"
import { HeroLines } from "./hero-lines"
// import { HeroConstellation } from "./hero-constellation"  // Option C: dot constellation

export function Hero() {
  const line1Words = "A 6-minute website".split(" ")
  const line2Words = "that looks like it took 6 weeks.".split(" ")
  const allWords = [...line1Words, ...line2Words]

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center px-6 md:px-12 pt-20">
      <HeroLines />
      {/* <HeroConstellation /> */}
      <div className="mx-auto max-w-[1440px] w-full">
        {/* Headline */}
        <h1 className="font-display text-hero font-bold max-w-[14ch]">
          {allWords.map((word, i) => (
            <span key={i} className="inline-block overflow-hidden">
              <motion.span
                className={`inline-block ${
                  i >= line1Words.length ? "italic font-black" : "font-normal"
                }`}
                initial={{ y: "110%" }}
                animate={{ y: 0 }}
                transition={{
                  duration: 0.8,
                  delay: 0.3 + i * 0.06,
                  ease: EDITORIAL_EASE,
                }}
              >
                {word}
              </motion.span>
              {i < allWords.length - 1 && "\u00A0"}
            </span>
          ))}
        </h1>

        {/* Supporting text */}
        <motion.p
          className="mt-8 md:mt-12 max-w-xl font-body text-[var(--text-body-lg)] text-[var(--editorial-ink-soft)] leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.0, ease: EDITORIAL_EASE }}
        >
          Radiant generates complete, production-ready websites for any business
          in about 6 minutes. From real data. Not templates.
        </motion.p>

        {/* CTA */}
        <motion.div
          className="mt-10 md:mt-14 flex flex-col sm:flex-row items-start gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.2, ease: EDITORIAL_EASE }}
        >
          <Link
            href="/dashboard/create"
            className="group inline-flex items-center gap-3 font-body text-lg font-semibold text-[var(--editorial-vermillion)] transition-colors hover:text-[var(--editorial-ink)]"
          >
            Generate your first site
            <svg
              className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M2 10h16M12 4l6 6-6 6" />
            </svg>
          </Link>
          <span className="font-body text-sm text-[var(--editorial-muted)]">
            Free. No account needed.
          </span>
        </motion.div>
      </div>
    </section>
  )
}
