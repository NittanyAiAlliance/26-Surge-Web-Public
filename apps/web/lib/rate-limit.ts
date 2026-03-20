import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@radiant/db"

/**
 * Supabase-backed sliding window rate limiter.
 * Uses the `rate_limits` table for cross-instance coordination
 * so limits are enforced across all Vercel serverless instances.
 */
export class RateLimiter {
  private prefix: string
  private maxRequests: number
  private windowMs: number

  constructor(opts: { prefix: string; maxRequests: number; windowMs: number }) {
    this.prefix = opts.prefix
    this.maxRequests = opts.maxRequests
    this.windowMs = opts.windowMs
  }

  /**
   * Check if the given key is rate limited.
   * If not rate limited, records the request and returns { limited: false }.
   * If rate limited, returns { limited: true, retryAfterMs }.
   *
   * Falls back to allowing the request if Supabase is unreachable.
   */
  async check(key: string): Promise<{ limited: false } | { limited: true; retryAfterMs: number }> {
    const compositeKey = `${this.prefix}:${key}`
    const windowSeconds = Math.ceil(this.windowMs / 1000)

    try {
      const supabase = getServiceClient()

      // 1. Delete old entries outside the time window
      await supabase
        .from("rate_limits")
        .delete()
        .eq("key", compositeKey)
        .lt("timestamp", new Date(Date.now() - this.windowMs).toISOString())

      // 2. Count recent entries within the window
      const { count, error: countError } = await supabase
        .from("rate_limits")
        .select("*", { count: "exact", head: true })
        .eq("key", compositeKey)
        .gte("timestamp", new Date(Date.now() - this.windowMs).toISOString())

      if (countError) {
        console.warn("[rate-limit] Supabase count query failed, allowing request:", countError)
        return { limited: false }
      }

      const currentCount = count ?? 0

      // 3. If over limit, calculate retry-after from oldest entry in window
      if (currentCount >= this.maxRequests) {
        const { data: oldest } = await supabase
          .from("rate_limits")
          .select("timestamp")
          .eq("key", compositeKey)
          .gte("timestamp", new Date(Date.now() - this.windowMs).toISOString())
          .order("timestamp", { ascending: true })
          .limit(1)
          .single()

        const oldestTs = oldest?.timestamp
          ? new Date(oldest.timestamp).getTime()
          : Date.now() - this.windowMs

        const retryAfterMs = Math.max(oldestTs + this.windowMs - Date.now(), 1000)
        return { limited: true, retryAfterMs }
      }

      // 4. Not limited — insert a new entry
      const { error: insertError } = await supabase
        .from("rate_limits")
        .insert({ key: compositeKey, timestamp: new Date().toISOString() })

      if (insertError) {
        console.warn("[rate-limit] Supabase insert failed, allowing request:", insertError)
      }

      return { limited: false }
    } catch (error) {
      console.warn("[rate-limit] Supabase rate limit check failed, allowing request:", error)
      return { limited: false }
    }
  }
}

/**
 * Extract client IP from a Next.js request.
 */
export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  )
}

/**
 * Check rate limit and return a 429 response if exceeded.
 * Returns null if the request is within limits.
 */
export async function checkRateLimit(
  limiter: RateLimiter,
  request: NextRequest,
  label: string,
): Promise<NextResponse | null> {
  const ip = getClientIp(request)
  const result = await limiter.check(ip)

  if (result.limited) {
    const retryAfterSecs = Math.ceil(result.retryAfterMs / 1000)
    return NextResponse.json(
      { error: `Rate limit exceeded. ${label}` },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSecs) },
      },
    )
  }

  return null
}

// Pre-configured limiters for each API route
export const scrapeLimiter = new RateLimiter({ prefix: "scrape", maxRequests: 10, windowMs: 60 * 60 * 1000 })
export const generateLimiter = new RateLimiter({ prefix: "generate", maxRequests: 50, windowMs: 60 * 60 * 1000 })
export const deployLimiter = new RateLimiter({ prefix: "deploy", maxRequests: 10, windowMs: 60 * 60 * 1000 })
export const regenerateLimiter = new RateLimiter({ prefix: "regenerate", maxRequests: 5, windowMs: 60 * 60 * 1000 })
