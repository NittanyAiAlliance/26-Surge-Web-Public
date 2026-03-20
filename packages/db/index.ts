import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL environment variable")
}

if (!supabaseAnonKey) {
  throw new Error("Missing SUPABASE_ANON_KEY environment variable")
}

/** Public Supabase client — uses anon key, safe for client-side use */
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/** Admin Supabase client — uses service role key, server-side only */
export function getServiceClient() {
  if (!supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable")
  }
  return createClient(supabaseUrl!, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  })
}

export { createClient } from "@supabase/supabase-js"
export * from "./types"
export * from "./queries"
