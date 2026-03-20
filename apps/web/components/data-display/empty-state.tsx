import Link from "next/link"

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: { label: string; href: string }
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h2 className="font-display text-3xl font-medium tracking-tight text-[var(--dash-text)] md:text-4xl">
        {title}
      </h2>
      <p className="mt-4 max-w-md text-base text-[var(--dash-text-secondary)]">
        {description}
      </p>
      {action && (
        <Link
          href={action.href}
          className="group relative mt-8 inline-flex items-center gap-2 overflow-hidden border border-[var(--dash-vermillion)] px-8 py-3 text-sm font-semibold text-white transition-colors"
          style={{ borderRadius: "10px" }}
        >
          <span className="absolute inset-0 -translate-x-full bg-[var(--dash-vermillion)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0" />
          <span className="relative">{action.label}</span>
        </Link>
      )}
    </div>
  )
}
