"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  User,
  CreditCard,
  BarChart3,
  AlertTriangle,
  Save,
  Loader2,
  Check,
  Crown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase"

interface AccountSettingsProps {
  userEmail: string
  userName: string
  userPlan: string
  subscriptionStatus: string
  stripeCustomerId: string | null
  projectCount: number
  apiUsage: {
    generationsThisMonth: number
    tokensIn: number
    tokensOut: number
  }
}

const PLAN_LIMITS: Record<string, { name: string; sites: number; generations: number }> = {
  free: { name: "Free", sites: 1, generations: 1 },
  pro: { name: "Pro", sites: 10, generations: 100 },
  agency: { name: "Agency", sites: 999, generations: 999 },
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return count.toString()
}

export function AccountSettings({
  userEmail,
  userName,
  userPlan,
  subscriptionStatus,
  stripeCustomerId,
  projectCount,
  apiUsage,
}: AccountSettingsProps) {
  const router = useRouter()
  const [name, setName] = useState(userName)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)

  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState("")

  const plan = PLAN_LIMITS[userPlan] ?? PLAN_LIMITS.free

  async function handleUpgrade(targetPlan: "pro" | "agency") {
    setBillingLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: targetPlan }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create checkout")
      if (data.url) window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upgrade failed")
    } finally {
      setBillingLoading(false)
    }
  }

  async function handleManageBilling() {
    setBillingLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to open billing portal")
      if (data.url) window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open billing")
    } finally {
      setBillingLoading(false)
    }
  }

  async function handleSaveProfile() {
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from("users")
        .update({ name: name.trim() || null })
        .eq("id", user.id)

      if (updateError) throw updateError
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== "DELETE") return
    setDeleting(true)

    try {
      const res = await fetch("/api/account/delete", { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || "Failed to delete account")
      }

      const supabase = createClient()
      await supabase.auth.signOut()
      router.push("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account")
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Profile Section */}
      <section className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--dash-elevated)]">
            <User className="size-4 text-[var(--dash-text-secondary)]" />
          </div>
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--dash-text)]">Profile</h2>
          </div>
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-faint)] mb-6">Your personal information</p>

        <div className="space-y-4">
          <div>
            <Label className="text-sm text-[var(--dash-text-secondary)] mb-1.5 block">Email</Label>
            <Input
              value={userEmail}
              disabled
              className="bg-[var(--dash-elevated)] border-[var(--dash-border)] text-[var(--dash-text-muted)] cursor-not-allowed"
            />
            <p className="text-xs text-[var(--dash-text-muted)] mt-1">
              Email cannot be changed
            </p>
          </div>

          <div>
            <Label className="text-sm text-[var(--dash-text-secondary)] mb-1.5 block">
              Display Name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="bg-[var(--dash-elevated)] border-[var(--dash-border)] text-[var(--dash-text)] placeholder:text-[var(--dash-text-muted)] focus-visible:ring-[var(--dash-sapphire)]/40"
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--dash-error)]">{error}</p>
          )}

          <Button
            onClick={handleSaveProfile}
            disabled={saving || name === userName}
            className="bg-[var(--dash-vermillion)] text-white font-medium hover:bg-[var(--dash-vermillion)]/90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : saved ? (
              <Check className="size-4" />
            ) : (
              <Save className="size-4" />
            )}
            {saving ? "Saving..." : saved ? "Saved" : "Save Changes"}
          </Button>
        </div>
      </section>

      {/* Plan Section */}
      <section className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--dash-elevated)]">
            <CreditCard className="size-4 text-[var(--dash-text-secondary)]" />
          </div>
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--dash-text)]">Plan</h2>
          </div>
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-faint)] mb-6">Your current subscription</p>

        <div className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-elevated)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex size-10 items-center justify-center rounded-lg ${
                userPlan === "free"
                  ? "bg-[var(--dash-surface)]"
                  : "bg-[var(--dash-vermillion)]"
              }`}>
                <Crown className={`size-5 ${
                  userPlan === "free" ? "text-[var(--dash-text-muted)]" : "text-white"
                }`} />
              </div>
              <div>
                <p className="font-semibold text-[var(--dash-text)]">{plan.name} Plan</p>
                <p className="text-xs text-[var(--dash-text-muted)]">
                  {plan.sites === 999
                    ? "Unlimited sites"
                    : `Up to ${plan.sites} sites`}{" "}
                  &middot;{" "}
                  {plan.generations === 999
                    ? "Unlimited generations"
                    : `${plan.generations} generations/mo`}
                </p>
              </div>
            </div>

            {userPlan === "free" ? (
              <Button
                variant="outline"
                size="sm"
                className="border-[var(--dash-vermillion)]/30 text-[var(--dash-vermillion)] hover:bg-[var(--dash-vermillion)]/10 hover:text-[var(--dash-vermillion)]"
                disabled={billingLoading}
                onClick={() => handleUpgrade("pro")}
              >
                {billingLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                Upgrade to Pro
              </Button>
            ) : stripeCustomerId ? (
              <Button
                variant="outline"
                size="sm"
                className="border-[var(--dash-border)] text-[var(--dash-text-secondary)] hover:bg-[var(--dash-elevated)] hover:text-[var(--dash-text)]"
                disabled={billingLoading}
                onClick={handleManageBilling}
              >
                {billingLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                Manage Billing
              </Button>
            ) : null}
          </div>

          {/* Usage bars */}
          <div className="mt-4 space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-[var(--dash-text-muted)]">Sites created</span>
                <span className="text-[var(--dash-text-secondary)]">
                  {projectCount} / {plan.sites === 999 ? "\u221E" : plan.sites}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--dash-surface)]">
                <div
                  className="h-full rounded-full bg-[var(--dash-vermillion)] transition-all"
                  style={{
                    width: `${Math.min((projectCount / plan.sites) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-[var(--dash-text-muted)]">Generations this month</span>
                <span className="text-[var(--dash-text-secondary)]">
                  {apiUsage.generationsThisMonth} /{" "}
                  {plan.generations === 999 ? "\u221E" : plan.generations}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--dash-surface)]">
                <div
                  className="h-full rounded-full bg-[var(--dash-sapphire)] transition-all"
                  style={{
                    width: `${Math.min(
                      (apiUsage.generationsThisMonth / plan.generations) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* API Usage Section */}
      <section className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--dash-elevated)]">
            <BarChart3 className="size-4 text-[var(--dash-text-secondary)]" />
          </div>
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--dash-text)]">API Usage</h2>
          </div>
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-faint)] mb-6">Token consumption this month</p>

        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-elevated)] p-4 text-center">
            <p className="text-2xl font-bold text-[var(--dash-text)]">
              {apiUsage.generationsThisMonth}
            </p>
            <p className="text-xs text-[var(--dash-text-muted)] mt-1">Generations</p>
          </div>
          <div className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-elevated)] p-4 text-center">
            <p className="text-2xl font-bold text-[var(--dash-text)]">
              {formatTokenCount(apiUsage.tokensIn)}
            </p>
            <p className="text-xs text-[var(--dash-text-muted)] mt-1">Input Tokens</p>
          </div>
          <div className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-elevated)] p-4 text-center">
            <p className="text-2xl font-bold text-[var(--dash-text)]">
              {formatTokenCount(apiUsage.tokensOut)}
            </p>
            <p className="text-xs text-[var(--dash-text-muted)] mt-1">Output Tokens</p>
          </div>
        </div>

        <p className="text-xs text-[var(--dash-text-muted)] mt-3">
          Estimated cost: $
          {(
            (apiUsage.tokensIn * 0.003 + apiUsage.tokensOut * 0.015) /
            1000
          ).toFixed(2)}{" "}
          this month
        </p>
      </section>

      {/* Danger Zone */}
      <section className="rounded-[10px] border border-[var(--dash-error)]/20 bg-[var(--dash-error)]/[0.03] p-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--dash-error)]/10">
            <AlertTriangle className="size-4 text-[var(--dash-error)]" />
          </div>
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--dash-error)]">
              Danger Zone
            </h2>
          </div>
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-faint)] mb-6">Irreversible actions</p>

        <div className="rounded-[10px] border border-[var(--dash-error)]/10 bg-[var(--dash-error)]/[0.02] p-4">
          <h3 className="text-sm font-medium text-[var(--dash-text)] mb-1">
            Delete Account
          </h3>
          <p className="text-xs text-[var(--dash-text-muted)] mb-4">
            Permanently delete your account, all your generated sites, and
            deployed projects. This action cannot be undone.
          </p>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs text-[var(--dash-text-muted)] mb-1.5 block">
                Type <span className="font-mono text-[var(--dash-error)]">DELETE</span> to
                confirm
              </Label>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                className="bg-[var(--dash-elevated)] border-[var(--dash-error)]/20 text-[var(--dash-text)] placeholder:text-[var(--dash-text-muted)] focus-visible:ring-[var(--dash-error)]/40"
              />
            </div>
            <Button
              variant="outline"
              onClick={handleDeleteAccount}
              disabled={deleteConfirm !== "DELETE" || deleting}
              className="border-[var(--dash-error)]/30 text-[var(--dash-error)] hover:bg-[var(--dash-error)]/10 hover:text-[var(--dash-error)] disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <AlertTriangle className="size-4" />
              )}
              {deleting ? "Deleting..." : "Delete Account"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
