import type { GooglePlaceData, GooglePlaceReview } from "./types"

/**
 * Google Places API (New) client.
 * Uses the v1 REST API directly instead of the legacy @googlemaps SDK,
 * because Google is deprecating the legacy Places API endpoints.
 *
 * Docs: https://developers.google.com/maps/documentation/places/web-service/op-overview
 */

const PLACES_BASE = "https://places.googleapis.com/v1"

function getApiKey(): string {
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY
  if (!apiKey) {
    throw new Error("Missing GOOGLE_CLOUD_API_KEY environment variable")
  }
  return apiKey
}

interface PlaceDetailResult {
  id: string
  displayName?: { text: string; languageCode?: string }
  formattedAddress?: string
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  rating?: number
  userRatingCount?: number
  regularOpeningHours?: {
    weekdayDescriptions?: string[]
  }
  types?: string[]
  photos?: Array<{
    name: string
    widthPx: number
    heightPx: number
  }>
  reviews?: Array<{
    authorAttribution?: { displayName: string }
    rating: number
    text?: { text: string }
    relativePublishTimeDescription?: string
  }>
  location?: { latitude: number; longitude: number }
}

interface PlacesTextSearchResult {
  places?: Array<{
    id: string
    displayName?: { text: string; languageCode?: string }
    formattedAddress?: string
    nationalPhoneNumber?: string
    internationalPhoneNumber?: string
    websiteUri?: string
    rating?: number
    userRatingCount?: number
    regularOpeningHours?: {
      weekdayDescriptions?: string[]
    }
    types?: string[]
    photos?: Array<{
      name: string
      widthPx: number
      heightPx: number
    }>
    reviews?: Array<{
      authorAttribution?: { displayName: string }
      rating: number
      text?: { text: string }
      relativePublishTimeDescription?: string
    }>
    location?: { latitude: number; longitude: number }
  }>
}

/**
 * Search for a business using the Places API (New) Text Search.
 * Returns the place resource name (e.g. "places/ChIJ..."), or null if not found.
 */
export async function searchBusiness(
  name: string,
  location: string,
): Promise<string | null> {
  const key = getApiKey()

  const response = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
    },
    body: JSON.stringify({ textQuery: `${name} ${location}` }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    const msg = (error as { error?: { message?: string } }).error?.message ?? `HTTP ${response.status}`
    if (response.status === 403) {
      throw new Error(
        `Google Places API is not enabled. Enable "Places API (New)" at https://console.cloud.google.com/apis/library/places.googleapis.com — Error: ${msg}`,
      )
    }
    if (response.status === 429) {
      throw new Error(`Google Places API quota exceeded: ${msg}`)
    }
    throw new Error(`Google Places search failed: ${msg}`)
  }

  const data = (await response.json()) as PlacesTextSearchResult
  if (!data.places?.length) return null
  return data.places[0].id
}

/**
 * Get full details for a place by its place ID.
 * Uses the Places API (New) Get Place endpoint.
 */
export async function getPlaceDetails(
  placeId: string,
): Promise<GooglePlaceData | null> {
  const key = getApiKey()

  const fieldMask = [
    "id",
    "displayName",
    "formattedAddress",
    "nationalPhoneNumber",
    "internationalPhoneNumber",
    "websiteUri",
    "rating",
    "userRatingCount",
    "regularOpeningHours",
    "types",
    "photos",
    "reviews",
    "location",
  ].join(",")

  const response = await fetch(`${PLACES_BASE}/places/${placeId}`, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": fieldMask,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    const msg = (error as { error?: { message?: string } }).error?.message ?? `HTTP ${response.status}`
    if (response.status === 404) return null
    if (response.status === 403) {
      throw new Error(
        `Google Places API is not enabled. Enable "Places API (New)" at https://console.cloud.google.com/apis/library/places.googleapis.com — Error: ${msg}`,
      )
    }
    throw new Error(`Google Places details failed: ${msg}`)
  }

  const place = (await response.json()) as PlaceDetailResult

  const reviews: GooglePlaceReview[] = (place.reviews ?? []).map(
    (r) => ({
      author: r.authorAttribution?.displayName ?? "Anonymous",
      rating: r.rating ?? 0,
      text: r.text?.text ?? "",
      relativeTime: r.relativePublishTimeDescription ?? "",
    }),
  )

  // Build photo URLs using the Places API (New) photo endpoint
  const photoUrls = getPlacePhotoUrls(
    (place.photos ?? []).map((p) => p.name),
    800,
    key,
  )

  return {
    placeId: place.id,
    name: place.displayName?.text ?? "",
    address: place.formattedAddress ?? "",
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber,
    website: place.websiteUri,
    rating: place.rating,
    totalReviews: place.userRatingCount,
    hours: place.regularOpeningHours?.weekdayDescriptions,
    categories: place.types ?? [],
    photoUrls,
    reviews,
    location: {
      lat: place.location?.latitude ?? 0,
      lng: place.location?.longitude ?? 0,
    },
  }
}

/**
 * Build photo URLs from the new Places API photo resource names.
 * Format: https://places.googleapis.com/v1/{photo_name}/media?maxWidthPx=800&key=API_KEY
 */
export function getPlacePhotoUrls(
  photoNames: string[],
  maxWidth: number = 800,
  apiKey?: string,
): string[] {
  const key = apiKey ?? getApiKey()
  return photoNames.slice(0, 10).map(
    (name) =>
      `${PLACES_BASE}/${name}/media?maxWidthPx=${maxWidth}&key=${key}`,
  )
}

/**
 * High-level function: search for a business and return full details.
 * Combines searchBusiness + getPlaceDetails in one call.
 */
export async function findBusiness(
  name: string,
  location: string,
): Promise<GooglePlaceData | null> {
  const placeId = await searchBusiness(name, location)
  if (!placeId) return null
  return getPlaceDetails(placeId)
}
