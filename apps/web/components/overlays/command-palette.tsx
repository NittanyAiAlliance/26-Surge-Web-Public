"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import { createClient } from "@/lib/supabase"

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  function navigate(path: string) {
    router.push(path)
    setOpen(false)
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setOpen(false)
    router.push("/")
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <Command
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-elevated)] shadow-2xl"
        label="Command palette"
      >
        <Command.Input
          placeholder="Type a command or search…"
          className="w-full border-b border-[var(--dash-border)] bg-transparent px-4 py-3 text-sm text-[var(--dash-text)] outline-none placeholder:text-[var(--dash-text-muted)]"
        />

        <Command.List className="max-h-72 overflow-y-auto p-2">
          <Command.Empty className="px-4 py-6 text-center text-sm text-[var(--dash-text-muted)]">
            No results found.
          </Command.Empty>

          <Command.Group
            heading="Navigation"
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--dash-text-muted)]"
          >
            <Command.Item
              onSelect={() => navigate("/dashboard")}
              className="cursor-pointer rounded-md px-3 py-2 text-sm text-[var(--dash-text)] aria-selected:bg-[var(--dash-active)]"
            >
              Dashboard
            </Command.Item>
            <Command.Item
              onSelect={() => navigate("/dashboard/create")}
              className="cursor-pointer rounded-md px-3 py-2 text-sm text-[var(--dash-text)] aria-selected:bg-[var(--dash-active)]"
            >
              New Site
            </Command.Item>
            <Command.Item
              onSelect={() => navigate("/account/settings")}
              className="cursor-pointer rounded-md px-3 py-2 text-sm text-[var(--dash-text)] aria-selected:bg-[var(--dash-active)]"
            >
              Settings
            </Command.Item>
          </Command.Group>

          <Command.Separator className="my-1 h-px bg-[var(--dash-border)]" />

          <Command.Group
            heading="Actions"
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--dash-text-muted)]"
          >
            <Command.Item
              onSelect={handleSignOut}
              className="cursor-pointer rounded-md px-3 py-2 text-sm text-[var(--dash-text)] aria-selected:bg-[var(--dash-active)]"
            >
              Sign Out
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  )
}
