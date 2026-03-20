export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-theme min-h-screen bg-[var(--dash-bg)] text-[var(--dash-text)] font-body">
      {children}
    </div>
  )
}
