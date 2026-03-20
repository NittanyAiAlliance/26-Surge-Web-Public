"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Rocket,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

type DeployStatus = "idle" | "deploying" | "success" | "error"

interface DeployDialogProps {
  projectId: string
  projectName: string
  subdomain: string
  trigger: React.ReactNode
}

const deployStages = [
  { key: "starting", label: "Starting deployment..." },
  { key: "preparing", label: "Preparing files..." },
  { key: "creating_project", label: "Setting up Vercel project..." },
  { key: "uploading", label: "Uploading files..." },
  { key: "building", label: "Building website..." },
  { key: "assigning_domain", label: "Assigning custom domain..." },
  { key: "complete", label: "Deployment complete!" },
]

export function DeployDialog({
  projectId,
  projectName,
  subdomain,
  trigger,
}: DeployDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<DeployStatus>("idle")
  const [currentStep, setCurrentStep] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  function resetState() {
    setStatus("idle")
    setCurrentStep("")
    setError(null)
    setLiveUrl(null)
    setCopied(false)
  }

  const handleCopyUrl = useCallback(() => {
    if (liveUrl) {
      navigator.clipboard.writeText(liveUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [liveUrl])

  const handleDeploy = useCallback(async () => {
    setStatus("deploying")
    setError(null)
    setCurrentStep("starting")

    try {
      abortRef.current = new AbortController()

      // Activity-based timeout (5 minutes of no SSE data)
      let lastActivity = Date.now()
      const timeout = setInterval(() => {
        if (Date.now() - lastActivity > 300_000) {
          clearInterval(timeout)
          abortRef.current?.abort()
          setError("No response from server for 5 minutes. Deployment may have failed.")
          setStatus("error")
          toast.error("Deployment timed out")
        }
      }, 10_000)

      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ projectId }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        clearInterval(timeout)
        const data = await res.json().catch(() => ({ error: "Deployment failed" }))
        throw new Error(data.error || `Deployment failed (${res.status})`)
      }

      // Read SSE stream
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let gotResult = false

      if (reader) {
        let buffer = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          lastActivity = Date.now()
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          let eventType = ""
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7)
            } else if (line.startsWith("data: ")) {
              const parsed = JSON.parse(line.slice(6))
              if (eventType === "progress") {
                setCurrentStep(parsed.step || "")
              } else if (eventType === "complete") {
                gotResult = true
                clearInterval(timeout)
                setLiveUrl(parsed.url || `https://${subdomain}.surge.ishaannarang.xyz`)
                setStatus("success")
                setCurrentStep("complete")
                toast.success("Website deployed successfully!")
              } else if (eventType === "error") {
                gotResult = true
                clearInterval(timeout)
                throw new Error(parsed.error || "Deployment failed")
              }
            }
          }
        }
      }

      clearInterval(timeout)

      if (!gotResult) {
        throw new Error("Connection lost during deployment. Check your dashboard — it may have completed.")
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (!error) {
          setError("Deployment timed out. Please try again.")
          setStatus("error")
        }
        return
      }
      const message = err instanceof Error ? err.message : "Deployment failed"
      setError(message)
      setStatus("error")
      toast.error("Deployment failed", { description: message })
    }
  }, [projectId, subdomain, error])

  function handleOpenChange(next: boolean) {
    if (status === "deploying") return
    setOpen(next)
    if (!next) {
      resetState()
      if (status === "success") {
        router.refresh()
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="bg-[var(--dash-elevated)] border-[var(--dash-border)] text-[var(--dash-text)] sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex size-10 items-center justify-center rounded-full bg-[var(--dash-vermillion)]/10">
              <Rocket className="size-5 text-[var(--dash-vermillion)]" />
            </div>
            <DialogTitle className="text-[var(--dash-text)]">Deploy Website</DialogTitle>
          </div>
          <DialogDescription className="text-[var(--dash-text-secondary)]">
            {status === "idle" || status === "error" ? (
              <>
                Deploy{" "}
                <span className="font-medium text-[var(--dash-text)]">{projectName}</span>{" "}
                to{" "}
                <span className="font-mono text-xs text-[var(--dash-vermillion)]/70">
                  {subdomain}.surge.ishaannarang.xyz
                </span>
              </>
            ) : status === "success" ? (
              "Your website is now live!"
            ) : (
              "Deploying your website to Vercel..."
            )}
          </DialogDescription>
        </DialogHeader>

        {status === "idle" || status === "error" ? (
          <>
            <div className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--dash-text-muted)]">Project</span>
                <span className="text-sm text-[var(--dash-text-secondary)]">{projectName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--dash-text-muted)]">Domain</span>
                <span className="text-xs text-[var(--dash-text-secondary)] font-mono">
                  {subdomain}.surge.ishaannarang.xyz
                </span>
              </div>
            </div>

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
                onClick={handleDeploy}
                data-testid="deploy-confirm-btn"
                className="bg-[var(--dash-vermillion)] text-white font-semibold hover:bg-[var(--dash-vermillion)]/90"
              >
                <Rocket className="size-4" />
                Deploy Now
              </Button>
            </DialogFooter>
          </>
        ) : status === "success" ? (
          /* Success view */
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-[var(--dash-teal)]/20 bg-[var(--dash-teal)]/[0.03] p-4">
              <CheckCircle2 className="size-5 shrink-0 text-[var(--dash-teal)]" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--dash-teal)]">
                  Successfully deployed!
                </p>
                {liveUrl && (
                  <p className="text-xs text-[var(--dash-text-secondary)] font-mono truncate mt-1">
                    {liveUrl}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              {liveUrl && (
                <>
                  <Button
                    asChild
                    className="flex-1 bg-[var(--dash-vermillion)] text-white font-semibold hover:bg-[var(--dash-vermillion)]/90"
                  >
                    <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="size-4" />
                      Visit Site
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    className="border-[var(--dash-border)] text-[var(--dash-text-secondary)] hover:text-[var(--dash-text)]"
                    onClick={handleCopyUrl}
                  >
                    {copied ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {copied ? "Copied" : "Copy URL"}
                  </Button>
                </>
              )}
            </div>

            <Button
              variant="ghost"
              className="w-full text-[var(--dash-text-muted)] hover:text-[var(--dash-text-secondary)]"
              onClick={() => {
                setOpen(false)
                resetState()
                router.refresh()
              }}
            >
              Close
            </Button>
          </div>
        ) : (
          /* Progress view */
          <div className="py-4 space-y-3">
            {deployStages.map((stage) => {
              const stageIdx = deployStages.findIndex((s) => s.key === stage.key)
              const currentIdx = deployStages.findIndex(
                (s) => s.key === currentStep
              )
              const isComplete = currentIdx > stageIdx
              const isActive = currentIdx === stageIdx

              if (!isComplete && !isActive) return null

              return (
                <div
                  key={stage.key}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-all duration-300 ${
                    isComplete
                      ? "border-[var(--dash-teal)]/20 bg-[var(--dash-teal)]/[0.03]"
                      : "border-[var(--dash-warning)]/20 bg-[var(--dash-warning)]/[0.03]"
                  }`}
                >
                  {isComplete ? (
                    <CheckCircle2 className="size-4 shrink-0 text-[var(--dash-teal)]" />
                  ) : (
                    <Loader2 className="size-4 shrink-0 animate-spin text-[var(--dash-warning)]" />
                  )}
                  <span
                    className={`text-sm ${
                      isComplete ? "text-[var(--dash-teal)]" : "text-[var(--dash-text)]"
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
