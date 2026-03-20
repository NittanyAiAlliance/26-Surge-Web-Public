import Stripe from "stripe"

let stripeInstance: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) {
      throw new Error("Missing STRIPE_SECRET_KEY environment variable")
    }
    stripeInstance = new Stripe(key, { apiVersion: "2026-02-25.clover" })
  }
  return stripeInstance
}

// ── Plan configuration ───────────────────────────────────

export const PLAN_CONFIG = {
  free: {
    name: "Free",
    price: 0,
    sites: 15,
    generations: 15,
  },
  pro: {
    name: "Pro",
    price: 3500, // cents
    sites: 15,
    generations: 100,
  },
  agency: {
    name: "Agency",
    price: 9900, // cents
    sites: 999, // effectively unlimited
    generations: 999,
  },
} as const

export type PlanKey = keyof typeof PLAN_CONFIG

/**
 * Map Stripe Price IDs to plan keys.
 * Set these in env: STRIPE_PRO_PRICE_ID, STRIPE_AGENCY_PRICE_ID
 */
export function getPriceIdForPlan(plan: "pro" | "agency"): string {
  const envKey = plan === "pro" ? "STRIPE_PRO_PRICE_ID" : "STRIPE_AGENCY_PRICE_ID"
  const priceId = process.env[envKey]
  if (!priceId) {
    throw new Error(`Missing ${envKey} environment variable`)
  }
  return priceId
}

export function getPlanForPriceId(priceId: string): PlanKey | null {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro"
  if (priceId === process.env.STRIPE_AGENCY_PRICE_ID) return "agency"
  return null
}

// ── Checkout session creation ────────────────────────────

export async function createCheckoutSession(opts: {
  userId: string
  userEmail: string
  plan: "pro" | "agency"
  stripeCustomerId?: string | null
  successUrl: string
  cancelUrl: string
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe()
  const priceId = getPriceIdForPlan(opts.plan)

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.userId,
    metadata: { userId: opts.userId, plan: opts.plan },
  }

  if (opts.stripeCustomerId) {
    params.customer = opts.stripeCustomerId
  } else {
    params.customer_email = opts.userEmail
  }

  return stripe.checkout.sessions.create(params)
}

// ── Customer portal ──────────────────────────────────────

export async function createPortalSession(
  stripeCustomerId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripe()
  return stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  })
}

// ── Webhook signature verification ───────────────────────

export function constructWebhookEvent(
  body: string,
  signature: string
): Stripe.Event {
  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET environment variable")
  }
  return stripe.webhooks.constructEvent(body, signature, secret)
}
