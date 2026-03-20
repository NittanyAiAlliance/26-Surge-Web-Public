export default function SettingsLoading() {
  return (
    <div>
      <div className="mb-8">
        <div className="h-8 w-32 rounded bg-[var(--dash-elevated)] animate-pulse" />
        <div className="h-4 w-64 rounded bg-[var(--dash-elevated)] animate-pulse mt-2" />
      </div>

      <div className="space-y-8">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-6"
          >
            <div className="h-5 w-24 rounded bg-[var(--dash-elevated)] animate-pulse mb-6" />
            <div className="space-y-4">
              <div className="h-10 rounded bg-[var(--dash-elevated)] animate-pulse" />
              <div className="h-10 rounded bg-[var(--dash-elevated)] animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
