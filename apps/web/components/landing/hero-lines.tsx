"use client"

import { motion } from "motion/react"
import { EDITORIAL_EASE } from "./animations"

// Each line draws itself in with staggered timing
function DrawLine({
  d,
  delay,
  duration = 1.4,
  strokeWidth = 0.5,
  opacity = 0.18,
}: {
  d: string
  delay: number
  duration?: number
  strokeWidth?: number
  opacity?: number
}) {
  return (
    <motion.path
      d={d}
      fill="none"
      stroke="var(--editorial-ink)"
      strokeWidth={strokeWidth}
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity }}
      transition={{
        pathLength: { duration, delay, ease: EDITORIAL_EASE },
        opacity: { duration: 0.3, delay },
      }}
    />
  )
}

function DrawCircle({
  cx,
  cy,
  r,
  delay,
  duration = 1.2,
  strokeWidth = 0.5,
  opacity = 0.14,
}: {
  cx: number
  cy: number
  r: number
  delay: number
  duration?: number
  strokeWidth?: number
  opacity?: number
}) {
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke="var(--editorial-ink)"
      strokeWidth={strokeWidth}
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity }}
      transition={{
        pathLength: { duration, delay, ease: EDITORIAL_EASE },
        opacity: { duration: 0.3, delay },
      }}
    />
  )
}

// Small accent dot that fades in
function Dot({
  cx,
  cy,
  r = 1.5,
  delay,
  opacity = 0.25,
}: {
  cx: number
  cy: number
  r?: number
  delay: number
  opacity?: number
}) {
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      fill="var(--editorial-vermillion)"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity }}
      transition={{
        duration: 0.5,
        delay,
        ease: EDITORIAL_EASE,
      }}
    />
  )
}

export function HeroLines() {
  return (
    <div
      className="pointer-events-none absolute inset-0 hidden md:block"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1440 900"
        className="h-full w-full"
        preserveAspectRatio="xMaxYMid slice"
      >
        {/*
          Composition: architectural / editorial line art
          Sits primarily in the right ~40%, with a couple lines
          extending ~15-20% behind where the text sits.
          Golden ratio: text occupies ~61.8%, lines occupy ~38.2%
        */}

        {/* Primary diagonal — long sweep from upper-right down toward center */}
        <DrawLine
          d="M 1380 80 L 820 520"
          delay={0.8}
          duration={1.8}
          strokeWidth={0.6}
          opacity={0.12}
        />

        {/* Horizontal rule — intersects the diagonal */}
        <DrawLine
          d="M 780 340 L 1400 340"
          delay={1.2}
          duration={1.4}
          strokeWidth={0.5}
          opacity={0.15}
        />

        {/* Short vertical accent */}
        <DrawLine
          d="M 1060 200 L 1060 480"
          delay={1.5}
          duration={1.0}
          strokeWidth={0.5}
          opacity={0.1}
        />

        {/* Gentle arc — editorial flourish */}
        <DrawCircle
          cx={1120}
          cy={400}
          r={140}
          delay={1.8}
          duration={1.6}
          strokeWidth={0.4}
          opacity={0.08}
        />

        {/* Small circle at intersection */}
        <DrawCircle
          cx={1060}
          cy={340}
          r={24}
          delay={2.2}
          duration={0.8}
          strokeWidth={0.5}
          opacity={0.15}
        />

        {/* Angled line — creates depth, extends slightly behind text zone */}
        <DrawLine
          d="M 700 580 L 1100 180"
          delay={1.4}
          duration={1.5}
          strokeWidth={0.35}
          opacity={0.07}
        />

        {/* Short horizontal tick marks — editorial grid feel */}
        <DrawLine
          d="M 1020 340 L 1100 340"
          delay={2.4}
          duration={0.4}
          strokeWidth={0.8}
          opacity={0.2}
        />
        <DrawLine
          d="M 1060 300 L 1060 380"
          delay={2.5}
          duration={0.4}
          strokeWidth={0.8}
          opacity={0.2}
        />

        {/* Subtle long horizontal near bottom */}
        <DrawLine
          d="M 850 620 L 1350 620"
          delay={2.0}
          duration={1.2}
          strokeWidth={0.3}
          opacity={0.08}
        />

        {/* Vermillion accent dots at key intersections */}
        <Dot cx={1060} cy={340} r={2} delay={2.8} opacity={0.35} />
        <Dot cx={1060} cy={200} r={1.5} delay={3.0} opacity={0.2} />
        <Dot cx={1380} cy={340} r={1.5} delay={3.1} opacity={0.15} />
      </svg>
    </div>
  )
}
