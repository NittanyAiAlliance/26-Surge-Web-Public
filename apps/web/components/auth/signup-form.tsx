"use client"

import { useState } from "react"

import { createClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

export function SignupForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
          <svg className="size-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-white">Check your email</h3>
        <p className="text-sm text-white/50">
          We&apos;ve sent a verification link to <span className="text-white/80">{email}</span>.
          Click it to activate your account.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name" className="text-white/70">
          Name
        </Label>
        <Input
          id="name"
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
        />
      </div>

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
          placeholder="At least 6 characters"
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
        {loading ? <Loader2 className="size-4 animate-spin" /> : "Create Account"}
      </Button>

    </form>
  )
}
