const requiredEnvVars = [
  "ANTHROPIC_API_KEY",
  "VERCEL_TOKEN",
  "GOOGLE_CLOUD_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "DOMAIN",
] as const

type EnvVarName = (typeof requiredEnvVars)[number]

export function validateEnv(): Record<EnvVarName, string> {
  const missing: string[] = []

  for (const key of requiredEnvVars) {
    if (!process.env[key]) {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((k) => `  - ${k}`).join("\n")}\n\nAdd them to your .env file at the project root.`
    )
  }

  return Object.fromEntries(
    requiredEnvVars.map((key) => [key, process.env[key]!])
  ) as Record<EnvVarName, string>
}

export function getEnv(key: EnvVarName): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}
