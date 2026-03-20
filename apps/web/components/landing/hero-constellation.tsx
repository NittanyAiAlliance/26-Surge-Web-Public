"use client"

import { motion } from "motion/react"
import { EDITORIAL_EASE } from "./animations"

// Node positions — sparse grid in the right ~40%, a few drifting behind text
const NODES = [
  // Right cluster
  { x: 1060, y: 240 },
  { x: 1200, y: 180 },
  { x: 1320, y: 300 },
  { x: 1140, y: 400 },
  { x: 1280, y: 480 },
  { x: 1360, y: 160 },
  { x: 1100, y: 560 },
  { x: 1240, y: 620 },
  // Extending slightly behind text (~15-20% overlap)
  { x: 880, y: 340 },
  { x: 920, y: 520 },
  { x: 840, y: 200 },
]

// Connections between nodes (indices into NODES array)
const EDGES: [number, number][] = [
  [0, 1],
  [1, 5],
  [1, 3],
  [2, 3],
  [2, 4],
  [3, 4],
  [3, 6],
  [4, 7],
  [6, 7],
  [8, 0],
  [8, 3],
  [9, 6],
  [10, 0],
]

export function HeroConstellation() {
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
        {/* Connecting lines — draw in with stagger */}
        {EDGES.map(([a, b], i) => {
          const from = NODES[a]
          const to = NODES[b]
          return (
            <motion.line
              key={`edge-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="var(--editorial-ink)"
              strokeWidth={0.5}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.08 }}
              transition={{
                pathLength: { duration: 1.0, delay: 1.0 + i * 0.1, ease: EDITORIAL_EASE },
                opacity: { duration: 0.3, delay: 1.0 + i * 0.1 },
              }}
            />
          )
        })}

        {/* Dots — fade in after their connecting lines */}
        {NODES.map((node, i) => {
          // Nodes in the overlap zone (last 3) are more transparent
          const isOverlap = i >= 8
          return (
            <motion.circle
              key={`node-${i}`}
              cx={node.x}
              cy={node.y}
              r={isOverlap ? 2 : 2.5}
              fill="var(--editorial-ink)"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: isOverlap ? 0.08 : 0.15 }}
              transition={{
                duration: 0.5,
                delay: 1.4 + i * 0.08,
                ease: EDITORIAL_EASE,
              }}
            />
          )
        })}

        {/* Single vermillion accent node */}
        <motion.circle
          cx={NODES[3].x}
          cy={NODES[3].y}
          r={3}
          fill="var(--editorial-vermillion)"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.3 }}
          transition={{
            duration: 0.6,
            delay: 2.6,
            ease: EDITORIAL_EASE,
          }}
        />
      </svg>
    </div>
  )
}
