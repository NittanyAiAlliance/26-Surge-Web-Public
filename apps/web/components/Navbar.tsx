"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Menu, LogOut, LayoutDashboard, Settings, User as UserIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { createClient } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/dashboard/create", label: "Generate", auth: true },
  { href: "/dashboard", label: "Dashboard", auth: true },
  { href: "/#pricing", label: "Pricing" },
]

export function Navbar() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

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

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    router.push("/")
  }

  const visibleLinks = NAV_LINKS.filter(
    (link) => !link.auth || user
  )

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-white/[0.06] bg-[var(--dash-bg)]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <span className="font-brand text-2xl italic text-white">Radiant</span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden items-center gap-8 md:flex">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm transition-colors hover:text-white ${
                pathname === link.href
                  ? "text-white"
                  : "text-white/50"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop auth buttons */}
        <div className="hidden items-center gap-3 md:flex">
          {loading ? (
            <div className="h-8 w-20 animate-pulse rounded-md bg-white/[0.06]" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-white/60 hover:text-white"
                >
                  <div className="flex size-6 items-center justify-center rounded-full bg-[var(--dash-vermillion)] text-xs font-bold text-white">
                    {(user.email?.[0] ?? "U").toUpperCase()}
                  </div>
                  <span className="max-w-[120px] truncate text-sm">
                    {user.email}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 border-white/[0.06] bg-[var(--dash-bg)]"
              >
                <DropdownMenuLabel className="text-white/40 text-xs font-normal">
                  {user.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/[0.06]" />
                <DropdownMenuItem
                  className="text-white/70 focus:bg-white/[0.06] focus:text-white cursor-pointer"
                  onClick={() => router.push("/dashboard")}
                >
                  <LayoutDashboard className="size-4" />
                  Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-white/70 focus:bg-white/[0.06] focus:text-white cursor-pointer"
                  onClick={() => router.push("/account/settings")}
                >
                  <Settings className="size-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/[0.06]" />
                <DropdownMenuItem
                  className="text-red-400 focus:bg-red-500/10 focus:text-red-400 cursor-pointer"
                  onClick={handleSignOut}
                >
                  <LogOut className="size-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="text-white/60 hover:text-white"
                asChild
              >
                <Link href="/login">Log In</Link>
              </Button>
              <Button
                size="sm"
                className="bg-[var(--dash-vermillion)] text-white font-medium hover:bg-[var(--dash-vermillion)]/90"
                asChild
              >
                <Link href="/signup">Sign Up</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <div className="md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white/60 hover:text-white">
                <Menu className="size-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="border-white/[0.06] bg-[var(--dash-bg)] text-white"
            >
              <SheetHeader>
                <SheetTitle className="flex items-center text-white">
                  <span className="font-brand text-2xl italic">Radiant</span>
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Navigation menu
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-1 px-4">
                {visibleLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-white/[0.06] ${
                      pathname === link.href
                        ? "text-white bg-white/[0.04]"
                        : "text-white/60"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              <div className="mt-auto flex flex-col gap-2 p-4 border-t border-white/[0.06]">
                {loading ? null : user ? (
                  <>
                    <div className="flex items-center gap-3 px-3 py-2 text-sm text-white/40">
                      <div className="flex size-6 items-center justify-center rounded-full bg-[var(--dash-vermillion)] text-xs font-bold text-white">
                        {(user.email?.[0] ?? "U").toUpperCase()}
                      </div>
                      <span className="truncate">{user.email}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start text-red-400 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => {
                        handleSignOut()
                        setMobileOpen(false)
                      }}
                    >
                      <LogOut className="mr-2 size-4" />
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start text-white/60 hover:text-white"
                      asChild
                    >
                      <Link href="/login" onClick={() => setMobileOpen(false)}>
                        Log In
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      className="bg-[var(--dash-vermillion)] text-white font-medium hover:bg-[var(--dash-vermillion)]/90"
                      asChild
                    >
                      <Link href="/signup" onClick={() => setMobileOpen(false)}>
                        Sign Up
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  )
}
