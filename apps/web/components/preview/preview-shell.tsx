"use client"

import { useState, useCallback, useEffect } from "react"
import { EditPanel } from "@/components/preview/edit-panel"
import Link from "next/link"
import {
  ArrowLeft,
  Monitor,
  Tablet,
  Smartphone,
  Rocket,
  RefreshCw,
  Pencil,
  Loader2,
  Globe,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { RegenerateDialog } from "@/components/dashboard/regenerate-dialog"
import { DeployDialog } from "@/components/deploy/deploy-dialog"

type Device = "desktop" | "tablet" | "mobile"

const devices: Array<{ key: Device; icon: typeof Monitor; label: string; width: string }> = [
  { key: "desktop", icon: Monitor, label: "Desktop", width: "100%" },
  { key: "tablet", icon: Tablet, label: "Tablet", width: "768px" },
  { key: "mobile", icon: Smartphone, label: "Mobile", width: "375px" },
]

interface PreviewShellProps {
  projectId: string
  businessName: string
  subdomain: string
  status: string
}

export function PreviewShell({
  projectId,
  businessName,
  subdomain,
  status,
}: PreviewShellProps) {
  const [device, setDevice] = useState<Device>("desktop")
  const [iframeKey, setIframeKey] = useState(0)
  const [showEditPanel, setShowEditPanel] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [hoveredSection, setHoveredSection] = useState<string | null>(null)
  const [selectedSectionFromPreview, setSelectedSectionFromPreview] = useState<string | null>(null)
  const [lastEditedSection, setLastEditedSection] = useState<string | null>(null)

  const isReady = status === "preview" || status === "deployed"
  const isGenerating = status === "generating"

  const activeDevice = devices.find((d) => d.key === device)!

  const handleRefreshPreview = useCallback(() => {
    setIframeKey((k) => k + 1)
  }, [])

  const handleEditComplete = useCallback((sectionName?: string) => {
    setIsRefreshing(true)
    setLastEditedSection(sectionName ?? null)
    setIframeKey((k) => k + 1)
  }, [])

  const handleIframeLoad = useCallback(() => {
    setIsRefreshing(false)
    // After reload, scroll to the edited section
    if (lastEditedSection) {
      // Small delay to let the iframe content render (Babel compilation + React render)
      setTimeout(() => {
        const iframe = document.querySelector('[data-testid="preview-iframe"]') as HTMLIFrameElement | null
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage({
            type: 'scroll-to-section',
            section: lastEditedSection,
          }, '*')
        }
        setLastEditedSection(null)
      }, 1500)
    }
  }, [lastEditedSection])

  // Listen for postMessage from iframe (section click/hover)
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data.type !== 'string') return

      switch (e.data.type) {
        case 'section-selected':
          // Open edit panel and select the clicked section
          setShowEditPanel(true)
          setSelectedSectionFromPreview(e.data.section)
          break
        case 'section-hover':
          setHoveredSection(e.data.section)
          break
        case 'section-unhover':
          setHoveredSection(null)
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  return (
    <div className="-mx-6 -mt-8 lg:-mx-10 lg:-mt-10 flex min-h-[calc(100vh-3.5rem)] lg:min-h-screen flex-col">
      {/* Toolbar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--dash-border)] bg-[var(--dash-bg)] px-4 gap-4">
        {/* Left: Navigation + Branding */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="flex items-center justify-center rounded-lg p-1.5 text-[var(--dash-text-muted)] transition-colors hover:bg-[var(--dash-active)] hover:text-[var(--dash-text)]"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="size-4" />
          </Link>

          <div className="h-5 w-px bg-[var(--dash-border)]" />

          <Link href="/dashboard" className="flex shrink-0 items-center">
            <span className="font-brand text-xl italic text-[var(--dash-text)]">Radiant</span>
          </Link>

          <div className="h-5 w-px bg-[var(--dash-border)]" />

          <span className="truncate text-sm font-medium font-body text-[var(--dash-text)]" data-testid="business-name">
            {businessName}
          </span>
        </div>

        {/* Center: Device Toggle */}
        <div
          className="flex items-center gap-0.5 rounded-lg bg-[var(--dash-surface)] p-1 ring-1 ring-[var(--dash-border)]"
          role="radiogroup"
          aria-label="Device preview"
        >
          {devices.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              role="radio"
              aria-checked={device === key}
              onClick={() => setDevice(key)}
              data-testid={`device-${key}`}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                device === key
                  ? "bg-[var(--dash-active)] text-[var(--dash-text)] shadow-sm"
                  : "text-[var(--dash-text-muted)] hover:text-[var(--dash-text)]"
              }`}
            >
              <Icon className="size-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEditPanel(true)}
            disabled={!isReady}
            className="border-[var(--dash-border)] text-[var(--dash-text)] hover:bg-[var(--dash-active)] text-xs"
            data-testid="edit-btn"
          >
            <Pencil className="size-3" />
            <span className="hidden sm:inline">Edit</span>
          </Button>

          <RegenerateDialog
            projectId={projectId}
            projectName={businessName}
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="border-[var(--dash-border)] text-[var(--dash-text)] hover:bg-[var(--dash-active)] text-xs"
                data-testid="regenerate-btn"
              >
                <RefreshCw className="size-3" />
                <span className="hidden sm:inline">Regenerate</span>
              </Button>
            }
          />

          <DeployDialog
            projectId={projectId}
            projectName={businessName}
            subdomain={subdomain}
            trigger={
              <Button
                size="sm"
                className="bg-[var(--dash-vermillion)] text-white font-semibold hover:bg-[var(--dash-vermillion)]/90 text-xs"
                data-testid="deploy-btn"
              >
                <Rocket className="size-3" />
                <span className="hidden sm:inline">Deploy</span>
              </Button>
            }
          />
        </div>
      </header>

      {/* URL Bar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--dash-border)] bg-[var(--dash-bg)] px-4">
        <Globe className="size-3.5 text-[var(--dash-text-faint)]" />
        <span className="text-xs text-[var(--dash-text-muted)] font-mono" data-testid="subdomain-url">
          {subdomain}.{process.env.NEXT_PUBLIC_DOMAIN}
        </span>
        {isReady && (
          <button
            onClick={handleRefreshPreview}
            className="ml-1 rounded p-0.5 text-[var(--dash-text-faint)] transition-colors hover:text-[var(--dash-text-secondary)]"
            aria-label="Refresh preview"
          >
            <RefreshCw className="size-3" />
          </button>
        )}
      </div>

      {/* Preview Area */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {/* Subtle grid background */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative flex h-full items-start justify-center overflow-auto p-4">
          <div
            className="relative h-full w-full transition-all duration-300 ease-out"
            style={{ maxWidth: activeDevice.width }}
            data-testid="preview-frame-container"
          >
            {isGenerating ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)]">
                <div className="text-center">
                  <Loader2 className="mx-auto size-8 animate-spin text-[var(--dash-vermillion)]" />
                  <p className="mt-4 text-sm font-body text-[var(--dash-text-muted)]">
                    Still generating your website...
                  </p>
                  <p className="mt-1 text-xs font-body text-[var(--dash-text-faint)]">
                    This usually takes about 6 minutes
                  </p>
                </div>
              </div>
            ) : isReady ? (
              <>
                <iframe
                  key={iframeKey}
                  src={`/preview/${projectId}/site`}
                  className="h-full min-h-[calc(100vh-8rem)] w-full rounded-xl border border-[var(--dash-border)] bg-white shadow-2xl shadow-black/40"
                  title={`Preview of ${businessName}`}
                  data-testid="preview-iframe"
                  onLoad={handleIframeLoad}
                />
                {isRefreshing && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-sm transition-opacity">
                    <div className="text-center">
                      <Loader2 className="mx-auto size-6 animate-spin text-white" />
                      <p className="mt-2 text-xs text-white/70">Refreshing preview...</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)]">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-[var(--dash-elevated)] ring-1 ring-[var(--dash-border)]">
                    <Globe className="size-5 text-[var(--dash-text-faint)]" />
                  </div>
                  <p className="text-sm font-body text-[var(--dash-text-muted)]">Preview not available</p>
                  <p className="mt-1 text-xs font-body text-[var(--dash-text-faint)]">
                    Project status: {status}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <EditPanel
        projectId={projectId}
        open={showEditPanel}
        onOpenChange={setShowEditPanel}
        onEditComplete={handleEditComplete}
        selectedSectionFromPreview={selectedSectionFromPreview}
        onSectionConsumed={() => setSelectedSectionFromPreview(null)}
      />
    </div>
  )
}
