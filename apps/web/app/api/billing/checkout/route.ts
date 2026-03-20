import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { createCheckoutSession } from "@/lib/stripe"
import { getUser } from "@radiant/db/queries"
import { logError } from "@radiant/db/queries"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const plan = body.plan as string
    if (plan !== "pro" && plan !== "agency") {
      return NextResponse.json({ error: "Invalid plan. Must be 'pro' or 'agency'" }, { status: 400 })
    }

    const user = await getUser(authUser.id)
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (user.plan === plan && user.subscription_status === "active") {
      return NextResponse.json({ error: "Already subscribed to this plan" }, { status: 400 })
    }

    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"

    const session = await createCheckoutSession({
      userId: user.id,
      userEmail: user.email,
      plan,
      stripeCustomerId: user.stripe_customer_id,
      successUrl: `${origin}/dashboard?billing=success`,
      cancelUrl: `${origin}/dashboard?billing=canceled`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed"
    await logError({
      route: "/api/billing/checkout",
      method: "POST",
      status_code: 500,
      error_message: message,
      stack_trace: err instanceof Error ? err.stack : undefined,
    }).catch(() => {})
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
