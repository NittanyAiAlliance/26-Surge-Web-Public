import { getServiceClient } from "@radiant/db"

/**
 * Slugify a business name into a URL-safe subdomain.
 * e.g. "Carter's Table - Restaurant" → "carters-table-restaurant"
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[']/g, "")           // Remove apostrophes (Carter's → Carters)
    .replace(/[^a-z0-9]+/g, "-")   // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, "")       // Trim leading/trailing hyphens
    .slice(0, 60)
}

/**
 * Find an available subdomain by checking for duplicates.
 * First tries the plain slug, then appends -1, -2, -3, etc.
 *
 * e.g. "carters-table-restaurant" → taken → "carters-table-restaurant-1" → available
 */
export async function findAvailableSubdomain(name: string): Promise<string> {
  const base = slugify(name)

  // Check for existing subdomains that match our base slug or base-N pattern
  const { data: existing } = await getServiceClient()
    .from("projects")
    .select("subdomain")
    .or(`subdomain.eq.${base},subdomain.like.${base}-%`)

  if (!existing || existing.length === 0) {
    return base
  }

  const taken = new Set(existing.map((r) => r.subdomain))

  if (!taken.has(base)) {
    return base
  }

  // Find the next available number
  for (let i = 1; i <= 100; i++) {
    const candidate = `${base}-${i}`
    if (!taken.has(candidate)) {
      return candidate
    }
  }

  // Fallback (should never happen — 100 duplicates of same name)
  return `${base}-${Date.now().toString(36)}`
}
