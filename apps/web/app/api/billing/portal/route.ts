import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { createPortalSession } from "@/lib/stripe"
import { getUser } from "@radiant/db/queries"
import { logError } from "@radiant/db/queries"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await getUser(authUser.id)
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (!user.stripe_customer_id) {
      return NextResponse.json({ error: "No billing account found. Please subscribe first." }, { status: 400 })
    }

    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"

    const session = await createPortalSession(
      user.stripe_customer_id,
      `${origin}/dashboard`
    )

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Portal session failed"
    await logError({
      route: "/api/billing/portal",
      method: "POST",
      status_code: 500,
      error_message: message,
      stack_trace: err instanceof Error ? err.stack : undefined,
    }).catch(() => {})
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
