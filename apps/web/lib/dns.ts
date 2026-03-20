import { promises as dns } from "node:dns"

// ── Types ────────────────────────────────────────────────

export interface DnsCheckResult {
  /** Whether DNS is correctly configured */
  configured: boolean
  /** The domain that was checked */
  domain: string
  /** CNAME records found (if any) */
  cnameRecords: string[]
  /** Human-readable status message */
  message: string
}

// ── Constants ───────────────────────────────────────────

const EXPECTED_CNAME_TARGET = "cname.vercel-dns.com"
const DNS_CHECK_SUBDOMAIN_PREFIX = "dns-check-probe"

// ── Public API ──────────────────────────────────────────

/**
 * Check if wildcard DNS is configured for the base domain.
 *
 * This verifies that `*.{baseDomain}` has a CNAME record pointing
 * to `cname.vercel-dns.com`, which is required for Vercel to route
 * subdomain traffic to the correct project.
 *
 * @param baseDomain - The base domain to check (e.g. "surgeweb.site")
 * @returns DnsCheckResult with configuration status
 */
export async function checkDnsConfiguration(
  baseDomain?: string
): Promise<DnsCheckResult> {
  const domain = baseDomain || process.env.DOMAIN || "surgeweb.site"
  const probeDomain = `${DNS_CHECK_SUBDOMAIN_PREFIX}.${domain}`

  try {
    const cnameRecords = await dns.resolveCname(probeDomain)

    const pointsToVercel = cnameRecords.some(
      (record) =>
        record === EXPECTED_CNAME_TARGET ||
        record.endsWith(".vercel-dns.com")
    )

    if (pointsToVercel) {
      return {
        configured: true,
        domain,
        cnameRecords,
        message: `Wildcard DNS is correctly configured: *.${domain} → ${cnameRecords.join(", ")}`,
      }
    }

    return {
      configured: false,
      domain,
      cnameRecords,
      message: `CNAME record found but does not point to Vercel DNS. Expected: ${EXPECTED_CNAME_TARGET}, Found: ${cnameRecords.join(", ")}`,
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code

    // ENOTFOUND or ENODATA means no CNAME record exists
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return {
        configured: false,
        domain,
        cnameRecords: [],
        message: `No wildcard CNAME record found for *.${domain}. Add a CNAME record: *.${domain} → ${EXPECTED_CNAME_TARGET}`,
      }
    }

    // ETIMEOUT or ESERVFAIL means DNS is unreachable
    if (code === "ETIMEOUT" || code === "ESERVFAIL") {
      return {
        configured: false,
        domain,
        cnameRecords: [],
        message: `DNS lookup timed out for *.${domain}. Check your DNS provider is reachable.`,
      }
    }

    // Other DNS errors
    return {
      configured: false,
      domain,
      cnameRecords: [],
      message: `DNS lookup failed for *.${domain}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Get the DNS setup instructions for the base domain.
 */
export function getDnsSetupInstructions(baseDomain?: string): string {
  const domain = baseDomain || process.env.DOMAIN || "surgeweb.site"

  return [
    `# Wildcard DNS Setup for ${domain}`,
    "",
    "## Overview",
    `To serve generated sites at subdomains like [business].${domain},`,
    "you need a wildcard CNAME record that routes ALL subdomains to Vercel.",
    "",
    "## Steps",
    "",
    "1. Log in to your DNS provider (e.g. Cloudflare, Namecheap, Route53)",
    `2. Navigate to DNS records for \`${domain}\``,
    "3. Add a new CNAME record:",
    `   - **Type:** CNAME`,
    `   - **Name:** \`*\` (this is the wildcard)`,
    `   - **Target:** \`${EXPECTED_CNAME_TARGET}\``,
    `   - **TTL:** Auto or 300`,
    "4. If using Cloudflare, set proxy status to **DNS only** (grey cloud)",
    "",
    "## How It Works",
    `- The wildcard CNAME routes *.${domain} to Vercel's edge network`,
    "- When Vercel receives a request, it checks which project owns that domain",
    "- The deploy pipeline calls Vercel's API to register each subdomain",
    "- Vercel automatically provisions SSL certificates per subdomain",
    "",
    "## Verification",
    "Run the DNS check from the platform to verify configuration.",
    `You can also manually verify with: \`dig ${DNS_CHECK_SUBDOMAIN_PREFIX}.${domain} CNAME\``,
    "",
    "## Troubleshooting",
    "- **No CNAME found:** DNS record may not have propagated yet (can take up to 48h)",
    "- **Wrong target:** Ensure the CNAME points to `cname.vercel-dns.com`, not your own server",
    "- **Cloudflare proxy:** Wildcard CNAME must be DNS-only (grey cloud), not proxied (orange)",
    "- **SSL errors:** Vercel provisions SSL automatically — wait a few minutes after first deploy",
  ].join("\n")
}

// ── Re-exports for testing ──────────────────────────────

export { EXPECTED_CNAME_TARGET, DNS_CHECK_SUBDOMAIN_PREFIX }
