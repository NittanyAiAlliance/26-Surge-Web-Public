"use client"

import { useState } from "react"
import {
  Globe,
  Copy,
  Check,
  Sparkles,
  RotateCcw,
  Trash2,
  FileCode2,
  Settings,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/data-display/status-badge"
import { DeleteProjectDialog } from "./delete-project-dialog"
import { RegenerateDialog } from "./regenerate-dialog"
import { DeployDialog } from "@/components/deploy/deploy-dialog"
import { OverviewTab } from "./detail/overview-tab"
import { FilesTab } from "./detail/files-tab"
import { SettingsTab } from "./detail/settings-tab"
import type { Project, ProjectFileMeta } from "@radiant/db"

interface ProjectDetailProps {
  project: Project
  files: ProjectFileMeta[]
}

function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-[var(--dash-text-muted)] hover:text-[var(--dash-text)]"
      onClick={handleCopy}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy URL"}
    </Button>
  )
}

export function ProjectDetail({ project, files }: ProjectDetailProps) {
  const liveUrl = `https://${project.subdomain}.surge.ishaannarang.xyz`
  const isLive = project.status === "deployed"
  const businessCategory = (project.config as Record<string, unknown>)?.category as string | undefined

  return (
    <div className="mx-auto max-w-6xl px-6">
      <PageHeader
        title={project.business_name}
        subtitle={businessCategory ?? project.industry ?? undefined}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: project.business_name },
        ]}
        actions={
          <>
            <StatusBadge status={project.status} />
            <CopyUrlButton url={isLive ? (project.vercel_deployment_url || liveUrl) : liveUrl} />
            <RegenerateDialog
              projectId={project.id}
              projectName={project.business_name}
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[var(--dash-text-muted)] hover:text-[var(--dash-vermillion)]"
                  data-testid="regenerate-btn"
                >
                  <Sparkles className="size-3.5" />
                  Regenerate
                </Button>
              }
            />
            <DeployDialog
              projectId={project.id}
              projectName={project.business_name}
              subdomain={project.subdomain}
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="border border-[var(--dash-border)] text-[var(--dash-text-muted)] hover:text-[var(--dash-vermillion)]"
                >
                  <RotateCcw className="size-3.5" />
                  {isLive ? "Redeploy" : "Deploy"}
                </Button>
              }
            />
            <DeleteProjectDialog
              projectId={project.id}
              projectName={project.business_name}
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[var(--dash-error)]/60 hover:text-[var(--dash-error)] hover:bg-[var(--dash-error)]/10"
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              }
            />
          </>
        }
      />

      {/* Tabs */}
      <Tabs defaultValue="overview" className="gap-6">
        <TabsList
          variant="line"
          className="border-b border-[var(--dash-border)] w-full justify-start rounded-none pb-0"
        >
          <TabsTrigger
            value="overview"
            className="text-[var(--dash-text-muted)] data-[state=active]:text-[var(--dash-text)] data-[state=active]:after:bg-[var(--dash-vermillion)]"
          >
            <Globe className="size-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="files"
            className="text-[var(--dash-text-muted)] data-[state=active]:text-[var(--dash-text)] data-[state=active]:after:bg-[var(--dash-vermillion)]"
          >
            <FileCode2 className="size-4" />
            Files
            <span className="ml-1 text-xs text-[var(--dash-text-faint)]">({files.length})</span>
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className="text-[var(--dash-text-muted)] data-[state=active]:text-[var(--dash-text)] data-[state=active]:after:bg-[var(--dash-vermillion)]"
          >
            <Settings className="size-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab project={project} fileCount={files.length} />
        </TabsContent>

        <TabsContent value="files">
          <FilesTab files={files} />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsTab project={project} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
