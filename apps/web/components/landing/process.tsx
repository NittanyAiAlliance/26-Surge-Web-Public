"use client"

import { useRef } from "react"
import { motion, useScroll, useTransform } from "motion/react"
import { EDITORIAL_EASE, RevealSection } from "./animations"

const STEPS = [
  {
    num: "01",
    title: "We find everything",
    desc: "Google reviews, photos, hours, existing website content. Every piece of public data about the business.",
  },
  {
    num: "02",
    title: "AI builds the site",
    desc: "Claude analyzes the data and generates a complete website — layout, copy, images, SEO — tailored to the industry.",
  },
  {
    num: "03",
    title: "It goes live",
    desc: "One click. Custom domain. SSL. Instantly accessible to customers.",
  },
]

export function Process() {
  const containerRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "end center"],
  })

  return (
    <RevealSection className="px-6 md:px-12 py-[120px] md:py-[200px]">
      <div ref={containerRef} className="mx-auto max-w-[1440px]">
        {/* Overline */}
        <p className="font-body text-xs font-semibold uppercase tracking-[0.1em] text-[var(--editorial-muted)] mb-16 md:mb-24">
          How it works
        </p>

        {/* Desktop: horizontal layout with SVG path */}
        <div className="hidden md:block relative">
          {/* SVG connecting path */}
          <svg
            className="absolute top-16 left-[8%] w-[84%] h-8"
            viewBox="0 0 800 30"
            fill="none"
            preserveAspectRatio="none"
          >
            <motion.path
              d="M 0 15 L 800 15"
              stroke="var(--editorial-border)"
              strokeWidth="1"
              style={{ pathLength: scrollYProgress }}
            />
          </svg>

          {/* Steps */}
          <div className="grid grid-cols-3 gap-12">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: i * 0.15, ease: EDITORIAL_EASE }}
              >
                <span className="font-display text-8xl font-bold text-[var(--editorial-border)]">
                  {step.num}
                </span>
                <h3 className="mt-6 font-display text-subsection font-bold text-[var(--editorial-ink)]">
                  {step.title}
                </h3>
                <p className="mt-4 font-body text-base text-[var(--editorial-muted)] leading-relaxed max-w-sm">
                  {step.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Mobile: vertical layout */}
        <div className="md:hidden space-y-16">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.num}
              className="relative pl-8 border-l border-[var(--editorial-border)]"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: i * 0.1, ease: EDITORIAL_EASE }}
            >
              <span className="font-display text-6xl font-bold text-[var(--editorial-border)]">
                {step.num}
              </span>
              <h3 className="mt-4 font-display text-2xl font-bold text-[var(--editorial-ink)]">
                {step.title}
              </h3>
              <p className="mt-3 font-body text-base text-[var(--editorial-muted)] leading-relaxed">
                {step.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </RevealSection>
  )
}
