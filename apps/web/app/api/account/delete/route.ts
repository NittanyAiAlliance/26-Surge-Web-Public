import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { logApiError } from "../../../../lib/error-logger"

export async function POST() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Use service role client to delete user data
    // RLS cascade will handle projects, project_files, generations
    const { getServiceClient } = await import("@radiant/db")
    const admin = getServiceClient()

    // Delete from users table (cascades to projects -> project_files, generations)
    const { error: deleteError } = await admin
      .from("users")
      .delete()
      .eq("id", user.id)

    if (deleteError) {
      logApiError(new Error(deleteError.message), { route: "/api/account/delete", statusCode: 500, userId: user.id, extra: { phase: "user_data_deletion" } })
      return NextResponse.json(
        { error: `Failed to delete account: ${deleteError.message}` },
        { status: 500 }
      )
    }

    // Delete the auth user via admin API
    const { error: authError } = await admin.auth.admin.deleteUser(user.id)

    if (authError) {
      logApiError(new Error(authError.message), { route: "/api/account/delete", statusCode: 500, userId: user.id, errorCode: "AUTH_USER_DELETE_FAILED" })
      // Data is already deleted, don't block on auth deletion
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    logApiError(err, { route: "/api/account/delete", statusCode: 500 })
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
