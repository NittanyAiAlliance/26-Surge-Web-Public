"use client"

import { useRef, useState } from "react"
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  type MotionValue,
} from "motion/react"

// The editorial easing — quick start, graceful deceleration
export const EDITORIAL_EASE = [0.22, 1, 0.36, 1] as const

// ── Reveal on scroll ──────────────────────────────────
export function RevealSection({
  children,
  className,
  id,
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  id?: string
  delay?: number
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, ease: EDITORIAL_EASE, delay }}
      className={className}
    >
      {children}
    </motion.section>
  )
}

// ── Stagger heading — words rise from below ───────────
export function StaggerHeading({
  text,
  className,
  as: Tag = "h2",
}: {
  text: string
  className?: string
  as?: "h1" | "h2" | "h3" | "h4"
}) {
  const words = text.split(" ")
  return (
    <Tag className={className}>
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden">
          <motion.span
            className="inline-block"
            initial={{ y: "100%" }}
            whileInView={{ y: 0 }}
            viewport={{ once: true }}
            transition={{
              duration: 0.7,
              delay: i * 0.06,
              ease: EDITORIAL_EASE,
            }}
          >
            {word}
          </motion.span>
          {i < words.length - 1 && "\u00A0"}
        </span>
      ))}
    </Tag>
  )
}

// ── Word-by-word scroll opacity reveal ────────────────
export function ScrollRevealText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.9", "start 0.25"],
  })
  const words = text.split(" ")

  return (
    <p ref={ref} className={className}>
      {words.map((word, i) => {
        const start = i / words.length
        const end = start + 1 / words.length
        return (
          <ScrollWord key={i} progress={scrollYProgress} range={[start, end]}>
            {word}
          </ScrollWord>
        )
      })}
    </p>
  )
}

function ScrollWord({
  children,
  progress,
  range,
}: {
  children: string
  progress: MotionValue<number>
  range: [number, number]
}) {
  const opacity = useTransform(progress, range, [0.15, 1])
  return (
    <motion.span className="inline-block mr-[0.25em]" style={{ opacity }}>
      {children}
    </motion.span>
  )
}

// ── Animated counter ──────────────────────────────────
export function AnimatedCounter({
  target,
  suffix = "",
  className,
}: {
  target: number
  suffix?: string
  className?: string
}) {
  const ref = useRef(null)
  const [display, setDisplay] = useState(0)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end center"],
  })
  const value = useTransform(scrollYProgress, [0, 1], [0, target])

  useMotionValueEvent(value, "change", (v) => {
    setDisplay(Math.round(v))
  })

  return (
    <span ref={ref} className={className}>
      {display}
      {suffix}
    </span>
  )
}

// ── Parallax wrapper ──────────────────────────────────
export function Parallax({
  children,
  speed = 0.5,
  className,
}: {
  children: React.ReactNode
  speed?: number
  className?: string
}) {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  })
  const y = useTransform(scrollYProgress, [0, 1], [`${-speed * 20}%`, `${speed * 20}%`])

  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  )
}
