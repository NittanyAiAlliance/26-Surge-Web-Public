"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutGrid,
  Plus,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Menu,
  X,
} from "lucide-react"
import { createClient } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"

/* ── Nav items ── */

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  /** Pathname matching: exact match by default. Use `startsWith` for prefix matching. */
  match?: "exact" | "startsWith"
  /** Paths to exclude from startsWith matching */
  excludePaths?: string[]
}

const MAIN_NAV: NavItem[] = [
  {
    label: "Sites",
    href: "/dashboard",
    icon: LayoutGrid,
    match: "startsWith",
    excludePaths: ["/dashboard/create"],
  },
  {
    label: "New Site",
    href: "/dashboard/create",
    icon: Plus,
    match: "exact",
  },
]

const ACCOUNT_NAV: NavItem[] = [
  {
    label: "Settings",
    href: "/account/settings",
    icon: Settings,
    match: "startsWith",
  },
]

/* ── Helpers ── */

function isActive(item: NavItem, pathname: string): boolean {
  if (item.match === "startsWith") {
    if (item.excludePaths?.some((p) => pathname.startsWith(p))) return false
    return pathname.startsWith(item.href)
  }
  return pathname === item.href
}

/* ── NavLink ── */

function NavLink({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: NavItem
  active: boolean
  collapsed: boolean
  onClick?: () => void
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`
        group relative flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium
        transition-colors duration-200
        ${
          active
            ? "bg-[var(--dash-active)] text-[var(--dash-text)]"
            : "text-[var(--dash-text-muted)] hover:bg-[var(--dash-surface)] hover:text-[var(--dash-text-secondary)]"
        }
        ${collapsed ? "justify-center px-0" : ""}
      `}
      title={collapsed ? item.label : undefined}
    >
      {/* Vermillion active indicator */}
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-[var(--dash-vermillion)]" />
      )}
      <item.icon className={`shrink-0 ${collapsed ? "h-5 w-5" : "h-4 w-4"}`} />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  )
}

/* ── SectionLabel ── */

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return null
  return (
    <span className="mb-1 block px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--dash-text-faint)]">
      {children}
    </span>
  )
}

/* ── SidebarContent (shared between desktop & mobile) ── */

function SidebarContent({
  collapsed,
  user,
  loading,
  onSignOut,
  onNavClick,
  onToggleCollapse,
  showCollapseToggle,
}: {
  collapsed: boolean
  user: User | null
  loading: boolean
  onSignOut: () => void
  onNavClick?: () => void
  onToggleCollapse?: () => void
  showCollapseToggle: boolean
}) {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col font-body">
      {/* ── Brand ── */}
      <div className={`flex items-center border-b border-[var(--dash-border)] ${collapsed ? "justify-center px-2 py-5" : "px-5 py-5"}`}>
        <Link href="/" className="font-brand text-2xl italic text-[var(--dash-text)]">
          {collapsed ? "S" : "Surge"}
        </Link>
      </div>

      {/* ── Main nav ── */}
      <div className={`flex-1 overflow-y-auto ${collapsed ? "px-2" : "px-3"} pt-6`}>
        <SectionLabel collapsed={collapsed}>Projects</SectionLabel>
        <nav className="flex flex-col gap-0.5">
          {MAIN_NAV.map((item) => (
            <NavLink
              key={item.label}
              item={item}
              active={isActive(item, pathname)}
              collapsed={collapsed}
              onClick={onNavClick}
            />
          ))}
        </nav>

        {/* ── Account section ── */}
        <div className={`mt-8 border-t border-[var(--dash-border)] pt-6`}>
          <SectionLabel collapsed={collapsed}>Account</SectionLabel>
          <nav className="flex flex-col gap-0.5">
            {ACCOUNT_NAV.map((item) => (
              <NavLink
                key={item.label}
                item={item}
                active={isActive(item, pathname)}
                collapsed={collapsed}
                onClick={onNavClick}
              />
            ))}
          </nav>
        </div>
      </div>

      {/* ── Bottom section ── */}
      <div className={`border-t border-[var(--dash-border)] ${collapsed ? "px-2 py-4" : "px-3 py-4"}`}>
        {/* User email */}
        {!loading && user && (
          <div className={`mb-2 ${collapsed ? "text-center" : "px-3"}`}>
            {collapsed ? (
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--dash-surface)] text-xs font-semibold text-[var(--dash-text-secondary)]"
                title={user.email ?? "User"}
              >
                {(user.email?.[0] ?? "U").toUpperCase()}
              </span>
            ) : (
              <p className="truncate text-xs text-[var(--dash-text-muted)]">{user.email}</p>
            )}
          </div>
        )}

        {/* Sign Out */}
        <button
          type="button"
          onClick={() => {
            onSignOut()
            onNavClick?.()
          }}
          className={`
            flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium
            text-[var(--dash-text-muted)] transition-colors duration-200
            hover:bg-[var(--dash-error-bg)] hover:text-[var(--dash-error)]
            ${collapsed ? "justify-center px-0" : ""}
          `}
          title={collapsed ? "Sign Out" : undefined}
        >
          <LogOut className={`shrink-0 ${collapsed ? "h-5 w-5" : "h-4 w-4"}`} />
          {!collapsed && <span>Sign Out</span>}
        </button>

        {/* Collapse toggle — desktop only */}
        {showCollapseToggle && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`
              mt-2 flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium
              text-[var(--dash-text-faint)] transition-colors duration-200
              hover:bg-[var(--dash-surface)] hover:text-[var(--dash-text-muted)]
              ${collapsed ? "justify-center px-0" : ""}
            `}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeft className="h-5 w-5 shrink-0" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4 shrink-0" />
                <span>Collapse</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

/* ── SidebarNav (exported component) ── */

export function SidebarNav() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  /* Fetch user */
  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  /* Close mobile menu on navigation */
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  /* Sign out */
  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    router.push("/")
  }

  return (
    <>
      {/* ── Mobile top bar (lg:hidden) ── */}
      <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-[var(--dash-border)] bg-[var(--dash-bg)] px-4 lg:hidden">
        <Link href="/" className="font-brand text-xl italic text-[var(--dash-text)]">
          Surge
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[var(--dash-text-secondary)] transition-colors hover:bg-[var(--dash-surface)]"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* ── Mobile overlay (lg:hidden) ── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          {/* Sidebar panel */}
          <aside className="fixed inset-y-0 left-0 z-50 w-[280px] bg-[var(--dash-bg)] pt-14 lg:hidden">
            <SidebarContent
              collapsed={false}
              user={user}
              loading={loading}
              onSignOut={handleSignOut}
              onNavClick={() => setMobileOpen(false)}
              showCollapseToggle={false}
            />
          </aside>
        </>
      )}

      {/* ── Desktop sidebar (hidden on mobile, visible lg+) ── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 hidden border-r border-[var(--dash-border)] bg-[var(--dash-bg)]
          transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:block
          ${collapsed ? "w-16" : "w-60"}
        `}
      >
        <SidebarContent
          collapsed={collapsed}
          user={user}
          loading={loading}
          onSignOut={handleSignOut}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          showCollapseToggle={true}
        />
      </aside>
    </>
  )
}
