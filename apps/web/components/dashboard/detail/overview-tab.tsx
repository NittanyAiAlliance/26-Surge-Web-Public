"use client"

import { useState, useEffect } from "react"
import {
  ExternalLink,
  Globe,
  MapPin,
  Star,
} from "lucide-react"
import { StatusBadge } from "@/components/data-display/status-badge"
import type { Project } from "@radiant/db"

interface OverviewTabProps {
  project: Project
  fileCount: number
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function OverviewTab({ project, fileCount }: OverviewTabProps) {
  const liveUrl = `https://${project.subdomain}.surge.ishaannarang.xyz`
  const isLive = project.status === "deployed"
  const previewUrl = `/preview/${project.id}/site`

  // Defer iframe load so the parent page renders and becomes interactive first.
  // Without this, the iframe's heavy Babel compilation blocks the main thread.
  const [showPreview, setShowPreview] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShowPreview(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const config = project.config as Record<string, unknown>
  const businessAddress = (config?.address as string) ?? null
  const businessRating = (config?.rating as number) ?? null
  const businessPhone = (config?.phone as string) ?? null
  const businessCategory = (config?.category as string) ?? project.industry

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Preview iframe - spans 2 cols */}
      <div className="lg:col-span-2">
        <div className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--dash-border)] px-4 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-faint)]">
              Live Preview
            </span>
            {isLive && (
              <a
                href={project.vercel_deployment_url || liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[var(--dash-vermillion)]/70 hover:text-[var(--dash-vermillion)] transition-colors"
              >
                <ExternalLink className="size-3" />
                Open live site
              </a>
            )}
          </div>
          <div className="relative w-full bg-white" style={{ paddingBottom: "62.5%" }}>
            {showPreview ? (
              <iframe
                src={previewUrl}
                className="absolute inset-0 h-full w-full border-0"
                title={`Preview of ${project.business_name}`}
                sandbox="allow-scripts"
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--dash-text-muted)]">
                Loading preview...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar info cards */}
      <div className="flex flex-col gap-4">
        {/* Business Info Card */}
        <div className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-5">
          <h3 className="font-display text-sm font-semibold text-[var(--dash-text)] mb-4">
            Business Info
          </h3>
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <Globe className="size-4 text-[var(--dash-text-muted)] mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-[var(--dash-text-secondary)]">{project.business_name}</p>
                {businessCategory && (
                  <p className="text-xs text-[var(--dash-text-muted)] capitalize">{businessCategory}</p>
                )}
              </div>
            </div>
            {businessAddress && (
              <div className="flex items-start gap-3">
                <MapPin className="size-4 text-[var(--dash-text-muted)] mt-0.5 shrink-0" />
                <p className="text-sm text-[var(--dash-text-secondary)]">{businessAddress}</p>
              </div>
            )}
            {businessRating != null && (
              <div className="flex items-center gap-3">
                <Star className="size-4 text-[var(--dash-vermillion)]/60 shrink-0" />
                <p className="text-sm text-[var(--dash-text-secondary)]">{businessRating} / 5</p>
              </div>
            )}
            {businessPhone && (
              <div className="flex items-start gap-3">
                <Globe className="size-4 text-[var(--dash-text-muted)] mt-0.5 shrink-0" />
                <p className="text-sm text-[var(--dash-text-secondary)]">{businessPhone}</p>
              </div>
            )}
          </div>
        </div>

        {/* Deployment Info Card */}
        <div className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-5">
          <h3 className="font-display text-sm font-semibold text-[var(--dash-text)] mb-4">
            Deployment
          </h3>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-faint)]">
                Status
              </span>
              <StatusBadge status={project.status} size="sm" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-faint)]">
                Subdomain
              </span>
              <span className="text-xs text-[var(--dash-text-secondary)] font-mono">
                {project.subdomain}
              </span>
            </div>
            {isLive && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-faint)]">
                  URL
                </span>
                <a
                  href={project.vercel_deployment_url || liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[var(--dash-vermillion)]/70 hover:text-[var(--dash-vermillion)] transition-colors"
                >
                  <ExternalLink className="size-3" />
                  Visit
                </a>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-faint)]">
                Last updated
              </span>
              <span className="text-xs text-[var(--dash-text-secondary)]">
                {formatRelativeDate(project.updated_at)}
              </span>
            </div>
            {project.vercel_project_id && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-faint)]">
                  Vercel ID
                </span>
                <span className="text-xs text-[var(--dash-text-muted)] font-mono truncate max-w-[120px]">
                  {project.vercel_project_id}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats Card */}
        <div className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-5">
          <h3 className="font-display text-sm font-semibold text-[var(--dash-text)] mb-4">
            Files
          </h3>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-faint)]">
              Generated files
            </span>
            <span className="text-sm font-medium text-[var(--dash-text-secondary)]">
              {fileCount}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
