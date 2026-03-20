"use client"

import Link from "next/link"
import {
  ExternalLink,
  Globe,
  RotateCcw,
  Trash2,
  Eye,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/data-display/status-badge"
import { formatRelativeDate } from "@/lib/utils/format-date"
import { DeleteProjectDialog } from "./delete-project-dialog"
import type { ProjectStatus } from "@radiant/db"

interface ProjectCardProps {
  id: string
  businessName: string
  subdomain: string
  status: ProjectStatus
  industry: string | null
  vercelDeploymentUrl: string | null
  updatedAt: string
}

export function ProjectCard({
  id,
  businessName,
  subdomain,
  status,
  industry,
  vercelDeploymentUrl,
  updatedAt,
}: ProjectCardProps) {
  const liveUrl = `https://${subdomain}.surge.ishaannarang.xyz`
  const isLive = status === "deployed"

  return (
    <div className="group relative flex flex-col rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] transition-all hover:border-[var(--dash-border-hover)]">
      {/* Thumbnail placeholder */}
      <div className="relative h-40 overflow-hidden rounded-t-[10px] bg-[var(--dash-surface)]">
        <div className="flex h-full items-center justify-center">
          <Globe className="size-10 text-[var(--dash-text-muted)]/30" />
        </div>
        {/* Status badge */}
        <div className="absolute left-3 top-3">
          <StatusBadge status={status} size="sm" />
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-display text-lg font-medium text-[var(--dash-text)] truncate">
            {businessName}
          </h3>
          {industry && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-muted)] mt-1">
              {industry}
            </p>
          )}
        </div>

        {/* Subdomain URL */}
        {isLive ? (
          <a
            href={vercelDeploymentUrl || liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 font-mono text-xs text-[var(--dash-teal)] hover:text-[var(--dash-teal)]/80 transition-colors truncate"
          >
            <ExternalLink className="size-3 shrink-0" />
            <span className="truncate">{subdomain}.surge.ishaannarang.xyz</span>
          </a>
        ) : (
          <p className="flex items-center gap-1.5 font-mono text-xs text-[var(--dash-text-muted)] truncate">
            <Globe className="size-3 shrink-0" />
            <span className="truncate">{subdomain}.surge.ishaannarang.xyz</span>
          </p>
        )}

        {/* Updated time */}
        <div className="flex items-center gap-1.5 text-xs text-[var(--dash-text-muted)]">
          <Clock className="size-3" />
          {formatRelativeDate(updatedAt)}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 border-t border-[var(--dash-border)] px-3 py-2">
        <Button
          variant="ghost"
          size="xs"
          className="text-[var(--dash-text-secondary)] hover:text-[var(--dash-text)]"
          asChild
        >
          <Link href={`/dashboard/${id}/preview`}>
            <Eye className="size-3" />
            View
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="xs"
          className="text-[var(--dash-text-secondary)] hover:text-[var(--dash-text)]"
          asChild
        >
          <Link href={`/dashboard/${id}`}>
            <RotateCcw className="size-3" />
            Manage
          </Link>
        </Button>
        <DeleteProjectDialog
          projectId={id}
          projectName={businessName}
          trigger={
            <Button
              variant="ghost"
              size="xs"
              className="ml-auto text-[var(--dash-text-muted)] hover:text-[var(--dash-error)]"
              aria-label={`Delete ${businessName}`}
            >
              <Trash2 className="size-3" />
            </Button>
          }
        />
      </div>
    </div>
  )
}
