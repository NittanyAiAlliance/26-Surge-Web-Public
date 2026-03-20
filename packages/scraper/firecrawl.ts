import * as cheerio from "cheerio"
import type {
  ScrapedWebsiteData,
  SocialLink,
  ActionLink,
  ContactInfo,
  ServiceItem,
  TeamMember,
  LogoInfo,
  ColorPalette,
} from "./types"

const DEFAULT_FIRECRAWL_URL = "https://api.firecrawl.dev"
const SCRAPE_TIMEOUT_MS = 30_000

function getFirecrawlConfig(): { apiUrl: string; apiKey: string } {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    throw new Error("Missing FIRECRAWL_API_KEY environment variable")
  }
  const apiUrl = process.env.FIRECRAWL_API_URL ?? DEFAULT_FIRECRAWL_URL
  return { apiUrl, apiKey }
}

interface FirecrawlScrapeResponse {
  success: boolean
  data?: {
    markdown?: string
    html?: string
    metadata?: {
      title?: string
      description?: string
      ogTitle?: string
      ogDescription?: string
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  error?: string
}

/**
 * Scrape a business's existing website using the Firecrawl API.
 * Supports both self-hosted Firecrawl (set FIRECRAWL_API_URL) and Firecrawl Cloud.
 *
 * Returns null if the website doesn't exist, is unreachable, or returns no content.
 */
export async function scrapeWebsite(
  url: string,
): Promise<ScrapedWebsiteData | null> {
  const { apiUrl, apiKey } = getFirecrawlConfig()

  if (!url || !url.startsWith("http")) {
    return null
  }

  let response: Response
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS)

    response = await fetch(`${apiUrl}/v1/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ["html"],
        onlyMainContent: true,
        timeout: 20000,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes("abort") || message.includes("timeout")) {
      return null
    }
    if (
      message.includes("ECONNREFUSED") ||
      message.includes("ENOTFOUND") ||
      message.includes("fetch failed")
    ) {
      return null
    }
    throw new Error(`Firecrawl request failed: ${message}`)
  }

  if (!response.ok) {
    if (response.status === 402 || response.status === 429) {
      throw new Error(
        `Firecrawl API rate limit or billing issue (HTTP ${response.status})`,
      )
    }
    // Site unreachable, 404, etc. — return null
    return null
  }

  let body: FirecrawlScrapeResponse
  try {
    body = (await response.json()) as FirecrawlScrapeResponse
  } catch {
    return null
  }

  if (!body.success || !body.data) {
    return null
  }

  const html = body.data.html ?? ""
  if (!html.trim()) {
    return null
  }

  const rawContent = extractContent(html)

  const scraped = summarizeContent(rawContent, url, body.data.metadata)

  return scraped
}

interface RawExtractedContent {
  headings: string[]
  paragraphs: string[]
  imageUrls: string[]
  links: { text: string; href: string }[]
  metaTitle?: string
  metaDescription?: string
}

/**
 * Extract structured content from an HTML string.
 * Pulls out headings, paragraphs, images, and links.
 */
export function extractContent(html: string): RawExtractedContent {
  const $ = cheerio.load(html)

  // Remove script, style, nav, footer, header noise for cleaner paragraphs
  $("script, style, noscript, iframe").remove()

  const headings: string[] = []
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const text = $(el).text().trim()
    if (text && text.length > 1 && text.length < 200) {
      headings.push(text)
    }
  })

  const paragraphs: string[] = []
  $("p, li, blockquote, .description, [class*='about'], [class*='text']").each(
    (_, el) => {
      const tagName = (el as unknown as { tagName?: string }).tagName?.toLowerCase()
      // Only process direct text from divs with text-related classes, not all descendants
      if (
        tagName !== "p" &&
        tagName !== "li" &&
        tagName !== "blockquote"
      ) {
        const text = $(el)
          .contents()
          .filter(function () {
            return this.type === "text"
          })
          .text()
          .trim()
        if (text && text.length > 20 && text.length < 2000) {
          paragraphs.push(text)
        }
      } else {
        const text = $(el).text().trim()
        if (text && text.length > 20 && text.length < 2000) {
          paragraphs.push(text)
        }
      }
    },
  )

  const imageUrls: string[] = []
  const seenUrls = new Set<string>()
  $("img").each((_, el) => {
    const src =
      $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy")
    if (src && !seenUrls.has(src) && !isTrackingPixel(src)) {
      seenUrls.add(src)
      imageUrls.push(src)
    }
  })

  // Also check og:image and other meta images
  $('meta[property="og:image"], meta[name="twitter:image"]').each((_, el) => {
    const content = $(el).attr("content")
    if (content && !seenUrls.has(content)) {
      seenUrls.add(content)
      imageUrls.push(content)
    }
  })

  const links: { text: string; href: string }[] = []
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")
    const text = $(el).text().trim()
    if (href && text && text.length < 200) {
      links.push({ text, href })
    }
  })

  const metaTitle = $("title").text().trim() || undefined
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    undefined

  return {
    headings: dedup(headings),
    paragraphs: dedup(paragraphs),
    imageUrls,
    links,
    metaTitle,
    metaDescription,
  }
}

/**
 * Clean and structure raw extracted content into a ScrapedWebsiteData object.
 * Detects menu items, about text, and deduplicates content.
 */
export function summarizeContent(
  raw: RawExtractedContent,
  url: string,
  metadata?: {
    title?: string
    description?: string
    ogTitle?: string
    ogDescription?: string
    [key: string]: unknown
  },
): ScrapedWebsiteData {
  const title =
    metadata?.ogTitle ?? metadata?.title ?? raw.metaTitle ?? undefined
  const description =
    metadata?.ogDescription ??
    metadata?.description ??
    raw.metaDescription ??
    undefined

  // Detect menu items: short text entries that look like food/service items
  const menuItems = detectMenuItems(raw.paragraphs, raw.links)

  // Detect about text: paragraphs containing "about" context or longer descriptions
  const aboutText = detectAboutText(raw.paragraphs, raw.headings)

  // Resolve relative image URLs to absolute
  const imageUrls = raw.imageUrls
    .map((src) => resolveUrl(src, url))
    .filter((u): u is string => u !== null)

  return {
    url,
    title,
    description,
    headings: raw.headings.slice(0, 50),
    paragraphs: raw.paragraphs.slice(0, 100),
    menuItems: menuItems.length > 0 ? menuItems : undefined,
    aboutText: aboutText ?? undefined,
    imageUrls: imageUrls.slice(0, 30),
  }
}

// --- Helpers ---

function isTrackingPixel(src: string): boolean {
  const lower = src.toLowerCase()
  return (
    lower.includes("pixel") ||
    lower.includes("tracker") ||
    lower.includes("analytics") ||
    lower.includes("facebook.com/tr") ||
    lower.includes("google-analytics") ||
    lower.endsWith(".gif") ||
    src.includes("1x1")
  )
}

function dedup(items: string[]): string[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const normalized = item.toLowerCase().trim()
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function resolveUrl(src: string, baseUrl: string): string | null {
  try {
    if (src.startsWith("data:")) return null
    return new URL(src, baseUrl).href
  } catch {
    return null
  }
}

function detectMenuItems(
  paragraphs: string[],
  links: { text: string; href: string }[],
): string[] {
  const menuItems: string[] = []
  const menuPattern =
    /\$\s*\d+|\d+\.\d{2}|price|menu|dish|entrée|appetizer|dessert/i

  for (const p of paragraphs) {
    if (menuPattern.test(p) && p.length < 200) {
      menuItems.push(p)
    }
  }

  // Links that look like menu items (short text with price patterns)
  for (const link of links) {
    if (
      menuPattern.test(link.text) &&
      link.text.length < 100 &&
      link.text.length > 3
    ) {
      menuItems.push(link.text)
    }
  }

  return dedup(menuItems).slice(0, 50)
}

function detectAboutText(
  paragraphs: string[],
  headings: string[],
): string | null {
  // Find the section after an "about" heading
  const aboutHeadingIdx = headings.findIndex((h) =>
    /about|our story|who we are|our mission/i.test(h),
  )

  // Score paragraphs by how likely they are "about" text
  const candidates = paragraphs.filter(
    (p) => p.length > 50 && p.length < 1000,
  )

  if (candidates.length > 0) {
    const strongAbout = /founded|our story|our mission|who we are|established|since \d{4}/i
    const mediumAbout = /family|passion|generations|heritage|tradition|history/i
    const weakAbout = /about|years|experience|serving|community/i

    const scored = candidates.map((p) => {
      let score = 0
      if (strongAbout.test(p)) score += 3
      if (mediumAbout.test(p)) score += 2
      if (weakAbout.test(p)) score += 1
      if (aboutHeadingIdx >= 0) score += 1 // bonus when about heading exists
      // Prefer longer paragraphs
      score += p.length / 500
      return { text: p, score }
    })

    scored.sort((a, b) => b.score - a.score)
    if (scored[0].score > 0) {
      return scored[0].text
    }
  }

  // Fallback: find the longest substantive paragraph
  const substantive = paragraphs
    .filter((p) => p.length > 80 && p.length < 1000)
    .sort((a, b) => b.length - a.length)

  return substantive[0] ?? null
}

/**
 * Extract contact information from raw HTML.
 * Pulls email, phone, Google Maps embed URL, and structured address.
 */
export function extractContactInfo(html: string): ContactInfo {
  const $ = cheerio.load(html)

  const contact: ContactInfo = {}

  // 1. Extract email from first mailto link
  const mailtoEl = $('a[href^="mailto:"]').first()
  if (mailtoEl.length) {
    const href = mailtoEl.attr("href") ?? ""
    // Strip "mailto:" prefix and any query params (e.g. ?subject=...)
    const raw = href.replace(/^mailto:/i, "")
    const emailPart = raw.split("?")[0]
    if (emailPart) {
      contact.email = emailPart
    }
  }

  // 2. Extract phone from first tel link
  const telEl = $('a[href^="tel:"]').first()
  if (telEl.length) {
    const href = telEl.attr("href") ?? ""
    const phonePart = href.replace(/^tel:/i, "")
    if (phonePart) {
      contact.phone = phonePart
    }
  }

  // 3. Extract Google Maps embed URL from iframe
  const mapsIframe = $('iframe[src*="google.com/maps"]').first()
  if (mapsIframe.length) {
    const src = mapsIframe.attr("src")
    if (src) {
      contact.mapEmbedUrl = src
    }
  }

  // 4. Extract address from schema.org structured data
  const streetAddress = $('[itemprop="streetAddress"]').first().text().trim()
  const locality = $('[itemprop="addressLocality"]').first().text().trim()
  const region = $('[itemprop="addressRegion"]').first().text().trim()

  const addressParts = [streetAddress, locality, region].filter(Boolean)
  if (addressParts.length > 0) {
    contact.address = addressParts.join(", ")
  }

  return contact
}

/**
 * Extract services/offerings from raw HTML.
 * Looks for card-like containers with service-related classes, then falls back
 * to h3 elements with sibling paragraphs.
 *
 * Returns up to 30 ServiceItem entries.
 */
export function extractServices(html: string): ServiceItem[] {
  const $ = cheerio.load(html)
  $("script, style, noscript, iframe").remove()

  const services: ServiceItem[] = []
  const pricePattern = /\$\d[\d,]*(?:\.\d{2})?/

  // Primary: look for containers with service-related class names
  const serviceSelector = [
    "[class*='service']",
    "[class*='offering']",
    "[class*='pricing']",
    "[class*='package']",
  ].join(", ")

  const serviceContainers = $(serviceSelector)

  if (serviceContainers.length > 0) {
    serviceContainers.each((_, container) => {
      const $container = $(container)

      // Skip parent containers that contain child containers also matching the selector
      if ($container.find(serviceSelector).length > 0) return

      // Find the heading (h3 or h4) as the service name
      const heading = $container.find("h3, h4").first().text().trim()
      if (!heading) return

      const name = heading.slice(0, 100)

      // Find the first <p> as description
      const descText = $container.find("p").first().text().trim()
      const description = descText ? descText.slice(0, 500) : undefined

      // Look for a price pattern anywhere in container text
      const containerText = $container.text()
      const priceMatch = containerText.match(pricePattern)
      const price = priceMatch ? priceMatch[0] : undefined

      services.push({ name, description, price })
    })
  }

  // Fallback: if no service containers found, look for h3 with sibling <p>
  if (services.length === 0) {
    $("h3").each((_, el) => {
      const $el = $(el)
      const name = $el.text().trim()
      if (!name || name.length > 100) return

      // Look for a sibling <p> element
      const siblingP = $el.next("p")
      const description = siblingP.length
        ? siblingP.text().trim().slice(0, 500)
        : undefined

      // Check for price in heading text + sibling text
      const combinedText = name + " " + (description ?? "")
      const priceMatch = combinedText.match(pricePattern)
      const price = priceMatch ? priceMatch[0] : undefined

      services.push({
        name: name.slice(0, 100),
        description: description || undefined,
        price,
      })
    })
  }

  return services.slice(0, 30)
}

/**
 * Extract team/staff members from raw HTML.
 * Looks for card-like containers with team-related class names, extracting
 * name, role, and photo for each member.
 *
 * Returns up to 20 TeamMember entries.
 */
export function extractTeamMembers(
  html: string,
  baseUrl: string,
): TeamMember[] {
  const $ = cheerio.load(html)
  $("script, style, noscript, iframe").remove()

  const members: TeamMember[] = []

  const teamSelector = [
    "[class*='team']",
    "[class*='staff']",
    "[class*='member']",
    "[class*='doctor']",
    "[class*='provider']",
    "[class*='attorney']",
    "[class*='trainer']",
  ].join(", ")

  const teamContainers = $(teamSelector)

  teamContainers.each((_, container) => {
    const $container = $(container)

    // Skip parent containers that contain child containers also matching the selector
    if ($container.find(teamSelector).length > 0) return

    // Find name from heading (h2, h3, or h4)
    const heading = $container.find("h2, h3, h4").first().text().trim()
    if (!heading) return

    const name = heading.slice(0, 100)

    // Find role: first short <p> (2-80 chars)
    let role: string | undefined
    $container.find("p").each((_, pEl) => {
      if (role) return // already found one
      const text = $(pEl).text().trim()
      if (text.length >= 2 && text.length <= 80) {
        role = text
      }
    })

    // Find photo: first <img> in the container
    let photoUrl: string | undefined
    const img = $container.find("img").first()
    if (img.length) {
      const src =
        img.attr("src") || img.attr("data-src") || img.attr("data-lazy")
      if (src) {
        const resolved = resolveUrl(src, baseUrl)
        if (resolved) {
          photoUrl = resolved
        }
      }
    }

    members.push({ name, role, photoUrl })
  })

  return members.slice(0, 20)
}

// --- Social, Booking, Ordering & CTA Link Extraction ---

const SOCIAL_PLATFORMS: { pattern: RegExp; platform: string }[] = [
  { pattern: /instagram\.com/i, platform: "instagram" },
  { pattern: /facebook\.com/i, platform: "facebook" },
  { pattern: /twitter\.com/i, platform: "twitter" },
  { pattern: /x\.com/i, platform: "twitter" },
  { pattern: /linkedin\.com/i, platform: "linkedin" },
  { pattern: /tiktok\.com/i, platform: "tiktok" },
  { pattern: /youtube\.com/i, platform: "youtube" },
  { pattern: /pinterest\.com/i, platform: "pinterest" },
  { pattern: /nextdoor\.com/i, platform: "nextdoor" },
  { pattern: /yelp\.com/i, platform: "yelp" },
]

const BOOKING_PATTERNS: RegExp[] = [
  /opentable\.com/i,
  /resy\.com/i,
  /calendly\.com/i,
  /acuityscheduling\.com/i,
  /squareup\.com\/appointments/i,
  /booksy\.com/i,
  /vagaro\.com/i,
  /schedulicity\.com/i,
  /mindbodyonline\.com/i,
]

const ORDERING_PATTERNS: RegExp[] = [
  /doordash\.com/i,
  /ubereats\.com/i,
  /grubhub\.com/i,
  /chownow\.com/i,
  /toast\.com/i,
  /order\.online/i,
  /slice\.com/i,
]

const INTERNAL_NAV_PATHS = new Set([
  "/",
  "/about",
  "/menu",
  "/services",
  "/contact",
  "/team",
  "/gallery",
  "/blog",
  "/privacy",
  "/terms",
])

const CTA_CLASS_PATTERN = /\b(btn|cta|button|book|order|action)\b/i

/**
 * Extract social media links from HTML.
 * Scans all <a> tags for known social platform URLs and deduplicates by href.
 */
export function extractSocialLinks(html: string): SocialLink[] {
  const $ = cheerio.load(html)
  const seen = new Set<string>()
  const results: SocialLink[] = []

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")
    if (!href) return

    if (seen.has(href)) return

    for (const { pattern, platform } of SOCIAL_PLATFORMS) {
      if (pattern.test(href)) {
        seen.add(href)
        results.push({ platform, url: href })
        break
      }
    }
  })

  return results
}

/**
 * Extract booking/reservation links from HTML.
 * Detects known booking platform URLs and uses link text as label.
 */
export function extractBookingLinks(html: string): ActionLink[] {
  const $ = cheerio.load(html)
  const seen = new Set<string>()
  const results: ActionLink[] = []

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")
    if (!href) return

    if (seen.has(href)) return

    for (const pattern of BOOKING_PATTERNS) {
      if (pattern.test(href)) {
        seen.add(href)
        const text = $(el).text().trim()
        results.push({ label: text || "Book Now", url: href })
        break
      }
    }
  })

  return results
}

/**
 * Extract online ordering links from HTML.
 * Detects known ordering platform URLs and uses link text as label.
 */
export function extractOrderingLinks(html: string): ActionLink[] {
  const $ = cheerio.load(html)
  const seen = new Set<string>()
  const results: ActionLink[] = []

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")
    if (!href) return

    if (seen.has(href)) return

    for (const pattern of ORDERING_PATTERNS) {
      if (pattern.test(href)) {
        seen.add(href)
        const text = $(el).text().trim()
        results.push({ label: text || "Order Online", url: href })
        break
      }
    }
  })

  return results
}

/**
 * Extract important CTA-looking links from HTML.
 * Finds links inside <button> elements or with CTA-related class names.
 * Excludes social, booking, ordering, internal nav, and fragment-only links.
 */
export function extractImportantLinks(html: string): ActionLink[] {
  const $ = cheerio.load(html)
  const seen = new Set<string>()
  const results: ActionLink[] = []

  // Build a set of hrefs already captured by other extractors
  const excludedHrefs = new Set<string>()
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")
    if (!href) return
    for (const { pattern } of SOCIAL_PLATFORMS) {
      if (pattern.test(href)) {
        excludedHrefs.add(href)
        break
      }
    }
    for (const pattern of BOOKING_PATTERNS) {
      if (pattern.test(href)) {
        excludedHrefs.add(href)
        break
      }
    }
    for (const pattern of ORDERING_PATTERNS) {
      if (pattern.test(href)) {
        excludedHrefs.add(href)
        break
      }
    }
  })

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")
    if (!href) return

    // Skip fragment-only links
    if (href.startsWith("#")) return

    // Skip already-matched social/booking/ordering links
    if (excludedHrefs.has(href)) return

    // Skip internal nav paths
    try {
      const pathname = href.startsWith("http")
        ? new URL(href).pathname
        : href.split("?")[0].split("#")[0]
      if (INTERNAL_NAV_PATHS.has(pathname)) return
    } catch {
      // If URL parsing fails, check the raw href
      if (INTERNAL_NAV_PATHS.has(href)) return
    }

    // Skip duplicates
    if (seen.has(href)) return

    // Check if this link looks like a CTA
    const $el = $(el)
    const isCta =
      $el.closest("button").length > 0 ||
      CTA_CLASS_PATTERN.test($el.attr("class") ?? "") ||
      CTA_CLASS_PATTERN.test($el.closest("[class]").attr("class") ?? "")

    if (!isCta) return

    seen.add(href)
    const text = $el.text().trim()
    if (text) {
      results.push({ label: text, url: href })
    }
  })

  return results
}

// --- Smart Subpage Discovery ---

export interface DiscoveredPage {
  url: string
  type: "about" | "menu" | "services" | "team" | "contact" | "gallery" | "booking" | "other"
  label: string
}

/** Paths that should be skipped entirely — noise pages with no business value. */
const SKIP_PATH_PATTERNS = [
  /\/blog/i, /\/news/i, /\/press/i, /\/media/i,
  /\/privacy/i, /\/terms/i, /\/legal/i, /\/cookie/i,
  /\/career/i, /\/jobs/i, /\/hiring/i,
  /\/login/i, /\/sign-in/i, /\/register/i, /\/account/i,
  /\/cart/i, /\/checkout/i, /\/shop/i,
  /\/faq/i, /\/help/i, /\/support/i,
  /\/sitemap/i, /\/feed/i, /\/rss/i,
]

/** File extensions to skip. */
const SKIP_EXTENSIONS = /\.(pdf|jpg|jpeg|png|gif|svg|zip|doc|docx)$/i

/** Map URL path segments to page types, ordered by priority. */
const PAGE_TYPE_RULES: {
  type: DiscoveredPage["type"]
  patterns: RegExp[]
  priority: number
}[] = [
  { type: "about",    patterns: [/\/about/i, /\/our-story/i, /\/who-we-are/i, /\/history/i], priority: 1 },
  { type: "menu",     patterns: [/\/menu/i, /\/food/i, /\/drinks/i, /\/dinner/i, /\/lunch/i], priority: 2 },
  { type: "services", patterns: [/\/services/i, /\/what-we-do/i, /\/offerings/i, /\/treatments/i, /\/procedures/i], priority: 3 },
  { type: "team",     patterns: [/\/team/i, /\/staff/i, /\/our-team/i, /\/providers/i, /\/doctors/i, /\/attorneys/i], priority: 4 },
  { type: "contact",  patterns: [/\/contact/i, /\/location/i, /\/find-us/i, /\/directions/i, /\/hours/i], priority: 5 },
  { type: "gallery",  patterns: [/\/gallery/i, /\/photos/i, /\/portfolio/i, /\/work/i], priority: 6 },
  { type: "booking",  patterns: [/\/reserve/i, /\/book/i, /\/appointment/i, /\/schedule/i], priority: 7 },
]

/**
 * Discover important subpages from a website's navigation links.
 *
 * Parses HTML to find internal links in nav/header/footer elements,
 * classifies them by page type, deduplicates by type, and returns
 * up to 5 high-priority pages.
 */
export function discoverSubpages(html: string, baseUrl: string): DiscoveredPage[] {
  const $ = cheerio.load(html)

  // 1. Collect links from nav, header, footer first
  let anchors = $("nav a[href], header a[href], footer a[href]")

  // Fall back to all <a> tags if none found in structured elements
  if (anchors.length === 0) {
    anchors = $("a[href]")
  }

  let baseHost: string
  try {
    baseHost = new URL(baseUrl).hostname
  } catch {
    return []
  }

  const seen = new Set<string>()
  const results: (DiscoveredPage & { priority: number })[] = []

  anchors.each((_, el) => {
    const href = $(el).attr("href")
    if (!href) return

    // Skip fragment-only links
    if (href.startsWith("#")) return

    // Resolve to absolute URL
    let absoluteUrl: URL
    try {
      absoluteUrl = new URL(href, baseUrl)
    } catch {
      return
    }

    // Skip external links (different host)
    if (absoluteUrl.hostname !== baseHost) return

    // Skip homepage
    if (absoluteUrl.pathname === "/" || absoluteUrl.pathname === "") return

    const pathname = absoluteUrl.pathname

    // Skip file extensions
    if (SKIP_EXTENSIONS.test(pathname)) return

    // Skip noise paths
    if (SKIP_PATH_PATTERNS.some((p) => p.test(pathname))) return

    // Normalize URL (strip hash, keep path + search)
    const normalized = `${absoluteUrl.origin}${absoluteUrl.pathname}${absoluteUrl.search}`

    // Deduplicate by URL
    if (seen.has(normalized)) return
    seen.add(normalized)

    // Match page type
    const matched = PAGE_TYPE_RULES.find((rule) =>
      rule.patterns.some((p) => p.test(pathname)),
    )

    // Only include pages with a matched type (skip "other")
    if (!matched) return

    const label = $(el).text().trim() || matched.type

    results.push({
      url: normalized,
      type: matched.type,
      label,
      priority: matched.priority,
    })
  })

  // Sort by priority (lower = higher priority)
  results.sort((a, b) => a.priority - b.priority)

  // Deduplicate by type (keep first = highest priority / first encountered)
  const seenTypes = new Set<string>()
  const deduped: DiscoveredPage[] = []

  for (const page of results) {
    if (seenTypes.has(page.type)) continue
    seenTypes.add(page.type)
    deduped.push({ url: page.url, type: page.type, label: page.label })
  }

  // Return max 5 pages
  return deduped.slice(0, 5)
}

/**
 * Extract a logo from HTML using a priority-based search.
 *
 * Priority order:
 * 1. <img> in <header>/<nav> with class containing "logo"
 * 2. <img> in <header>/<nav> with alt containing "logo" (case-insensitive)
 * 3. <img> in <header>/<nav> with src containing "logo"
 * 4. Any <img> with class containing "logo"
 * 5. Any <img> with alt containing "logo" (case-insensitive)
 * 6. Any <img> with src containing "logo"
 * 7. <link rel="apple-touch-icon">
 * 8. <link rel="icon" type="image/svg+xml">
 *
 * Returns the first match as { url, alt } or undefined if nothing found.
 */
export function extractLogo(html: string, baseUrl: string): LogoInfo | undefined {
  const $ = cheerio.load(html)

  // Helper: build a LogoInfo from a Cheerio-wrapped <img> element
  function logoFromImg($el: ReturnType<typeof $>): LogoInfo | undefined {
    const src = $el.attr("src") || $el.attr("data-src")
    if (!src) return undefined
    const resolved = resolveUrl(src, baseUrl)
    if (!resolved) return undefined
    const alt = $el.attr("alt")?.trim() || undefined
    return { url: resolved, alt }
  }

  // Priority 1: <img> in header/nav with class containing "logo"
  const headerNavImgs = $("header img, nav img")
  for (let i = 0; i < headerNavImgs.length; i++) {
    const $el = $(headerNavImgs[i])
    const cls = $el.attr("class") ?? ""
    if (/logo/i.test(cls)) {
      const info = logoFromImg($el)
      if (info) return info
    }
  }

  // Priority 2: <img> in header/nav with alt containing "logo"
  for (let i = 0; i < headerNavImgs.length; i++) {
    const $el = $(headerNavImgs[i])
    const alt = $el.attr("alt") ?? ""
    if (/logo/i.test(alt)) {
      const info = logoFromImg($el)
      if (info) return info
    }
  }

  // Priority 3: <img> in header/nav with src containing "logo"
  for (let i = 0; i < headerNavImgs.length; i++) {
    const $el = $(headerNavImgs[i])
    const src = $el.attr("src") || $el.attr("data-src") || ""
    if (/logo/i.test(src)) {
      const info = logoFromImg($el)
      if (info) return info
    }
  }

  // Priority 4: Any <img> with class containing "logo"
  const allImgs = $("img")
  for (let i = 0; i < allImgs.length; i++) {
    const $el = $(allImgs[i])
    const cls = $el.attr("class") ?? ""
    if (/logo/i.test(cls)) {
      const info = logoFromImg($el)
      if (info) return info
    }
  }

  // Priority 5: Any <img> with alt containing "logo"
  for (let i = 0; i < allImgs.length; i++) {
    const $el = $(allImgs[i])
    const alt = $el.attr("alt") ?? ""
    if (/logo/i.test(alt)) {
      const info = logoFromImg($el)
      if (info) return info
    }
  }

  // Priority 6: Any <img> with src containing "logo"
  for (let i = 0; i < allImgs.length; i++) {
    const $el = $(allImgs[i])
    const src = $el.attr("src") || $el.attr("data-src") || ""
    if (/logo/i.test(src)) {
      const info = logoFromImg($el)
      if (info) return info
    }
  }

  // Priority 7: <link rel="apple-touch-icon">
  const appleTouchIcon = $('link[rel="apple-touch-icon"]').first()
  if (appleTouchIcon.length) {
    const href = appleTouchIcon.attr("href")
    if (href) {
      const resolved = resolveUrl(href, baseUrl)
      if (resolved) return { url: resolved }
    }
  }

  // Priority 8: <link rel="icon" type="image/svg+xml">
  const svgIcon = $('link[rel="icon"][type="image/svg+xml"]').first()
  if (svgIcon.length) {
    const href = svgIcon.attr("href")
    if (href) {
      const resolved = resolveUrl(href, baseUrl)
      if (resolved) return { url: resolved }
    }
  }

  return undefined
}

// --- Color palette extraction ---

const NEUTRAL_COLORS = new Set([
  "#ffffff",
  "#000000",
  "#f5f5f5",
  "#e5e5e5",
  "#d4d4d4",
  "#fafafa",
  "#f8f8f8",
  "#333333",
  "#666666",
  "#999999",
])

const NEUTRAL_KEYWORDS = new Set([
  "transparent",
  "inherit",
  "initial",
  "currentcolor",
])

function normalizeHex(hex: string): string | null {
  const cleaned = hex.toLowerCase().trim()
  const digits = cleaned.startsWith("#") ? cleaned.slice(1) : cleaned
  if (digits.length === 3) {
    return `#${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`
  }
  if (digits.length === 6) {
    return `#${digits}`
  }
  return null
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  const toHex = (n: number) => clamp(n).toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function isNeutral(color: string): boolean {
  const lower = color.toLowerCase()
  return NEUTRAL_COLORS.has(lower) || NEUTRAL_KEYWORDS.has(lower)
}

/**
 * Extract a color palette from `<style>` blocks in an HTML document.
 * Parses hex (#xxx, #xxxxxx) and rgb() colors, filters out common
 * neutrals/defaults, and returns the top 5 colors sorted by frequency.
 */
export function extractColorPalette(html: string): ColorPalette {
  const $ = cheerio.load(html)

  const styleTexts: string[] = []
  $("style").each((_, el) => {
    const text = $(el).text()
    if (text) styleTexts.push(text)
  })

  $("[style]").each((_, el) => {
    const style = $(el).attr("style")
    if (style) styleTexts.push(style)
  })

  const allCss = styleTexts.join("\n")
  const colorCounts = new Map<string, number>()

  const hexRegex = /#([0-9a-fA-F]{3,8})\b/g
  let match: RegExpExecArray | null
  while ((match = hexRegex.exec(allCss)) !== null) {
    const raw = `#${match[1]}`
    const normalized = normalizeHex(raw)
    if (normalized && !isNeutral(normalized)) {
      colorCounts.set(normalized, (colorCounts.get(normalized) ?? 0) + 1)
    }
  }

  const rgbRegex = /rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/gi
  while ((match = rgbRegex.exec(allCss)) !== null) {
    const r = parseInt(match[1], 10)
    const g = parseInt(match[2], 10)
    const b = parseInt(match[3], 10)
    const hex = rgbToHex(r, g, b)
    if (!isNeutral(hex)) {
      colorCounts.set(hex, (colorCounts.get(hex) ?? 0) + 1)
    }
  }

  const sorted = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([color]) => color)

  const top5 = sorted.slice(0, 5)

  return {
    primary: top5[0],
    secondary: top5[1],
    accent: top5[2],
    raw: top5,
  }
}

// --- Multi-page enriched scraper ---

/** Internal type for subpage extraction results */
interface SubpageExtraction {
  type: DiscoveredPage["type"]
  content: RawExtractedContent
  html: string
}

/**
 * Scrape a single URL using the Firecrawl API and return the raw HTML.
 * Returns null on failure (timeout, network error, non-OK status).
 * Throws on billing/rate-limit errors (402/429).
 */
async function scrapePageHtml(
  url: string,
  onlyMainContent: boolean,
): Promise<string | null> {
  const { apiUrl, apiKey } = getFirecrawlConfig()

  let response: Response
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS)

    response = await fetch(`${apiUrl}/v1/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ["html"],
        onlyMainContent,
        timeout: 20000,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes("abort") || message.includes("timeout")) {
      return null
    }
    if (
      message.includes("ECONNREFUSED") ||
      message.includes("ENOTFOUND") ||
      message.includes("fetch failed")
    ) {
      return null
    }
    throw new Error(`Firecrawl request failed: ${message}`)
  }

  if (!response.ok) {
    if (response.status === 402 || response.status === 429) {
      throw new Error(
        `Firecrawl API rate limit or billing issue (HTTP ${response.status})`,
      )
    }
    return null
  }

  let body: FirecrawlScrapeResponse
  try {
    body = (await response.json()) as FirecrawlScrapeResponse
  } catch {
    return null
  }

  if (!body.success || !body.data) {
    return null
  }

  const html = body.data.html ?? ""
  return html.trim() ? html : null
}

/**
 * Enhanced multi-page website scraper.
 *
 * Scrapes the homepage with full HTML (nav/header/footer included), runs all
 * extractors, discovers up to 5 subpages, scrapes them in parallel, and
 * merges everything into a single ScrapedWebsiteData.
 *
 * Returns null if the homepage scrape fails.
 */
export async function scrapeWebsiteEnriched(
  url: string,
): Promise<ScrapedWebsiteData | null> {
  if (!url || !url.startsWith("http")) {
    return null
  }

  // 1. Scrape homepage with full HTML (onlyMainContent: false)
  const homepageHtml = await scrapePageHtml(url, false)
  if (!homepageHtml) {
    return null
  }

  // 2. Run all extractors on homepage
  const rawContent = extractContent(homepageHtml)
  const homepage = summarizeContent(rawContent, url)

  // Enrich homepage with all extractors
  homepage.socialLinks = extractSocialLinks(homepageHtml)
  homepage.bookingLinks = extractBookingLinks(homepageHtml)
  homepage.orderingLinks = extractOrderingLinks(homepageHtml)
  homepage.importantLinks = extractImportantLinks(homepageHtml)
  homepage.logo = extractLogo(homepageHtml, url)
  homepage.colorPalette = extractColorPalette(homepageHtml)
  homepage.contactInfo = extractContactInfo(homepageHtml)
  homepage.services = extractServices(homepageHtml)
  homepage.teamMembers = extractTeamMembers(homepageHtml, url)

  // 3. Discover subpages (up to 5)
  const subpages = discoverSubpages(homepageHtml, url)

  if (subpages.length === 0) {
    return homepage
  }

  // 4. Scrape subpages in parallel (best-effort, failures are silently skipped)
  const subpageResults = await Promise.allSettled(
    subpages.map(async (page): Promise<SubpageExtraction | null> => {
      const html = await scrapePageHtml(page.url, true)
      if (!html) return null
      return {
        type: page.type,
        content: extractContent(html),
        html,
      }
    }),
  )

  const successfulSubpages: SubpageExtraction[] = subpageResults
    .filter(
      (r): r is PromiseFulfilledResult<SubpageExtraction | null> =>
        r.status === "fulfilled" && r.value !== null,
    )
    .map((r) => r.value!)

  if (successfulSubpages.length === 0) {
    return homepage
  }

  // 5. Run page-type-specific extractors on each subpage
  const subpageData: SubpageScrapedData[] = successfulSubpages.map((sub) => {
    const data: SubpageScrapedData = {
      type: sub.type,
      headings: sub.content.headings,
      paragraphs: sub.content.paragraphs,
      imageUrls: sub.content.imageUrls,
    }

    switch (sub.type) {
      case "about":
        data.aboutText = detectAboutText(sub.content.paragraphs, sub.content.headings)
        break
      case "menu":
        data.menuItems = detectMenuItems(sub.content.paragraphs, sub.content.links)
        break
      case "services":
        data.services = extractServices(sub.html)
        break
      case "team":
        data.teamMembers = extractTeamMembers(sub.html, url)
        break
      case "contact":
        data.contactInfo = extractContactInfo(sub.html)
        break
    }

    return data
  })

  // 6. Merge homepage + subpages
  return mergeScrapedData(homepage, subpageData)
}

/** Data extracted from a single subpage */
export interface SubpageScrapedData {
  type: DiscoveredPage["type"]
  headings: string[]
  paragraphs: string[]
  imageUrls: string[]
  aboutText?: string | null
  menuItems?: string[]
  services?: ServiceItem[]
  teamMembers?: TeamMember[]
  contactInfo?: ContactInfo
}

/**
 * Merge homepage extraction with subpage extractions into a single ScrapedWebsiteData.
 *
 * Merge rules:
 * - headings, paragraphs, imageUrls: concatenate from all pages, dedup, slice to limits
 * - services: prefer subpage with type "services" if it has data, else homepage
 * - teamMembers: prefer subpage with type "team" if it has data, else homepage
 * - contactInfo: merge homepage + contact subpage (subpage takes priority)
 * - aboutText: prefer about subpage's longest paragraph
 * - menuItems: prefer menu subpage
 * - socialLinks, bookingLinks, logo, colorPalette, etc.: homepage only
 */
export function mergeScrapedData(
  homepage: ScrapedWebsiteData,
  subpages: SubpageScrapedData[],
): ScrapedWebsiteData {
  // Concatenate + dedup headings, paragraphs, imageUrls
  const allHeadings = [
    ...homepage.headings,
    ...subpages.flatMap((s) => s.headings),
  ]
  const allParagraphs = [
    ...homepage.paragraphs,
    ...subpages.flatMap((s) => s.paragraphs),
  ]
  const allImageUrls = [
    ...homepage.imageUrls,
    ...subpages.flatMap((s) => s.imageUrls),
  ]

  const merged: ScrapedWebsiteData = {
    ...homepage,
    headings: dedup(allHeadings).slice(0, 50),
    paragraphs: dedup(allParagraphs).slice(0, 100),
    imageUrls: dedupExact(allImageUrls).slice(0, 30),
  }

  // Services: prefer "services" subpage if it has data
  const servicesSubpage = subpages.find(
    (s) => s.type === "services" && s.services && s.services.length > 0,
  )
  if (servicesSubpage?.services) {
    merged.services = servicesSubpage.services
  }

  // Team members: prefer "team" subpage if it has data
  const teamSubpage = subpages.find(
    (s) => s.type === "team" && s.teamMembers && s.teamMembers.length > 0,
  )
  if (teamSubpage?.teamMembers) {
    merged.teamMembers = teamSubpage.teamMembers
  }

  // Contact info: merge homepage + contact subpage (subpage takes priority)
  const contactSubpage = subpages.find(
    (s) => s.type === "contact" && s.contactInfo,
  )
  if (contactSubpage?.contactInfo) {
    merged.contactInfo = {
      ...homepage.contactInfo,
      ...contactSubpage.contactInfo,
    }
  }

  // About text: prefer about subpage's longest paragraph
  const aboutSubpage = subpages.find((s) => s.type === "about")
  if (aboutSubpage?.aboutText) {
    merged.aboutText = aboutSubpage.aboutText
  } else if (aboutSubpage) {
    // If we have an about subpage but detectAboutText returned null,
    // try using the longest substantive paragraph from that subpage
    const longestParagraph = aboutSubpage.paragraphs
      .filter((p) => p.length > 50 && p.length < 1000)
      .sort((a, b) => b.length - a.length)[0]
    if (longestParagraph) {
      merged.aboutText = longestParagraph
    }
  }

  // Menu items: prefer menu subpage
  const menuSubpage = subpages.find(
    (s) => s.type === "menu" && s.menuItems && s.menuItems.length > 0,
  )
  if (menuSubpage?.menuItems) {
    merged.menuItems = menuSubpage.menuItems
  }

  return merged
}

/** Deduplicate strings by exact match (preserving order) */
function dedupExact(items: string[]): string[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item)) return false
    seen.add(item)
    return true
  })
}
