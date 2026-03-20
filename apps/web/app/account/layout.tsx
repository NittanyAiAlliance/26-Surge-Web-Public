import { DashboardShell } from "@/components/layout/dashboard-shell"

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>
}
