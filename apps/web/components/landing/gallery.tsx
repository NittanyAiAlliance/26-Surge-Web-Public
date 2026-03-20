"use client"

import Image from "next/image"
import { motion } from "motion/react"
import { EDITORIAL_EASE, RevealSection, StaggerHeading } from "./animations"

const PROJECTS = [
  { name: "The Warm Cup", industry: "Café", time: "5m 42s", image: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1200&q=80" },
  { name: "Bright Smile Dental", industry: "Dental", time: "5m 18s", image: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800&q=80" },
  { name: "Luxe Hair Studio", industry: "Salon", time: "4m 51s", image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&q=80" },
  { name: "Atlas Plumbing", industry: "Plumbing", time: "5m 05s", image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&q=80" },
  { name: "Chen & Associates", industry: "Law Firm", time: "6m 12s", image: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80" },
]

export function Gallery() {
  return (
    <RevealSection id="gallery" className="px-6 md:px-12 py-[120px] md:py-[200px]">
      <div className="mx-auto max-w-[1440px]">
        <StaggerHeading
          text="Every one of these was built in under 6 minutes."
          as="h2"
          className="font-display text-section font-bold text-[var(--editorial-ink)] max-w-[20ch]"
        />

        {/* Masonry grid */}
        <div className="mt-16 md:mt-24 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 auto-rows-[280px] md:auto-rows-[320px]">
          {PROJECTS.map((project, i) => (
            <motion.div
              key={project.name}
              className={`group relative overflow-hidden bg-[var(--editorial-surface)] ${
                i === 0 ? "md:col-span-2 md:row-span-2" : ""
              }`}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: i * 0.1, ease: EDITORIAL_EASE }}
            >
              <Image
                src={project.image}
                alt={`${project.name} — ${project.industry} website`}
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                sizes={i === 0 ? "(max-width: 768px) 100vw, 66vw" : "(max-width: 768px) 100vw, 33vw"}
              />

              {/* Hover overlay */}
              <div className="absolute inset-0 flex flex-col justify-end p-6 bg-[var(--editorial-ink)]/0 group-hover:bg-[var(--editorial-ink)]/80 transition-colors duration-500">
                <div className="translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                  <p className="font-body text-xs font-semibold uppercase tracking-[0.1em] text-white/50">
                    {project.industry} · {project.time}
                  </p>
                  <p className="mt-1 font-display text-xl font-bold text-white">
                    {project.name}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </RevealSection>
  )
}
