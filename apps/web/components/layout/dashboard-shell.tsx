import { SidebarNav } from "./sidebar-nav"
import { PageTransition } from "./page-transition"
import { CommandPalette } from "../overlays/command-palette"

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-theme min-h-screen bg-[var(--dash-bg)] font-body text-[var(--dash-text)]">
      <SidebarNav />
      <CommandPalette />

      {/* Main content — offset for fixed sidebar (desktop) and top bar (mobile) */}
      <main className="min-h-screen pt-14 lg:ml-60 lg:pt-0">
        <div className="mx-auto max-w-[1200px] px-6 py-8 lg:px-10 lg:py-10">
          <PageTransition>
            {children}
          </PageTransition>
        </div>
      </main>
    </div>
  )
}
