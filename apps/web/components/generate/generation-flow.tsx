"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Search,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  MapPin,
  Star,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Globe,
  Building2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Upload, FileText, Type } from "lucide-react"
import type { GenerationMode } from "@/lib/types/generation"
import { getStagesForMode, getStepLabelsForMode } from "@/lib/types/generation"

type Step = "input" | "scraping" | "confirm" | "generating" | "done"

interface BusinessData {
  name: string
  address: string
  city: string
  state: string
  phone: string
  rating: number
  reviewCount: number
  category: string
  industry: string
  hours: Array<{ day: string; open: string; close: string }>
  photos: Array<{ url: string; width: number; height: number }>
  reviews: Array<{ author: string; rating: number; text: string; date: string }>
  website?: string
  location: { lat: number; lng: number }
  existingContent?: {
    headlines: string[]
    descriptions: string[]
    services: string[]
    about: string
  }
}

interface ProgressEvent {
  stage: string
  message: string
  detail?: string
  percent?: number
}

const scrapeStages = [
  { key: "searching", label: "Finding business on Google..." },
  { key: "analyzing", label: "Analyzing business data..." },
]

export function GenerationFlow() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("input")
  const [businessName, setBusinessName] = useState("")
  const [location, setLocation] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [business, setBusiness] = useState<BusinessData | null>(null)
  const [scrapeStageIdx, setScrapeStageIdx] = useState(0)
  const [genProgress, setGenProgress] = useState<ProgressEvent | null>(null)
  const [genPercent, setGenPercent] = useState(0)
  const [projectId, setProjectId] = useState<string | null>(null)

  const [activeMode, setActiveMode] = useState<GenerationMode>("business")
  // Custom context state
  const [projectName, setProjectName] = useState("")
  const [customContext, setCustomContext] = useState("")
  const [customInstructions, setCustomInstructions] = useState("")
  // Portfolio state
  const [resumeText, setResumeText] = useState("")
  const [portfolioPreferences, setPortfolioPreferences] = useState("")
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [pdfFileName, setPdfFileName] = useState<string | null>(null)

  const currentStages = getStagesForMode(activeMode)
  const currentStepMeta = getStepLabelsForMode(activeMode)

  const handleCancel = useCallback(async () => {
    setError(null)
    if (step === "scraping") {
      setStep("input")
    } else if (step === "generating") {
      if (projectId) {
        try {
          await fetch(`/api/generate/${projectId}/cancel`, { method: "POST" })
        } catch {
          // Cancel is best-effort
        }
      }
      setError("Generation cancelled")
      setStep(activeMode === "business" ? "confirm" : "input")
    }
  }, [step, projectId, activeMode])

  // Poll generation status every 4 seconds
  useEffect(() => {
    if (step !== "generating" || !projectId) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/generate/${projectId}/status`)
        if (!res.ok) return

        const data = await res.json()

        setGenProgress({
          stage: data.step ?? "starting",
          message: data.step ?? "Starting...",
          percent: data.percent ?? 0,
        })
        if (typeof data.percent === "number") {
          setGenPercent(data.percent)
        }

        if (data.status === "preview") {
          clearInterval(interval)
          setStep("done")
          setTimeout(() => router.push(`/dashboard/${projectId}/preview`), 1200)
        } else if (data.status === "failed") {
          clearInterval(interval)
          setError(data.step === "cancelled" ? "Generation cancelled" : "Generation failed. Please try again.")
          setStep(activeMode === "business" ? "confirm" : "input")
        }
      } catch {
        // Polling error — retry on next interval
      }
    }, 4000)

    return () => clearInterval(interval)
  }, [step, projectId, router, activeMode])

  const handleScrape = useCallback(async () => {
    if (!businessName.trim() || !location.trim()) return
    setError(null)
    setStep("scraping")
    setScrapeStageIdx(0)

    // Animate through scraping stages
    const timer1 = setTimeout(() => setScrapeStageIdx(1), 1500)
    const timer2 = setTimeout(() => setScrapeStageIdx(2), 3000)

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          location: location.trim(),
        }),
      })

      clearTimeout(timer1)
      clearTimeout(timer2)

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Scraping failed" }))
        throw new Error(data.error || `Scraping failed (${res.status})`)
      }

      const { data } = await res.json()
      setBusiness(data)
      setStep("confirm")
    } catch (err) {
      clearTimeout(timer1)
      clearTimeout(timer2)
      const message = err instanceof Error ? err.message : "Failed to find business"
      setError(message)
      toast.error("Search failed", { description: message })
      setStep("input")
    }
  }, [businessName, location])

  const handleGenerate = useCallback(async () => {
    if (!business) return
    setError(null)
    setStep("generating")
    setGenPercent(0)
    setGenProgress(null)

    toast.info("Generating your website...", { description: "You'll see real-time progress below." })

    try {
      // Step 1: Create a project
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: business.name,
          industry: business.industry,
        }),
      })

      if (!createRes.ok) {
        const d = await createRes.json().catch(() => ({ error: "Failed to create project" }))
        throw new Error(d.error || "Failed to create project")
      }

      const { projectId: pid } = await createRes.json()
      setProjectId(pid)

      // Step 2: Kick off generation (returns 202 with projectId)
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, businessProfile: business }),
      })

      if (!genRes.ok) {
        const d = await genRes.json().catch(() => ({ error: "Generation failed" }))
        throw new Error(d.error || `Generation failed (${genRes.status})`)
      }

      // Generation kicked off — polling useEffect will track progress
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed"
      setError(message)
      toast.error("Failed to generate", { description: "Please try again." })
      setStep("confirm")
    }
  }, [business])

  const handleGenerateCustom = useCallback(async () => {
    if (!projectName.trim() || !customContext.trim()) return
    setError(null)
    setStep("generating")
    setGenPercent(0)
    setGenProgress(null)

    try {
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: projectName.trim() }),
      })
      if (!createRes.ok) {
        const d = await createRes.json().catch(() => ({ error: "Failed to create project" }))
        throw new Error(d.error || "Failed to create project")
      }
      const { projectId: pid } = await createRes.json()
      setProjectId(pid)

      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: pid,
          mode: "custom",
          projectName: projectName.trim(),
          customContext: customContext.trim(),
          customInstructions: customInstructions.trim() || undefined,
        }),
      })
      if (!genRes.ok) {
        const d = await genRes.json().catch(() => ({ error: "Generation failed" }))
        throw new Error(d.error || "Generation failed")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed"
      setError(message)
      toast.error("Failed to generate", { description: "Please try again." })
      setStep("input")
    }
  }, [projectName, customContext, customInstructions])

  const handleGeneratePortfolio = useCallback(async () => {
    if (!resumeText.trim()) return
    setError(null)
    setStep("generating")
    setGenPercent(0)
    setGenProgress(null)

    // Extract name from resume (first line or first few words)
    const nameFromResume = resumeText.split("\n")[0]?.trim().slice(0, 100) || "Portfolio"

    try {
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: nameFromResume }),
      })
      if (!createRes.ok) {
        const d = await createRes.json().catch(() => ({ error: "Failed to create project" }))
        throw new Error(d.error || "Failed to create project")
      }
      const { projectId: pid } = await createRes.json()
      setProjectId(pid)

      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: pid,
          mode: "portfolio",
          projectName: nameFromResume,
          resumeText: resumeText.trim(),
          portfolioPreferences: portfolioPreferences.trim() || undefined,
        }),
      })
      if (!genRes.ok) {
        const d = await genRes.json().catch(() => ({ error: "Generation failed" }))
        throw new Error(d.error || "Generation failed")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed"
      setError(message)
      toast.error("Failed to generate", { description: "Please try again." })
      setStep("input")
    }
  }, [resumeText, portfolioPreferences])

  const handlePdfUpload = useCallback(async (file: File) => {
    setUploadingPdf(true)
    setPdfFileName(file.name)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/parse-resume", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Failed to parse PDF" }))
        throw new Error(d.error || "Failed to parse PDF")
      }

      const { text } = await res.json()
      setResumeText(text)
      toast.success("Resume parsed!", { description: `Extracted ${text.length} characters` })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to parse PDF"
      setError(message)
      toast.error("PDF parsing failed", { description: message })
      setPdfFileName(null)
    } finally {
      setUploadingPdf(false)
    }
  }, [])

  const handleBack = useCallback(() => {
    setError(null)
    if (step === "confirm") {
      setStep("input")
      setBusiness(null)
    } else if (step === "generating") {
      setStep("confirm")
    }
  }, [step])

  // Current step index for indicator
  const stepOrder: Step[] = ["input", "scraping", "confirm", "generating", "done"]
  const currentIdx = stepOrder.indexOf(step)

  // For non-business modes (no confirm step), step numbering is: input=1, generating=2, done=3
  const displayStepNum =
    activeMode === "business"
      ? step === "input" || step === "scraping" ? 1 : step === "confirm" ? 2 : step === "generating" ? 3 : 4
      : step === "input" || step === "scraping" ? 1 : step === "generating" ? 2 : 3

  return (
    <div className="-mx-6 -mt-8 lg:-mx-10 lg:-mt-10 min-h-[calc(100vh-3.5rem)] lg:min-h-screen">
      {/* Step indicator bar */}
      <div className="flex items-center justify-between border-b border-[var(--dash-border)] px-6 py-4 lg:px-10">
        <span className="font-brand text-2xl italic text-[var(--dash-text)]">Surge</span>
        <StepIndicator current={step} labels={currentStepMeta} />
        <span className="text-sm font-body text-[var(--dash-text-muted)]">
          Step {displayStepNum} of {currentStepMeta.length}
        </span>
      </div>

      {/* Content */}
      <div className="relative mx-auto max-w-2xl px-6 pt-16 pb-20">
        <div className="relative">
          {step === "input" && (
            <div className="space-y-8">
              {/* Tab bar */}
              <div className="flex justify-center">
                <div className="inline-flex border-b border-[var(--dash-border)]">
                  {([
                    { mode: "business" as const, label: "Find Business", icon: Search },
                    { mode: "custom" as const, label: "Custom Context", icon: Type },
                    { mode: "portfolio" as const, label: "Portfolio", icon: FileText },
                  ]).map(({ mode, label, icon: Icon }) => (
                    <button
                      key={mode}
                      onClick={() => setActiveMode(mode)}
                      className={`flex items-center gap-2 px-5 py-3 text-sm font-medium font-body border-b-2 transition-colors ${
                        activeMode === mode
                          ? "border-[var(--dash-vermillion)] text-[var(--dash-text)]"
                          : "border-transparent text-[var(--dash-text-muted)] hover:text-[var(--dash-text)]"
                      }`}
                    >
                      <Icon className="size-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode-specific content */}
              {activeMode === "business" && (
                <InputStep
                  businessName={businessName}
                  location={location}
                  error={error}
                  onBusinessNameChange={setBusinessName}
                  onLocationChange={setLocation}
                  onSubmit={handleScrape}
                />
              )}
              {activeMode === "custom" && (
                <CustomContextInput
                  projectName={projectName}
                  customContext={customContext}
                  customInstructions={customInstructions}
                  error={error}
                  onProjectNameChange={setProjectName}
                  onContextChange={setCustomContext}
                  onInstructionsChange={setCustomInstructions}
                  onSubmit={handleGenerateCustom}
                />
              )}
              {activeMode === "portfolio" && (
                <PortfolioInput
                  resumeText={resumeText}
                  portfolioPreferences={portfolioPreferences}
                  pdfFileName={pdfFileName}
                  uploadingPdf={uploadingPdf}
                  error={error}
                  onPreferencesChange={setPortfolioPreferences}
                  onFileUpload={handlePdfUpload}
                  onSubmit={handleGeneratePortfolio}
                />
              )}
            </div>
          )}

          {step === "scraping" && (
            <ScrapingStep stageIdx={scrapeStageIdx} onCancel={handleCancel} />
          )}

          {step === "confirm" && business && (
            <ConfirmStep
              business={business}
              error={error}
              onConfirm={handleGenerate}
              onBack={handleBack}
            />
          )}

          {step === "generating" && (
            <GeneratingStep progress={genProgress} percent={genPercent} onCancel={handleCancel} stages={currentStages} />
          )}

          {step === "done" && (
            <DoneStep projectId={projectId} />
          )}
        </div>
      </div>
    </div>
  )
}

// -- Step Indicator --

function StepIndicator({ current, labels }: { current: Step; labels: Array<{ key: string; label: string }> }) {
  const stepOrder: Step[] = ["input", "scraping", "confirm", "generating", "done"]
  const currentIdx = stepOrder.indexOf(current)

  function getStepState(key: string) {
    const keyIdx =
      key === "input" || key === "scraping"
        ? 0
        : key === "confirm"
          ? 2
          : key === "generating"
            ? 3
            : 4
    if (currentIdx > keyIdx) return "done"
    if (
      (key === "input" && (current === "input" || current === "scraping")) ||
      (key === "confirm" && current === "confirm") ||
      (key === "generating" && current === "generating") ||
      (key === "done" && current === "done")
    )
      return "active"
    return "pending"
  }

  return (
    <div className="hidden items-center gap-3 md:flex">
      {labels.map((s, i) => {
        const state = getStepState(s.key)
        return (
          <div key={s.key} className="flex items-center gap-3">
            <span
              className={`text-xs font-body font-medium tracking-wide uppercase ${
                state === "active"
                  ? "text-[var(--dash-text)]"
                  : state === "done"
                    ? "text-[var(--dash-teal)]"
                    : "text-[var(--dash-text-muted)]"
              }`}
            >
              {s.label}
            </span>
            {i < labels.length - 1 && (
              <div className={`h-px w-8 ${state === "done" ? "bg-[var(--dash-teal)]" : "bg-[var(--dash-border)]"}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// -- Step 1: Input (Business) --

function InputStep({
  businessName,
  location,
  error,
  onBusinessNameChange,
  onLocationChange,
  onSubmit,
}: {
  businessName: string
  location: string
  error: string | null
  onBusinessNameChange: (v: string) => void
  onLocationChange: (v: string) => void
  onSubmit: () => void
}) {
  const canSubmit = businessName.trim().length > 0 && location.trim().length > 0

  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-[var(--dash-surface)] ring-1 ring-[var(--dash-border)]">
          <Search className="size-6 text-[var(--dash-vermillion)]" />
        </div>
        <h1 className="font-display text-3xl tracking-tight sm:text-4xl text-[var(--dash-text)]">
          Find your business
        </h1>
        <p className="mt-3 font-body text-base text-[var(--dash-text-muted)]">
          Enter the business name and location. We&apos;ll find it on Google and pull in all the details.
        </p>
      </div>

      <div className="mx-auto max-w-md space-y-4">
        <div>
          <label htmlFor="business-name" className="mb-2 block text-sm font-medium font-body text-[var(--dash-text-secondary)]">
            Business Name
          </label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--dash-text-faint)]" />
            <Input
              id="business-name"
              placeholder="e.g. Joe's Pizza"
              value={businessName}
              onChange={(e) => onBusinessNameChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && onSubmit()}
              className="h-12 border-[var(--dash-border)] bg-[var(--dash-surface)] pl-10 text-[var(--dash-text)] placeholder:text-[var(--dash-text-faint)] focus-visible:border-[var(--dash-vermillion)]/40 focus-visible:ring-[var(--dash-vermillion)]/20"
            />
          </div>
        </div>

        <div>
          <label htmlFor="location" className="mb-2 block text-sm font-medium font-body text-[var(--dash-text-secondary)]">
            Location
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--dash-text-faint)]" />
            <Input
              id="location"
              placeholder="e.g. New York, NY"
              value={location}
              onChange={(e) => onLocationChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && onSubmit()}
              className="h-12 border-[var(--dash-border)] bg-[var(--dash-surface)] pl-10 text-[var(--dash-text)] placeholder:text-[var(--dash-text-faint)] focus-visible:border-[var(--dash-vermillion)]/40 focus-visible:ring-[var(--dash-vermillion)]/20"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--dash-error)]/20 bg-[var(--dash-error-bg)] p-3 text-sm text-[var(--dash-error)]">
            <XCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="h-12 w-full bg-[var(--dash-vermillion)] text-base font-semibold text-white hover:bg-[var(--dash-vermillion)]/90 disabled:opacity-40"
        >
          <Search className="size-4" />
          Find Business
        </Button>
      </div>
    </div>
  )
}

// -- Step 1: Input (Custom Context) --

function CustomContextInput({
  projectName, customContext, customInstructions, error,
  onProjectNameChange, onContextChange, onInstructionsChange, onSubmit,
}: {
  projectName: string; customContext: string; customInstructions: string; error: string | null
  onProjectNameChange: (v: string) => void; onContextChange: (v: string) => void
  onInstructionsChange: (v: string) => void; onSubmit: () => void
}) {
  const canSubmit = projectName.trim().length > 0 && customContext.trim().length > 0

  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-[var(--dash-surface)] ring-1 ring-[var(--dash-border)]">
          <Type className="size-6 text-[var(--dash-vermillion)]" />
        </div>
        <h1 className="font-display text-3xl tracking-tight sm:text-4xl text-[var(--dash-text)]">
          Custom Context
        </h1>
        <p className="mt-3 font-body text-base text-[var(--dash-text-muted)]">
          Describe your website and we&apos;ll build it. Paste any context — business info, product details, event description, anything.
        </p>
      </div>

      <div className="mx-auto max-w-md space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium font-body text-[var(--dash-text-secondary)]">
            Project Name
          </label>
          <Input
            placeholder="e.g. My Startup, Local Club, Event Site"
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            className="h-12 border-[var(--dash-border)] bg-[var(--dash-surface)] text-[var(--dash-text)] placeholder:text-[var(--dash-text-faint)] focus-visible:border-[var(--dash-vermillion)]/40 focus-visible:ring-[var(--dash-vermillion)]/20"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium font-body text-[var(--dash-text-secondary)]">
            Context
          </label>
          <Textarea
            placeholder="Describe your website. Include details like: what the site is for, key features, services offered, team info, contact details, anything you want on the site..."
            value={customContext}
            onChange={(e) => onContextChange(e.target.value)}
            rows={8}
            className="border-[var(--dash-border)] bg-[var(--dash-surface)] text-[var(--dash-text)] placeholder:text-[var(--dash-text-faint)] focus-visible:border-[var(--dash-vermillion)]/40 focus-visible:ring-[var(--dash-vermillion)]/20 resize-y"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium font-body text-[var(--dash-text-secondary)]">
            Design Preferences <span className="text-[var(--dash-text-faint)]">(optional)</span>
          </label>
          <Textarea
            placeholder="e.g. dark theme, minimal, corporate style, use blue accents..."
            value={customInstructions}
            onChange={(e) => onInstructionsChange(e.target.value)}
            rows={3}
            className="border-[var(--dash-border)] bg-[var(--dash-surface)] text-[var(--dash-text)] placeholder:text-[var(--dash-text-faint)] focus-visible:border-[var(--dash-vermillion)]/40 focus-visible:ring-[var(--dash-vermillion)]/20 resize-y"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--dash-error)]/20 bg-[var(--dash-error-bg)] p-3 text-sm text-[var(--dash-error)]">
            <XCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="h-12 w-full bg-[var(--dash-vermillion)] text-base font-semibold text-white hover:bg-[var(--dash-vermillion)]/90 disabled:opacity-40"
        >
          <Sparkles className="size-4" />
          Generate Website
        </Button>
      </div>
    </div>
  )
}

// -- Step 1: Input (Portfolio) --

function PortfolioInput({
  resumeText, portfolioPreferences, pdfFileName, uploadingPdf, error,
  onPreferencesChange, onFileUpload, onSubmit,
}: {
  resumeText: string; portfolioPreferences: string; pdfFileName: string | null
  uploadingPdf: boolean; error: string | null
  onPreferencesChange: (v: string) => void; onFileUpload: (file: File) => void; onSubmit: () => void
}) {
  const canSubmit = resumeText.trim().length > 0 && !uploadingPdf

  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-[var(--dash-surface)] ring-1 ring-[var(--dash-border)]">
          <FileText className="size-6 text-[var(--dash-vermillion)]" />
        </div>
        <h1 className="font-display text-3xl tracking-tight sm:text-4xl text-[var(--dash-text)]">
          Portfolio from Resume
        </h1>
        <p className="mt-3 font-body text-base text-[var(--dash-text-muted)]">
          Upload your resume PDF and we&apos;ll create a personalized portfolio website.
        </p>
      </div>

      <div className="mx-auto max-w-md space-y-4">
        {/* PDF Upload Drop Zone */}
        <div>
          <label className="mb-2 block text-sm font-medium font-body text-[var(--dash-text-secondary)]">
            Resume
          </label>
          <label
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
              pdfFileName
                ? "border-[var(--dash-teal)]/40 bg-[var(--dash-success-bg)]"
                : "border-[var(--dash-border)] bg-[var(--dash-surface)] hover:border-[var(--dash-vermillion)]/40"
            }`}
          >
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onFileUpload(file)
              }}
              disabled={uploadingPdf}
            />
            {uploadingPdf ? (
              <>
                <Loader2 className="size-8 animate-spin text-[var(--dash-vermillion)] mb-2" />
                <span className="text-sm font-body text-[var(--dash-text-muted)]">Parsing resume...</span>
              </>
            ) : pdfFileName ? (
              <>
                <CheckCircle2 className="size-8 text-[var(--dash-teal)] mb-2" />
                <span className="text-sm font-body font-medium text-[var(--dash-text)]">{pdfFileName}</span>
                <span className="text-xs font-body text-[var(--dash-text-muted)] mt-1">Click to replace</span>
              </>
            ) : (
              <>
                <Upload className="size-8 text-[var(--dash-text-faint)] mb-2" />
                <span className="text-sm font-body font-medium text-[var(--dash-text)]">Upload your resume</span>
                <span className="text-xs font-body text-[var(--dash-text-muted)] mt-1">PDF, up to 10MB</span>
              </>
            )}
          </label>
        </div>

        {/* Preferences */}
        <div>
          <label className="mb-2 block text-sm font-medium font-body text-[var(--dash-text-secondary)]">
            Preferences <span className="text-[var(--dash-text-faint)]">(optional)</span>
          </label>
          <Textarea
            placeholder="e.g. minimal dark theme, highlight ML projects, use blue accents..."
            value={portfolioPreferences}
            onChange={(e) => onPreferencesChange(e.target.value)}
            rows={3}
            className="border-[var(--dash-border)] bg-[var(--dash-surface)] text-[var(--dash-text)] placeholder:text-[var(--dash-text-faint)] focus-visible:border-[var(--dash-vermillion)]/40 focus-visible:ring-[var(--dash-vermillion)]/20 resize-y"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--dash-error)]/20 bg-[var(--dash-error-bg)] p-3 text-sm text-[var(--dash-error)]">
            <XCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="h-12 w-full bg-[var(--dash-vermillion)] text-base font-semibold text-white hover:bg-[var(--dash-vermillion)]/90 disabled:opacity-40"
        >
          <Sparkles className="size-4" />
          Generate Portfolio
        </Button>
      </div>
    </div>
  )
}

// -- Step 2: Scraping --

function ScrapingStep({ stageIdx, onCancel }: { stageIdx: number; onCancel: () => void }) {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-[var(--dash-surface)] ring-1 ring-[var(--dash-border)]">
          <Globe className="size-6 text-[var(--dash-vermillion)] animate-spin" style={{ animationDuration: "3s" }} />
        </div>
        <h1 className="font-display text-3xl tracking-tight text-[var(--dash-text)]">Searching...</h1>
        <p className="mt-3 font-body text-base text-[var(--dash-text-muted)]">
          Finding your business and gathering information.
        </p>
      </div>

      <div className="mx-auto max-w-sm space-y-3">
        {scrapeStages.map((stage, i) => (
          <div
            key={stage.key}
            className={`flex items-center gap-3 rounded-xl border p-4 transition-all duration-500 ${
              i < stageIdx
                ? "border-[var(--dash-teal)]/20 bg-[var(--dash-success-bg)]"
                : i === stageIdx
                  ? "border-[var(--dash-vermillion)]/20 bg-[var(--dash-error-bg)]"
                  : "border-[var(--dash-border)] bg-transparent opacity-40"
            }`}
          >
            {i < stageIdx ? (
              <CheckCircle2 className="size-5 shrink-0 text-[var(--dash-teal)]" />
            ) : i === stageIdx ? (
              <Loader2 className="size-5 shrink-0 animate-spin text-[var(--dash-vermillion)]" />
            ) : (
              <div className="size-5 shrink-0 rounded-full border border-[var(--dash-border)]" />
            )}
            <span
              className={`text-sm font-medium font-body ${
                i < stageIdx
                  ? "text-[var(--dash-teal)]"
                  : i === stageIdx
                    ? "text-[var(--dash-text)]"
                    : "text-[var(--dash-text-muted)]"
              }`}
            >
              {stage.label}
            </span>
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-sm flex justify-center">
        <Button
          variant="outline"
          onClick={onCancel}
          className="border-[var(--dash-border)] text-[var(--dash-text)] hover:bg-[var(--dash-active)]"
        >
          <X className="size-4" />
          Cancel
        </Button>
      </div>
    </div>
  )
}

// -- Step 3: Confirm Business --

function ConfirmStep({
  business,
  error,
  onConfirm,
  onBack,
}: {
  business: BusinessData
  error: string | null
  onConfirm: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-[var(--dash-success-bg)] ring-1 ring-[var(--dash-teal)]/20">
          <CheckCircle2 className="size-6 text-[var(--dash-teal)]" />
        </div>
        <h1 className="font-display text-3xl tracking-tight text-[var(--dash-text)]">We found it!</h1>
        <p className="mt-3 font-body text-base text-[var(--dash-text-muted)]">
          Is this the right business? Confirm to start generating your website.
        </p>
      </div>

      {/* Business card */}
      <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-surface)]">
        {/* Photo */}
        {business.photos.length > 0 && (
          <div className="relative h-40 w-full overflow-hidden bg-[var(--dash-elevated)]">
            <img
              src={business.photos[0].url}
              alt={business.name}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--dash-surface)] to-transparent" />
          </div>
        )}

        <div className="p-6 space-y-4">
          <div>
            <h2 className="font-display text-xl text-[var(--dash-text)]">{business.name}</h2>
            <div className="mt-2 h-px w-12 bg-[var(--dash-border-hover)]" />
            <p className="mt-2 text-sm font-body text-[var(--dash-text-muted)]">{business.category}</p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            {business.rating > 0 && (
              <div className="flex items-center gap-1.5 text-[var(--dash-warning)]">
                <Star className="size-4 fill-[var(--dash-warning)]" />
                <span className="font-medium">{business.rating}</span>
                <span className="text-[var(--dash-text-muted)]">({business.reviewCount} reviews)</span>
              </div>
            )}
          </div>

          <div className="border-t border-[var(--dash-border)] pt-4 space-y-2 text-sm text-[var(--dash-text-secondary)]">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--dash-text-faint)]" />
              <span>{business.address}, {business.city}, {business.state}</span>
            </div>
            {business.phone && (
              <div className="flex items-center gap-2">
                <Phone className="size-4 shrink-0 text-[var(--dash-text-faint)]" />
                <span>{business.phone}</span>
              </div>
            )}
            {business.hours.length > 0 && (
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 size-4 shrink-0 text-[var(--dash-text-faint)]" />
                <span>{business.hours[0].day}: {business.hours[0].open} - {business.hours[0].close}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-auto max-w-md flex items-start gap-2 rounded-lg border border-[var(--dash-error)]/20 bg-[var(--dash-error-bg)] p-3 text-sm text-[var(--dash-error)]">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mx-auto flex max-w-md gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          className="h-12 flex-1 border-[var(--dash-border)] text-[var(--dash-text)] hover:bg-[var(--dash-active)]"
        >
          <ArrowLeft className="size-4" />
          Search Again
        </Button>
        <Button
          onClick={onConfirm}
          className="h-12 flex-[2] bg-[var(--dash-vermillion)] text-base font-semibold text-white hover:bg-[var(--dash-vermillion)]/90"
        >
          <Sparkles className="size-4" />
          Generate Website
        </Button>
      </div>
    </div>
  )
}

// -- Step 4: Generating --

function GeneratingStep({
  progress,
  percent,
  onCancel,
  stages,
}: {
  progress: ProgressEvent | null
  percent: number
  onCancel: () => void
  stages: Array<{ key: string; label: string; doneAt: number }>
}) {
  // Track elapsed time
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const displayPercent = Math.round(percent)
  const currentStage = progress?.stage ?? "starting"
  const currentDetail = progress?.message || "Starting generation..."

  // Format elapsed time
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const elapsedStr = minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, "0")}s` : `${seconds}s`

  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-[var(--dash-surface)] ring-1 ring-[var(--dash-border)]">
          <Sparkles className="size-6 text-[var(--dash-vermillion)] animate-pulse" />
        </div>
        <h1 className="font-display text-3xl tracking-tight text-[var(--dash-text)]">Generating...</h1>
        <p className="mt-3 font-body text-base text-[var(--dash-text-muted)]">
          Our AI is building a complete website for you.
        </p>
      </div>

      <div className="mx-auto max-w-md space-y-6">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm font-body">
            <span className="text-[var(--dash-text-secondary)]">{currentDetail}</span>
            <span className="font-mono text-[var(--dash-text-muted)]">{elapsedStr}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--dash-surface)]">
            <div
              className="h-full rounded-full bg-[var(--dash-vermillion)] transition-all duration-700 ease-out"
              style={{ width: `${displayPercent}%` }}
            />
          </div>
          <div className="text-right">
            <span className="font-mono text-xs text-[var(--dash-vermillion)]">{displayPercent}%</span>
          </div>
        </div>

        {/* Generation stages — driven by polling backend status */}
        <div className="space-y-2">
          {stages.map((stage, i) => {
            const prevDoneAt = i > 0 ? stages[i - 1].doneAt : 0
            const stageMatches = currentStage === stage.key || currentStage.startsWith(stage.key)
            const isComplete = displayPercent >= stage.doneAt && !stageMatches
            const isActive = stageMatches || (displayPercent >= prevDoneAt && displayPercent < stage.doneAt)

            return (
              <div
                key={stage.key}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-all duration-300 ${
                  isComplete
                    ? "border-[var(--dash-teal)]/20 bg-[var(--dash-success-bg)]"
                    : isActive
                      ? "border-[var(--dash-vermillion)]/20 bg-[var(--dash-error-bg)]"
                      : "border-[var(--dash-border)] bg-transparent opacity-40"
                }`}
              >
                {isComplete ? (
                  <CheckCircle2 className="size-4 shrink-0 text-[var(--dash-teal)]" />
                ) : isActive ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-[var(--dash-vermillion)]" />
                ) : (
                  <div className="size-4 shrink-0 rounded-full border border-[var(--dash-border)]" />
                )}
                <span
                  className={`text-sm font-body ${
                    isComplete
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

        {/* Cancel button */}
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={onCancel}
            className="border-[var(--dash-border)] text-[var(--dash-text)] hover:bg-[var(--dash-active)]"
          >
            <X className="size-4" />
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

// -- Step 5: Done --

function DoneStep({ projectId }: { projectId: string | null }) {
  return (
    <div className="space-y-8 text-center">
      <div>
        <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-[var(--dash-success-bg)] ring-1 ring-[var(--dash-teal)]/20">
          <CheckCircle2 className="size-6 text-[var(--dash-teal)]" />
        </div>
        <h1 className="font-display text-3xl tracking-tight text-[var(--dash-text)]">Your website is ready!</h1>
        <p className="mt-3 font-body text-base text-[var(--dash-text-muted)]">
          Redirecting you to the preview...
        </p>
      </div>

      <div className="flex justify-center">
        <Loader2 className="size-6 animate-spin text-[var(--dash-vermillion)]" />
      </div>

      {projectId && (
        <Button
          asChild
          className="bg-[var(--dash-vermillion)] text-white font-semibold hover:bg-[var(--dash-vermillion)]/90"
        >
          <Link href={`/dashboard/${projectId}/preview`}>
            Go to Preview
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      )}
    </div>
  )
}
