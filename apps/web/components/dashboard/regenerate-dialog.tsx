"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, Sparkles, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

type RegenerateMode = "full" | "partial"
type RegenerateStatus = "idle" | "regenerating" | "success" | "error"
type PipelineStep =
  | "queued"
  | "scrape_website"
  | "scaffold"
  | "homepage"
  | "page"
  | "complete"
  | "failed"
  | "cancelled"

interface RegenerateDialogProps {
  projectId: string
  projectName: string
  trigger: React.ReactNode
}

const progressStages: Array<{ key: PipelineStep; label: string }> = [
  { key: "queued", label: "Preparing regeneration..." },
  { key: "scrape_website", label: "Scraping website content..." },
  { key: "scaffold", label: "Building site structure..." },
  { key: "homepage", label: "Creating homepage..." },
  { key: "page", label: "Creating additional pages..." },
  { key: "complete", label: "Regeneration complete!" },
]

function normalizeStep(step: unknown): PipelineStep {
  if (typeof step !== "string" || step.length === 0) return "queued"
  if (step.startsWith("page_")) return "page"
  if (step === "complete") return "complete"
  if (step === "cancelled") return "cancelled"
  if (step === "failed") return "failed"
  if (step === "scrape_website") return "scrape_website"
  if (step === "scaffold") return "scaffold"
  if (step === "homepage") return "homepage"
  return "queued"
}

export function RegenerateDialog({
  projectId,
  projectName,
  trigger,
}: RegenerateDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<RegenerateMode>("full")
  const [customInstructions, setCustomInstructions] = useState("")
  const [status, setStatus] = useState<RegenerateStatus>("idle")
  const [currentStep, setCurrentStep] = useState<PipelineStep>("queued")
  const [error, setError] = useState<string | null>(null)

  function resetState() {
    setMode("full")
    setCustomInstructions("")
    setStatus("idle")
    setCurrentStep("queued")
    setError(null)
  }

  useEffect(() => {
    if (status !== "regenerating") return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/generate/${projectId}/status`)
        if (!res.ok) return

        const data = await res.json()
        const nextStep = normalizeStep(data.step)
        setCurrentStep(nextStep)

        if (data.status === "preview") {
          clearInterval(interval)
          setStatus("success")
          setCurrentStep("complete")
          toast.success("Website regenerated successfully!")
          setTimeout(() => {
            setOpen(false)
            resetState()
            router.refresh()
          }, 1500)
          return
        }

        if (data.status === "failed") {
          clearInterval(interval)
          const message =
            nextStep === "cancelled"
              ? "Generation cancelled."
              : "Generation failed. Please try again."
          setError(message)
          setStatus("error")
          toast.error("Regeneration failed", { description: message })
        }
      } catch {
        // Retry on the next poll tick.
      }
    }, 4000)

    return () => clearInterval(interval)
  }, [projectId, router, status])

  const handleRegenerate = useCallback(async () => {
    setStatus("regenerating")
    setError(null)
    setCurrentStep("queued")

    try {
      const body: Record<string, string> = { mode }
      if (mode === "partial" && customInstructions.trim()) {
        body.customInstructions = customInstructions.trim()
      }

      const res = await fetch(`/api/projects/${projectId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Regeneration failed" }))
        throw new Error(data.error || `Regeneration failed (${res.status})`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Regeneration failed"
      setError(message)
      setStatus("error")
      toast.error("Regeneration failed", { description: message })
    }
  }, [customInstructions, mode, projectId])

  function handleOpenChange(next: boolean) {
    if (status === "regenerating") return
    setOpen(next)
    if (!next) resetState()
  }

  const canSubmit = mode === "full" || customInstructions.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="bg-[var(--dash-elevated)] border-[var(--dash-border)] text-[var(--dash-text)] sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex size-10 items-center justify-center rounded-full bg-[var(--dash-vermillion)]/10">
              <Sparkles className="size-5 text-[var(--dash-vermillion)]" />
            </div>
            <DialogTitle className="text-[var(--dash-text)]">Regenerate Website</DialogTitle>
          </div>
          <DialogDescription className="text-[var(--dash-text-secondary)]">
            Generate a new version of the website for{" "}
            <span className="font-medium text-[var(--dash-text)]">{projectName}</span>.
            This will replace all existing generated files.
          </DialogDescription>
        </DialogHeader>

        {status === "idle" || status === "error" ? (
          <>
            <div className="space-y-3">
              <label className="text-sm font-medium text-[var(--dash-text-secondary)]">
                Regeneration mode
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMode("full")}
                  data-testid="mode-full"
                  className={`flex flex-col items-start gap-1.5 rounded-[10px] border p-4 text-left transition-all ${
                    mode === "full"
                      ? "border-[var(--dash-vermillion)]/40 bg-[var(--dash-vermillion)]/[0.06]"
                      : "border-[var(--dash-border)] bg-[var(--dash-surface)] hover:border-[var(--dash-text-muted)]"
                  }`}
                >
                  <RefreshCw
                    className={`size-5 ${mode === "full" ? "text-[var(--dash-vermillion)]" : "text-[var(--dash-text-muted)]"}`}
                  />
                  <span
                    className={`text-sm font-medium ${mode === "full" ? "text-[var(--dash-text)]" : "text-[var(--dash-text-secondary)]"}`}
                  >
                    Full Regenerate
                  </span>
                  <span className="text-xs text-[var(--dash-text-muted)]">
                    Completely new design
                  </span>
                </button>

                <button
                  onClick={() => setMode("partial")}
                  data-testid="mode-partial"
                  className={`flex flex-col items-start gap-1.5 rounded-[10px] border p-4 text-left transition-all ${
                    mode === "partial"
                      ? "border-[var(--dash-vermillion)]/40 bg-[var(--dash-vermillion)]/[0.06]"
                      : "border-[var(--dash-border)] bg-[var(--dash-surface)] hover:border-[var(--dash-text-muted)]"
                  }`}
                >
                  <Sparkles
                    className={`size-5 ${mode === "partial" ? "text-[var(--dash-vermillion)]" : "text-[var(--dash-text-muted)]"}`}
                  />
                  <span
                    className={`text-sm font-medium ${mode === "partial" ? "text-[var(--dash-text)]" : "text-[var(--dash-text-secondary)]"}`}
                  >
                    With Instructions
                  </span>
                  <span className="text-xs text-[var(--dash-text-muted)]">
                    Specify what to change
                  </span>
                </button>
              </div>
            </div>

            {mode === "partial" && (
              <div className="space-y-2">
                <label
                  htmlFor="custom-instructions"
                  className="text-sm font-medium text-[var(--dash-text-secondary)]"
                >
                  What would you like to change?
                </label>
                <Textarea
                  id="custom-instructions"
                  data-testid="custom-instructions"
                  placeholder='e.g. "Use a blue color scheme" or "Add a testimonials section" or "Make it more modern and minimalist"'
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  className="min-h-24 border-[var(--dash-border)] bg-[var(--dash-surface)] text-[var(--dash-text)] placeholder:text-[var(--dash-text-muted)] focus-visible:border-[var(--dash-vermillion)]/40 focus-visible:ring-[var(--dash-vermillion)]/20"
                />
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-md bg-[var(--dash-error)]/10 border border-[var(--dash-error)]/20 px-3 py-2 text-sm text-[var(--dash-error)]">
                <XCircle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="ghost"
                className="text-[var(--dash-text-secondary)] hover:text-[var(--dash-text)]"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRegenerate}
                disabled={!canSubmit}
                data-testid="regenerate-confirm-btn"
                className="bg-[var(--dash-vermillion)] text-white font-semibold hover:bg-[var(--dash-vermillion)]/90 disabled:opacity-40"
              >
                <RefreshCw className="size-4" />
                Regenerate
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="py-4 space-y-4">
            {progressStages.map((stage) => {
              const stageIdx = progressStages.findIndex((s) => s.key === stage.key)
              const currentIdx = progressStages.findIndex((s) => s.key === currentStep)
              const isComplete = currentIdx > stageIdx
              const isActive = currentIdx === stageIdx
              const isPending = currentIdx < stageIdx

              if (isPending && status !== "success") return null

              return (
                <div
                  key={stage.key}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-all duration-300 ${
                    isComplete || (isActive && status === "success")
                      ? "border-[var(--dash-teal)]/20 bg-[var(--dash-teal)]/[0.03]"
                      : isActive
                        ? "border-[var(--dash-warning)]/20 bg-[var(--dash-warning)]/[0.03]"
                        : "border-[var(--dash-border)] bg-transparent opacity-40"
                  }`}
                >
                  {isComplete || (isActive && status === "success") ? (
                    <CheckCircle2 className="size-4 shrink-0 text-[var(--dash-teal)]" />
                  ) : isActive ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-[var(--dash-warning)]" />
                  ) : (
                    <div className="size-4 shrink-0 rounded-full border border-[var(--dash-border)]" />
                  )}
                  <span
                    className={`text-sm ${
                      isComplete || (isActive && status === "success")
                        ? "text-[var(--dash-teal)]"
                        : isActive
                          ? "text-[var(--dash-text)]"
                          : "text-[var(--dash-text-muted)]"
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
