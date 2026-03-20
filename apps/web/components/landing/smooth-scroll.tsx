"use client"

import { ReactLenis } from "lenis/react"

export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  return (
    <ReactLenis
      root
      options={{
        lerp: 0.08,
        smoothWheel: true,
        syncTouch: true,
        touchMultiplier: 1.5,
      }}
    >
      {children}
    </ReactLenis>
  )
}
