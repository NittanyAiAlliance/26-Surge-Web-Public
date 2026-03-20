"use client"

import { useState } from "react"
import {
  ChevronRight,
  ChevronDown,
  FileCode2,
  Loader2,
} from "lucide-react"
import type { ProjectFileMeta } from "@radiant/db"

interface FilesTabProps {
  files: ProjectFileMeta[]
}

export function FilesTab({ files }: FilesTabProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [fileContents, setFileContents] = useState<Record<string, string>>({})
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set())

  async function toggleFile(fileId: string) {
    if (expandedFiles.has(fileId)) {
      setExpandedFiles((prev) => {
        const next = new Set(prev)
        next.delete(fileId)
        return next
      })
      return
    }

    // Expand the file
    setExpandedFiles((prev) => new Set(prev).add(fileId))

    // Load content if not already loaded
    if (!fileContents[fileId]) {
      setLoadingFiles((prev) => new Set(prev).add(fileId))
      try {
        const res = await fetch(`/api/projects/files/${fileId}`)
        if (res.ok) {
          const data = await res.json()
          setFileContents((prev) => ({ ...prev, [fileId]: data.content }))
        }
      } finally {
        setLoadingFiles((prev) => {
          const next = new Set(prev)
          next.delete(fileId)
          return next
        })
      }
    }
  }

  if (files.length === 0) {
    return (
      <div className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-8 text-center">
        <FileCode2 className="mx-auto size-8 text-[var(--dash-text-muted)] mb-3" />
        <p className="text-sm text-[var(--dash-text-muted)]">No files generated yet</p>
      </div>
    )
  }

  return (
    <div className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] divide-y divide-[var(--dash-border)]">
      {files.map((file) => {
        const isExpanded = expandedFiles.has(file.id)
        const isLoading = loadingFiles.has(file.id)
        const content = fileContents[file.id]
        return (
          <div key={file.id}>
            <button
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--dash-elevated)] transition-colors"
              onClick={() => toggleFile(file.id)}
            >
              {isExpanded ? (
                <ChevronDown className="size-4 text-[var(--dash-text-muted)] shrink-0" />
              ) : (
                <ChevronRight className="size-4 text-[var(--dash-text-muted)] shrink-0" />
              )}
              <FileCode2 className="size-4 text-[var(--dash-vermillion)]/60 shrink-0" />
              <span className="text-sm text-[var(--dash-text-secondary)] font-mono truncate">
                {file.file_path}
              </span>
              {file.file_type && (
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-faint)] shrink-0">
                  {file.file_type}
                </span>
              )}
            </button>
            {isExpanded && (
              <div className="bg-[var(--dash-bg)]/50 border-t border-[var(--dash-border)] overflow-x-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-4 animate-spin text-[var(--dash-text-muted)]" />
                  </div>
                ) : (
                  <pre className="p-4 text-xs text-[var(--dash-text-secondary)] font-mono leading-relaxed whitespace-pre">
                    {content ?? ""}
                  </pre>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
