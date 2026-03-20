export const maxDuration = 30

import { NextRequest, NextResponse } from "next/server"
import { searchBusiness, getPlaceDetails } from "@radiant/scraper"
import { getFreshBusiness } from "@radiant/db"
import { checkRateLimit, scrapeLimiter } from "../../../lib/rate-limit"
import { logApiError } from "../../../lib/error-logger"
import { mapCategoryToIndustry } from "@radiant/scraper"

export async function POST(request: NextRequest) {
  // Rate limiting by IP
  const rateLimited = await checkRateLimit(scrapeLimiter, request, "Maximum 10 scrapes per hour.")
  if (rateLimited) return rateLimited

  // Parse and validate request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    )
  }

  const { businessName, location } = body as Record<string, unknown>

  if (!businessName || typeof businessName !== "string") {
    return NextResponse.json(
      { error: "Missing required field: businessName (string)" },
      { status: 400 },
    )
  }

  if (!location || typeof location !== "string") {
    return NextResponse.json(
      { error: "Missing required field: location (string)" },
      { status: 400 },
    )
  }

  if (businessName.length > 200 || location.length > 200) {
    return NextResponse.json(
      { error: "Fields must be 200 characters or less" },
      { status: 400 },
    )
  }

  try {
    // Step 1: Search Google Places for the business
    const placeId = await searchBusiness(businessName.trim(), location.trim())
    if (!placeId) {
      return NextResponse.json(
        { error: `Business not found on Google Places: "${businessName}" in "${location}"` },
        { status: 404 },
      )
    }

    // Step 2: Check cache for fresh data
    try {
      const freshBusiness = await getFreshBusiness(placeId)
      if (freshBusiness && freshBusiness.raw_data) {
        return NextResponse.json({
          success: true,
          cached: true,
          data: freshBusiness.raw_data,
        })
      }
    } catch {
      // Cache lookup failed — fall through to fresh fetch
    }

    // Step 3: Get full place details from Google (no Firecrawl — that happens after user confirms)
    const placeData = await getPlaceDetails(placeId)
    if (!placeData) {
      return NextResponse.json(
        { error: `Could not fetch details for business` },
        { status: 404 },
      )
    }

    const industry = mapCategoryToIndustry(placeData.categories)
    const { city, state } = parseAddress(placeData.address)

    const profile = {
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
      hours: (placeData.hours ?? []).map((entry: string) => {
        const colonIdx = entry.indexOf(":")
        if (colonIdx === -1) return { day: entry.trim(), open: "", close: "" }
        const day = entry.substring(0, colonIdx).trim()
        const timeRange = entry.substring(colonIdx + 1).trim()
        if (/closed/i.test(timeRange)) return { day, open: "Closed", close: "Closed" }
        const timeParts = timeRange.split(/\s*[–—-]\s*/)
        return { day, open: timeParts[0]?.trim() ?? "", close: timeParts[1]?.trim() ?? "" }
      }),
      photos: placeData.photoUrls.map((url: string) => ({ url, width: 800, height: 600 })),
      reviews: placeData.reviews.map((r: { author: string; rating: number; text: string; relativeTime: string }) => ({
        author: r.author,
        rating: r.rating,
        text: r.text,
        date: r.relativeTime,
      })),
      location: placeData.location,
    }

    return NextResponse.json({ success: true, cached: false, data: profile })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error during scraping"

    if (message.includes("not found")) {
      logApiError(error, { route: "/api/scrape", statusCode: 404, extra: { businessName, location } })
      return NextResponse.json(
        { error: message },
        { status: 404 },
      )
    }

    logApiError(error, { route: "/api/scrape", statusCode: 500, extra: { businessName, location } })
    return NextResponse.json(
      { error: `Scraping failed: ${message}` },
      { status: 500 },
    )
  }
}

function parseAddress(address: string): { city: string; state: string } {
  const parts = address.split(",").map((p) => p.trim())
  if (parts.length >= 3) {
    const city = parts[parts.length - 3] ?? ""
    const stateZip = parts[parts.length - 2] ?? ""
    const state = stateZip.replace(/\d{5}(-\d{4})?/, "").trim()
    return { city, state }
  }
  if (parts.length === 2) {
    return { city: parts[0], state: parts[1].replace(/\d{5}(-\d{4})?/, "").trim() }
  }
  return { city: "", state: "" }
}
