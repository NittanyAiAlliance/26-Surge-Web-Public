import { findBusiness, getPlaceDetails, searchBusiness } from "./google-places"
import { scrapeWebsite, scrapeWebsiteEnriched } from "./firecrawl"
import { mapCategoryToIndustry } from "./industry-mapper"
import type {
  BusinessProfile,
  BusinessHours,
  BusinessPhoto,
  BusinessReview,
  GooglePlaceData,
  ScrapedWebsiteData,
  ExistingContent,
} from "./types"

export type { BusinessProfile, GooglePlaceData, ScrapedWebsiteData }
export { findBusiness, searchBusiness, getPlaceDetails } from "./google-places"
export { scrapeWebsite, scrapeWebsiteEnriched } from "./firecrawl"
export { mapCategoryToIndustry, getSupportedIndustries } from "./industry-mapper"
export type { Industry } from "./industry-mapper"

/**
 * Main scraper orchestrator.
 * Takes a business name and location, scrapes all available data,
 * assembles a BusinessProfile, caches it in the DB, and returns it.
 */
export async function scrapeBusinessProfile(
  name: string,
  location: string,
): Promise<BusinessProfile> {
  // 1. Search Google Places and get full details
  const placeData = await findBusiness(name, location)
  if (!placeData) {
    throw new Error(
      `Business not found on Google Places: "${name}" in "${location}"`,
    )
  }

  // 2. Scrape existing website (if one exists) — run in parallel-safe way
  let scrapedContent: ScrapedWebsiteData | null = null
  if (placeData.website) {
    try {
      scrapedContent = await scrapeWebsiteEnriched(placeData.website)
    } catch {
      // Website scraping is best-effort; don't fail the whole pipeline
      scrapedContent = null
    }
  }

  // 3. Map category to industry
  const industry = mapCategoryToIndustry(placeData.categories)

  // 4. Parse address into city/state
  const { city, state } = parseAddress(placeData.address)

  // 5. Convert Google hours strings to structured BusinessHours
  const hours = parseHours(placeData.hours)

  // 6. Convert photo URLs to BusinessPhoto objects
  const photos: BusinessPhoto[] = placeData.photoUrls.map((url) => ({
    url,
    width: 800,
    height: 600,
  }))

  // 7. Convert Google reviews to BusinessReview objects
  const reviews: BusinessReview[] = placeData.reviews.map((r) => ({
    author: r.author,
    rating: r.rating,
    text: r.text,
    date: r.relativeTime,
  }))

  // 8. Build ExistingContent from scraped website data
  const existingContent = scrapedContent
    ? buildExistingContent(scrapedContent)
    : undefined

  // 9. Assemble the BusinessProfile
  const profile: BusinessProfile = {
    name: placeData.name,
    address: placeData.address,
    city,
    state,
    phone: placeData.phone ?? "",
    website: placeData.website,
    rating: placeData.rating ?? 0,
    reviewCount: placeData.totalReviews ?? 0,
    category: placeData.categories[0] ?? "business",
    industry,
    hours,
    photos,
    reviews,
    location: placeData.location,
    existingContent,
  }

  // 10. Cache in businesses table (best-effort)
  try {
    await cacheBusiness(placeData, scrapedContent, profile)
  } catch {
    // Caching failure should not break the pipeline
  }

  return profile
}

// ── Helpers ──────────────────────────────────────────────

/**
 * Parse a formatted address string into city and state.
 * Handles formats like "123 Main St, Springfield, IL 62704, USA"
 */
function parseAddress(address: string): { city: string; state: string } {
  const parts = address.split(",").map((p) => p.trim())

  if (parts.length >= 3) {
    const city = parts[parts.length - 3] ?? ""
    // State is usually in the second-to-last part, possibly with zip
    const stateZip = parts[parts.length - 2] ?? ""
    const state = stateZip.replace(/\d{5}(-\d{4})?/, "").trim()
    return { city, state }
  }

  if (parts.length === 2) {
    return { city: parts[0], state: parts[1].replace(/\d{5}(-\d{4})?/, "").trim() }
  }

  return { city: "", state: "" }
}

/**
 * Parse Google Places weekday_text strings into structured BusinessHours.
 * Input format: ["Monday: 9:00 AM – 5:00 PM", "Tuesday: Closed", ...]
 */
function parseHours(weekdayText?: string[]): BusinessHours[] {
  if (!weekdayText || weekdayText.length === 0) return []

  return weekdayText.map((entry) => {
    const colonIdx = entry.indexOf(":")
    if (colonIdx === -1) {
      return { day: entry.trim(), open: "", close: "" }
    }

    const day = entry.substring(0, colonIdx).trim()
    const timeRange = entry.substring(colonIdx + 1).trim()

    if (/closed/i.test(timeRange)) {
      return { day, open: "Closed", close: "Closed" }
    }

    // Split on dash/en-dash/em-dash
    const timeParts = timeRange.split(/\s*[–—-]\s*/)
    const open = timeParts[0]?.trim() ?? ""
    const close = timeParts[1]?.trim() ?? ""

    return { day, open, close }
  })
}

/**
 * Build ExistingContent from scraped website data.
 */
function buildExistingContent(scraped: ScrapedWebsiteData): ExistingContent {
  return {
    headlines: scraped.headings.slice(0, 10),
    descriptions: scraped.paragraphs.slice(0, 10),
    services: scraped.services,
    about: scraped.aboutText ?? "",
    socialLinks: scraped.socialLinks,
    bookingLinks: scraped.bookingLinks,
    orderingLinks: scraped.orderingLinks,
    importantLinks: scraped.importantLinks,
    logo: scraped.logo,
    colorPalette: scraped.colorPalette,
    teamMembers: scraped.teamMembers,
    contactInfo: scraped.contactInfo,
  }
}

/**
 * Cache business data in the Supabase businesses table.
 * Uses dynamic import to avoid hard dependency on @radiant/db at module level.
 */
async function cacheBusiness(
  placeData: GooglePlaceData,
  scrapedContent: ScrapedWebsiteData | null,
  profile: BusinessProfile,
): Promise<void> {
  const { upsertBusiness } = await import("@radiant/db")

  await upsertBusiness(placeData.placeId, {
    name: placeData.name,
    address: placeData.address,
    phone: placeData.phone ?? null,
    website: placeData.website ?? null,
    rating: placeData.rating ?? null,
    review_count: placeData.totalReviews ?? null,
    category: profile.category,
    hours: profile.hours as unknown as Record<string, unknown>,
    photos: profile.photos as unknown as Record<string, unknown>,
    reviews: profile.reviews as unknown as Record<string, unknown>,
    scraped_content: (scrapedContent ?? null) as unknown as Record<string, unknown>,
    raw_data: profile as unknown as Record<string, unknown>,
  })
}
