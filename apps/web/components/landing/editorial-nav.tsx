"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "motion/react"
import { createClient } from "@/lib/supabase"
import { EDITORIAL_EASE } from "./animations"

const NAV_LINKS = [
  { label: "Work", href: "#gallery" },
  { label: "Pricing", href: "#pricing" },
]

export function EditorialNav() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const router = useRouter()
  const { scrollY } = useScroll()

  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 50))

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  const handleSignOut = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }, [router])

  return (
    <>
      <motion.nav
        className={`fixed top-0 z-50 w-full px-6 md:px-12 transition-colors duration-500 ${
          scrolled
            ? "bg-[var(--editorial-bg)]/80 backdrop-blur-xl border-b border-[var(--editorial-border)]"
            : "bg-transparent"
        }`}
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: EDITORIAL_EASE }}
      >
        <div className="mx-auto flex h-16 md:h-20 max-w-[1440px] items-center justify-between">
          {/* Wordmark */}
          <Link
            href="/"
            className="font-brand text-2xl md:text-3xl italic font-light text-[var(--editorial-ink)] tracking-[0.02em]"
          >
            Radiant
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="group relative font-body text-sm font-medium text-[var(--editorial-muted)] hover:text-[var(--editorial-ink)] transition-colors"
              >
                {link.label}
                <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-[var(--editorial-ink)] transition-all duration-300 group-hover:w-full" />
              </a>
            ))}

            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className="font-body text-sm font-medium text-[var(--editorial-muted)] hover:text-[var(--editorial-ink)] transition-colors"
                >
                  Dashboard
                </Link>
                <button
                  onClick={handleSignOut}
                  className="font-body text-sm font-medium text-[var(--editorial-muted)] hover:text-[var(--editorial-ink)] transition-colors"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="font-body text-sm font-medium text-[var(--editorial-muted)] hover:text-[var(--editorial-ink)] transition-colors"
              >
                Log in
              </Link>
            )}

            {/* Primary CTA — bordered button with fill wipe */}
            <Link
              href="/dashboard/create"
              className="group relative inline-flex items-center gap-2 overflow-hidden border border-[var(--editorial-ink)] px-6 py-2.5 font-body text-sm font-semibold text-[var(--editorial-ink)] transition-colors hover:text-white"
            >
              <span className="absolute inset-0 -translate-x-full bg-[var(--editorial-ink)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0" />
              <span className="relative">Generate a site</span>
              <svg className="relative h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 8h14M9 2l6 6-6 6" />
              </svg>
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex flex-col gap-1.5 p-2"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <span className="block h-px w-6 bg-[var(--editorial-ink)]" />
            <span className="block h-px w-4 bg-[var(--editorial-ink)]" />
          </button>
        </div>
      </motion.nav>

      {/* Full-screen mobile menu overlay */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: "0%" }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.6, ease: EDITORIAL_EASE }}
            className="fixed inset-0 z-[60] bg-[var(--editorial-bg)] flex flex-col"
          >
            <div className="flex h-16 items-center justify-between px-6">
              <span className="font-brand text-2xl italic font-light text-[var(--editorial-ink)]">
                Radiant
              </span>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-2 font-body text-sm text-[var(--editorial-muted)]"
                aria-label="Close menu"
              >
                Close
              </button>
            </div>

            <nav className="flex flex-1 flex-col items-start justify-center gap-6 px-8">
              {[...NAV_LINKS, { label: "Generate", href: "/dashboard/create" }, ...(user ? [{ label: "Dashboard", href: "/dashboard" }] : [{ label: "Log in", href: "/login" }])].map(
                (link, i) => (
                  <motion.a
                    key={link.label}
                    href={link.href}
                    className="font-display text-5xl font-bold tracking-tight text-[var(--editorial-ink)] hover:text-[var(--editorial-vermillion)] transition-colors"
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.15 + i * 0.08, duration: 0.5, ease: EDITORIAL_EASE }}
                    onClick={() => setMenuOpen(false)}
                  >
                    {link.label}
                  </motion.a>
                )
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
