import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { sendWelcomeEmail } from "../../../lib/email"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const rawNext = searchParams.get("next") ?? "/dashboard"
  // Prevent open redirect — only allow relative paths starting with /
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard"

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error, data } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Send welcome email (fire-and-forget — don't block redirect)
      const user = data.session?.user
      if (user?.email) {
        sendWelcomeEmail(user.email, user.user_metadata?.name).catch(() => {
          // Email delivery failure should not block auth flow
        })
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
