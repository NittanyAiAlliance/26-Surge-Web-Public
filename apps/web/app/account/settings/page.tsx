import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase-server"
import { AccountSettings } from "@/components/dashboard/account-settings"
import type { User } from "@radiant/db"

export const metadata = {
  title: "Settings",
  description: "Manage your Surge account settings.",
}


export default async function SettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?redirect=/account/settings")
  }

  // Fetch user profile and projects in parallel
  const [{ data: rawProfile }, { data: rawProjects }] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).single(),
    supabase.from("projects").select("id").eq("user_id", user.id),
  ])

  const profile = rawProfile as User | null
  const userProjects = (rawProjects ?? []) as Array<{ id: string }>
  const projectCount = userProjects.length
  const projectIds = userProjects.map((p) => p.id)

  // Fetch generation stats
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  type GenRow = { tokens_input: number | null; tokens_output: number | null }
  let monthlyGenerations: GenRow[] = []

  if (projectIds.length > 0) {
    const { data: generations } = await supabase
      .from("generations")
      .select("tokens_input, tokens_output")
      .in("project_id", projectIds)
      .eq("status", "completed")
      .gte("created_at", monthStart)

    monthlyGenerations = (generations as GenRow[] | null) ?? []
  }

  const totalTokensIn = monthlyGenerations.reduce(
    (sum, g) => sum + (g.tokens_input ?? 0),
    0
  )
  const totalTokensOut = monthlyGenerations.reduce(
    (sum, g) => sum + (g.tokens_output ?? 0),
    0
  )

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-[var(--dash-text-muted)] mt-1">
          Manage your account and preferences
        </p>
      </div>

      <AccountSettings
        userEmail={user.email ?? ""}
        userName={profile?.name ?? ""}
        userPlan={(profile?.plan as string) ?? "free"}
        subscriptionStatus={(profile?.subscription_status as string) ?? "none"}
        stripeCustomerId={(profile?.stripe_customer_id as string) ?? null}
        projectCount={projectCount ?? 0}
        apiUsage={{
          generationsThisMonth: monthlyGenerations.length,
          tokensIn: totalTokensIn,
          tokensOut: totalTokensOut,
        }}
      />
    </div>
  )
}
