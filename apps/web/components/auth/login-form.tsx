"use client"

import { useState } from "react"

import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawRedirect = searchParams.get("redirect") ?? "/dashboard"
  // Prevent open redirect — only allow relative paths starting with /
  const redirect = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : "/dashboard"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    router.push(redirect)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email" className="text-white/70">
          Email
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-white/70">
          Password
        </Label>
        <Input
          id="password"
          type="password"
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
        />
      </div>

      <Button
        type="submit"
        disabled={loading}
        className="w-full bg-[var(--dash-vermillion)] text-white font-semibold hover:bg-[var(--dash-vermillion)]/90"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : "Log In"}
      </Button>

    </form>
  )
}
