"use client"

import { Button } from "@/components/ui/button"
import type { Project } from "@radiant/db"

interface SettingsTabProps {
  project: Project
}

export function SettingsTab({ project }: SettingsTabProps) {
  return (
    <div className="max-w-2xl space-y-6">
      {/* Subdomain setting */}
      <div className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-5">
        <h3 className="font-display text-sm font-semibold text-[var(--dash-text)] mb-1">
          Custom Subdomain
        </h3>
        <p className="text-xs text-[var(--dash-text-muted)] mb-4">
          Change the URL slug for your deployed site
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-elevated)] px-3 py-2">
            <span className="text-sm text-[var(--dash-text-secondary)] font-mono">
              {project.subdomain}
            </span>
            <span className="text-sm text-[var(--dash-text-muted)] font-mono">.surge.ishaannarang.xyz</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-[var(--dash-border)] text-[var(--dash-text-secondary)] hover:text-[var(--dash-text)]"
            disabled
          >
            Change
          </Button>
        </div>
      </div>
    </div>
  )
}
