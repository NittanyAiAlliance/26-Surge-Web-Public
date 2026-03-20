import type { ProjectStatus } from "@radiant/db"

export interface StatusConfig {
  label: string
  dotClass: string
  textClass: string
  bgClass: string
}

export const STATUS_CONFIG: Record<ProjectStatus, StatusConfig> = {
  draft: {
    label: "Draft",
    dotClass: "bg-[var(--dash-text-muted)]",
    textClass: "text-[var(--dash-text-muted)]",
    bgClass: "bg-[var(--dash-text-muted)]/10",
  },
  generating: {
    label: "Generating",
    dotClass: "bg-[var(--dash-warning)] animate-pulse",
    textClass: "text-[var(--dash-warning)]",
    bgClass: "bg-[var(--dash-warning-bg)]",
  },
  preview: {
    label: "Preview",
    dotClass: "bg-[var(--dash-sapphire)]",
    textClass: "text-[var(--dash-sapphire)]",
    bgClass: "bg-[var(--dash-info-bg)]",
  },
  deployed: {
    label: "Live",
    dotClass: "bg-[var(--dash-teal)]",
    textClass: "text-[var(--dash-teal)]",
    bgClass: "bg-[var(--dash-success-bg)]",
  },
  failed: {
    label: "Failed",
    dotClass: "bg-[var(--dash-error)]",
    textClass: "text-[var(--dash-error)]",
    bgClass: "bg-[var(--dash-error-bg)]",
  },
}
