"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Undo2, Sparkles, AlertTriangle, ChevronDown } from "lucide-react"

interface SectionInfo {
  name: string
  componentPath: string
  displayOrder: number
}

interface PageInfo {
  path: string
  name: string
  sections: SectionInfo[]
}

interface EditPanelProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onEditComplete: (sectionName?: string) => void
  selectedSectionFromPreview?: string | null
  onSectionConsumed?: () => void
}

export function EditPanel({ projectId, open, onOpenChange, onEditComplete, selectedSectionFromPreview, onSectionConsumed }: EditPanelProps) {
  const [pages, setPages] = useState<PageInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedPage, setSelectedPage] = useState<string>("/")
  const [selectedSection, setSelectedSection] = useState<string>("")
  const [instruction, setInstruction] = useState("")
  const [editStatus, setEditStatus] = useState<"idle" | "editing" | "complete" | "failed">("idle")
  const [editError, setEditError] = useState<string>("")
  const [warnings, setWarnings] = useState<string[]>([])
  const [revertingSection, setRevertingSection] = useState<string | null>(null)
  const [smartInstruction, setSmartInstruction] = useState("")
  const [editingFiles, setEditingFiles] = useState<Array<{ file: string; status: "pending" | "editing" | "done" }>>([])
  const [showSpecific, setShowSpecific] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // When a section is selected from the preview iframe, update the selection
  useEffect(() => {
    if (!selectedSectionFromPreview || pages.length === 0) return

    // Find which page contains this section
    for (const page of pages) {
      const section = page.sections.find(s => s.name === selectedSectionFromPreview)
      if (section) {
        setSelectedPage(page.path)
        setSelectedSection(section.name)
        setEditStatus("idle")
        setWarnings([])
        setShowSpecific(true)
        break
      }
    }

    // Consume the selection so it doesn't re-trigger
    onSectionConsumed?.()
  }, [selectedSectionFromPreview, pages, onSectionConsumed])

  // Fetch structure when panel opens
  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/projects/${projectId}/structure`)
      .then((res) => res.json())
      .then((data) => {
        if (data.pages) {
          setPages(data.pages)
          if (data.pages.length > 0) {
            setSelectedPage(data.pages[0].path)
            if (data.pages[0].sections.length > 0) {
              setSelectedSection(data.pages[0].sections[0].name)
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, projectId])

  const currentPage = pages.find((p) => p.path === selectedPage)
  const currentSections = currentPage?.sections ?? []

  const handleApplyEdit = useCallback(async () => {
    if (!selectedSection || !instruction.trim()) return

    setEditStatus("editing")
    setEditError("")
    setWarnings([])

    abortRef.current = new AbortController()

    try {
      const res = await fetch(`/api/projects/${projectId}/sections/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionName: selectedSection,
          pagePath: selectedPage,
          instruction: instruction.trim(),
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Edit failed")
      }

      // Read SSE stream
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error("No response stream")

      let buffer = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.status === "complete") {
              setEditStatus("complete")
              setWarnings(event.warnings ?? [])
              setInstruction("")
              onEditComplete(selectedSection)
            } else if (event.status === "failed") {
              setEditStatus("failed")
              setEditError(event.error ?? "Unknown error")
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return
      setEditStatus("failed")
      setEditError(error instanceof Error ? error.message : "Edit failed")
    }
  }, [projectId, selectedPage, selectedSection, instruction, onEditComplete])

  const handleSmartEdit = useCallback(async () => {
    if (!smartInstruction.trim()) return

    setEditStatus("editing")
    setEditError("")
    setWarnings([])
    setEditingFiles([])

    abortRef.current = new AbortController()

    try {
      const res = await fetch(`/api/projects/${projectId}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: smartInstruction.trim() }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Edit failed")
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error("No response stream")

      let buffer = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const event = JSON.parse(line.slice(6))

            if (event.status === "routing") {
              setEditingFiles([{ file: "Analyzing...", status: "editing" }])
            } else if (event.status === "editing") {
              setEditingFiles((prev) => {
                const files = [...prev.filter((f) => f.file !== "Analyzing...")]
                // Mark previous files as done
                const updated: Array<{ file: string; status: "pending" | "editing" | "done" }> = files.map((f) => ({ ...f, status: "done" as const }))
                // Add current file
                updated.push({ file: event.file, status: "editing" })
                return updated
              })
            } else if (event.status === "complete") {
              setEditingFiles((prev) => prev.map((f) => ({ ...f, status: "done" as const })))
              setEditStatus("complete")
              // Collect all warnings from all edits
              const allWarnings: string[] = []
              if (event.edits) {
                for (const edit of event.edits) {
                  if (edit.warnings) allWarnings.push(...edit.warnings)
                }
              }
              setWarnings(allWarnings)
              setSmartInstruction("")
              onEditComplete()
            } else if (event.status === "failed") {
              setEditStatus("failed")
              setEditError(event.error ?? "Unknown error")
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return
      setEditStatus("failed")
      setEditError(error instanceof Error ? error.message : "Edit failed")
    }
  }, [projectId, smartInstruction, onEditComplete])

  const handleRevert = useCallback(async (componentPath: string) => {
    setRevertingSection(componentPath)
    try {
      const res = await fetch(`/api/projects/${projectId}/sections/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentPath }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Revert failed")
      }

      onEditComplete()
      setEditStatus("idle")
    } catch {
      // silently fail — user can retry
    } finally {
      setRevertingSection(null)
    }
  }, [projectId, onEditComplete])

  const handlePageChange = (path: string) => {
    setSelectedPage(path)
    const page = pages.find((p) => p.path === path)
    if (page && page.sections.length > 0) {
      setSelectedSection(page.sections[0].name)
    } else {
      setSelectedSection("")
    }
    setEditStatus("idle")
    setWarnings([])
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[400px] sm:w-[440px] border-[var(--dash-border)] bg-[var(--dash-bg)] p-0 flex flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-4">
          <SheetTitle className="text-[var(--dash-text)] font-body text-base">
            Edit
          </SheetTitle>
        </SheetHeader>

        <Separator className="bg-[var(--dash-border)]" />

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-5">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-[var(--dash-text-muted)]" />
              </div>
            ) : pages.length === 0 ? (
              <p className="text-sm text-[var(--dash-text-muted)] text-center py-8">
                No sections found. Generate a website first.
              </p>
            ) : (
              <>
                {/* ── Smart Edit (Default) ── */}
                <div className="space-y-3">
                  <Textarea
                    placeholder='Describe what you want to change — e.g., "Make the colors warmer" or "Add my phone number to the hero"'
                    value={smartInstruction}
                    onChange={(e) => setSmartInstruction(e.target.value)}
                    className="min-h-[100px] bg-[var(--dash-surface)] border-[var(--dash-border)] text-[var(--dash-text)] placeholder:text-[var(--dash-text-faint)] text-sm resize-none focus-visible:ring-[var(--dash-vermillion)]"
                    maxLength={2000}
                    disabled={editStatus === "editing"}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[var(--dash-text-faint)]">
                      {smartInstruction.length}/2000
                    </span>
                  </div>
                  <Button
                    onClick={handleSmartEdit}
                    disabled={!smartInstruction.trim() || editStatus === "editing"}
                    className="w-full bg-[var(--dash-vermillion)] text-white hover:bg-[var(--dash-vermillion)]/90 font-semibold"
                  >
                    {editStatus === "editing" ? (
                      <>
                        <Loader2 className="size-4 animate-spin mr-2" />
                        Editing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-4 mr-2" />
                        Apply Edit
                      </>
                    )}
                  </Button>
                </div>

                {/* ── Multi-file Progress ── */}
                {editingFiles.length > 0 && (
                  <div className="space-y-1.5">
                    {editingFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {f.status === "editing" ? (
                          <Loader2 className="size-3 animate-spin text-[var(--dash-vermillion)]" />
                        ) : f.status === "done" ? (
                          <div className="size-3 rounded-full bg-emerald-500" />
                        ) : (
                          <div className="size-3 rounded-full bg-[var(--dash-border)]" />
                        )}
                        <span className={f.status === "editing" ? "text-[var(--dash-text)]" : "text-[var(--dash-text-muted)]"}>
                          {f.file}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Status Messages */}
                {editStatus === "complete" && (
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-400">
                    Edit applied successfully. Preview has been refreshed.
                  </div>
                )}

                {editStatus === "failed" && editError && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
                    {editError}
                  </div>
                )}

                {warnings.length > 0 && (
                  <div className="space-y-1">
                    {warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-400">
                        <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                        {w}
                      </div>
                    ))}
                  </div>
                )}

                <Separator className="bg-[var(--dash-border)]" />

                {/* ── Specific Section (Collapsible) ── */}
                <button
                  onClick={() => setShowSpecific(!showSpecific)}
                  className="flex items-center gap-2 text-xs text-[var(--dash-text-muted)] hover:text-[var(--dash-text)] transition-colors w-full"
                >
                  <ChevronDown className={`size-3.5 transition-transform ${showSpecific ? "rotate-0" : "-rotate-90"}`} />
                  Choose specific section
                </button>

                {showSpecific && (
                  <div className="space-y-4 pl-2 border-l-2 border-[var(--dash-border)]">
                    {/* Page Selector */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-[var(--dash-text-muted)] uppercase tracking-wider">
                        Page
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {pages.map((page) => (
                          <button
                            key={page.path}
                            onClick={() => handlePageChange(page.path)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                              selectedPage === page.path
                                ? "bg-[var(--dash-active)] text-[var(--dash-text)] ring-1 ring-[var(--dash-border)]"
                                : "text-[var(--dash-text-muted)] hover:text-[var(--dash-text)] hover:bg-[var(--dash-surface)]"
                            }`}
                          >
                            {page.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Section Selector */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-[var(--dash-text-muted)] uppercase tracking-wider">
                        Section
                      </label>
                      <div className="space-y-1">
                        {currentSections.map((section) => (
                          <button
                            key={section.name}
                            onClick={() => {
                              setSelectedSection(section.name)
                              setEditStatus("idle")
                              setWarnings([])
                            }}
                            className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-all ${
                              selectedSection === section.name
                                ? "bg-[var(--dash-active)] text-[var(--dash-text)] ring-1 ring-[var(--dash-border)]"
                                : "text-[var(--dash-text-muted)] hover:text-[var(--dash-text)] hover:bg-[var(--dash-surface)]"
                            }`}
                          >
                            <span className="capitalize font-medium">{section.name}</span>
                            <Badge
                              variant="outline"
                              className="text-[10px] border-[var(--dash-border)] text-[var(--dash-text-faint)]"
                            >
                              {section.componentPath.split("/").pop()}
                            </Badge>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Instruction + Apply for specific mode */}
                    <div className="space-y-2">
                      <Textarea
                        placeholder='e.g., "Make the headline bigger"'
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        className="min-h-[80px] bg-[var(--dash-surface)] border-[var(--dash-border)] text-[var(--dash-text)] placeholder:text-[var(--dash-text-faint)] text-sm resize-none focus-visible:ring-[var(--dash-vermillion)]"
                        maxLength={2000}
                        disabled={editStatus === "editing"}
                      />
                      <Button
                        onClick={handleApplyEdit}
                        disabled={!selectedSection || !instruction.trim() || editStatus === "editing"}
                        size="sm"
                        className="w-full bg-[var(--dash-surface)] text-[var(--dash-text)] border border-[var(--dash-border)] hover:bg-[var(--dash-active)]"
                      >
                        Edit {selectedSection || "section"}
                      </Button>
                    </div>
                  </div>
                )}

                <Separator className="bg-[var(--dash-border)]" />

                {/* ── Undo per section (always visible) ── */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--dash-text-muted)] uppercase tracking-wider">
                    Undo
                  </label>
                  {pages.flatMap((page) =>
                    page.sections
                      .filter((s) => s.componentPath.startsWith("components/"))
                      .map((section) => (
                        <div key={section.componentPath} className="flex items-center justify-between py-1.5 px-2 rounded text-xs">
                          <span className="text-[var(--dash-text-muted)] capitalize">{section.name}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[var(--dash-text-faint)] text-[10px]">{section.componentPath.split("/").pop()}</span>
                            {revertingSection === section.componentPath ? (
                              <Loader2 className="size-3 animate-spin text-[var(--dash-text-muted)]" />
                            ) : (
                              <button
                                onClick={() => handleRevert(section.componentPath)}
                                className="p-0.5 rounded text-[var(--dash-text-faint)] hover:text-[var(--dash-text-muted)] transition-colors"
                                title="Undo last edit"
                              >
                                <Undo2 className="size-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
