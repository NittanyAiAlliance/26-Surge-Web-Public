"use client"

import { useRef } from "react"
import Link from "next/link"
import { motion, useScroll, useTransform } from "motion/react"

const FOOTER_LINKS = {
  Product: [
    { label: "How It Works", href: "#process" },
    { label: "Examples", href: "#gallery" },
    { label: "Pricing", href: "#pricing" },
    { label: "Generate", href: "/dashboard/create" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Blog", href: "/blog" },
    { label: "Contact", href: "mailto:hello@radiant.dev" },
  ],
  Legal: [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ],
}

export function EditorialFooter() {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end end"],
  })
  const imageY = useTransform(scrollYProgress, [0, 1], ["10%", "0%"])

  return (
    <footer
      ref={ref}
      className="relative min-h-screen bg-[var(--editorial-footer)] text-white flex flex-col"
    >
      {/* Background image with parallax */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=1920&q=80')",
            y: imageY,
          }}
        />
        {/* Solid dark overlay — no gradient */}
        <div className="absolute inset-0 bg-[var(--editorial-footer)]/85" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-1 flex-col justify-between px-6 md:px-12 py-16 md:py-24">
        {/* Brand zone */}
        <div className="mx-auto max-w-[1440px] w-full">
          <h2 className="font-brand text-[clamp(4rem,12vw,10rem)] italic font-light text-white leading-none">
            Radiant
          </h2>
          <p className="mt-4 font-body text-lg text-white/50 max-w-md">
            Every business deserves a beautiful website.
          </p>
        </div>

        {/* Link columns */}
        <div className="mx-auto max-w-[1440px] w-full mt-auto">
          <div className="border-t border-white/10 pt-12" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
            {/* Empty spacer column on desktop */}
            <div className="hidden md:block" />

            {Object.entries(FOOTER_LINKS).map(([category, links]) => (
              <div key={category}>
                <p className="font-body text-xs font-semibold uppercase tracking-[0.1em] text-white/30 mb-4">
                  {category}
                </p>
                <ul className="space-y-3">
                  {links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="font-body text-sm text-white/50 hover:text-white transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Copyright */}
          <div className="border-t border-white/10 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="font-body text-xs text-white/30">
              &copy; {new Date().getFullYear()} Radiant
            </p>
            <p className="font-body text-xs text-white/30">
              Built with AI
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
