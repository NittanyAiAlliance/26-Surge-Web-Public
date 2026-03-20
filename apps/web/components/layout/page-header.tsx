import Link from "next/link"
import { ChevronRight } from "lucide-react"

export interface Breadcrumb {
  label: string
  href?: string
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
}: {
  title: string
  subtitle?: string
  breadcrumbs?: Breadcrumb[]
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-8">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-4 flex items-center gap-1.5 text-sm text-[var(--dash-text-muted)]">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="transition-colors hover:text-[var(--dash-text-secondary)]"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-[var(--dash-text-secondary)]">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--dash-text)] md:text-4xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-base text-[var(--dash-text-secondary)]">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  )
}
