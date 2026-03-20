import Link from "next/link"
import { SignupForm } from "@/components/auth/signup-form"

export const metadata = {
  title: "Sign Up",
  description: "Create a free Surge account and generate your first AI-powered website.",
}

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <span className="font-brand text-3xl italic text-[var(--dash-text)]">Surge</span>
          </Link>
          <h1 className="mt-6 font-display text-2xl font-semibold text-[var(--dash-text)]">Create your account</h1>
          <p className="mt-2 text-sm text-[var(--dash-text-secondary)]">Start generating beautiful websites for free</p>
        </div>

        <div className="rounded-[10px] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-6">
          <SignupForm />
        </div>

        <p className="mt-6 text-center text-sm text-[var(--dash-text-secondary)]">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--dash-sapphire)] hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
