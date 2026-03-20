import { Suspense } from "react"
import Link from "next/link"
import { LoginForm } from "@/components/auth/login-form"

export const metadata = {
  title: "Log In",
  description: "Log in to your Surge account to manage your generated websites.",
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <span className="font-brand text-3xl italic text-[var(--dash-text)]">Surge</span>
          </Link>
          <h1 className="mt-6 font-display text-2xl font-semibold text-[var(--dash-text)]">Welcome back</h1>
          <p className="mt-2 text-sm text-[var(--dash-text-secondary)]">Log in to your account to continue</p>
        </div>

        <div className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-6">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-sm text-[var(--dash-text-secondary)]">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-[var(--dash-sapphire)] hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
