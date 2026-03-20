"use client"

import { motion } from "motion/react"
import { EDITORIAL_EASE, AnimatedCounter } from "./animations"

const STATS = [
  { value: 5, suffix: "m", label: "Average generation time", offset: "md:mt-0" },
  { value: 20, suffix: "+", label: "Industries supported", offset: "md:mt-24" },
  { value: 1000, suffix: "+", label: "Sites generated and counting", offset: "md:mt-8" },
]

export function Numbers() {
  return (
    <section className="px-6 md:px-12 py-[120px] md:py-[200px]">
      <div className="mx-auto max-w-[1440px] grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-12">
        {STATS.map((stat, i) => (
          <motion.div
            key={stat.label}
            className={stat.offset}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: i * 0.15, ease: EDITORIAL_EASE }}
          >
            <div className="font-display text-[clamp(5rem,10vw,9rem)] font-bold leading-none text-[var(--editorial-ink)] tabular-nums">
              <AnimatedCounter target={stat.value} suffix={stat.suffix} />
            </div>
            <p className="mt-4 font-body text-sm text-[var(--editorial-muted)] max-w-[20ch]">
              {stat.label}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
