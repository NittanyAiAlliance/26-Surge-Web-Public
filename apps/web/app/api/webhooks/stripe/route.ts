import { NextRequest, NextResponse } from "next/server"
import { constructWebhookEvent, getPlanForPriceId } from "@/lib/stripe"
import { getUserByStripeCustomerId, updateUserStripeInfo, getUser } from "@radiant/db/queries"
import { logError } from "@radiant/db/queries"
import type Stripe from "stripe"

export async function POST(req: NextRequest) {
  let event: Stripe.Event

  try {
    const body = await req.text()
    const signature = req.headers.get("stripe-signature")
    if (!signature) {
      return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 })
    }
    event = constructWebhookEvent(body, signature)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook verification failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.client_reference_id || session.metadata?.userId
        if (!userId) break

        const user = await getUser(userId)
        if (!user) break

        const plan = (session.metadata?.plan as "pro" | "agency") || "pro"

        await updateUserStripeInfo(userId, {
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          subscription_status: "active",
          plan,
        })
        break
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        const user = await getUserByStripeCustomerId(customerId)
        if (!user) break

        const priceId = subscription.items.data[0]?.price?.id
        const plan = priceId ? getPlanForPriceId(priceId) : null

        await updateUserStripeInfo(user.id, {
          stripe_subscription_id: subscription.id,
          subscription_status: mapSubscriptionStatus(subscription.status),
          ...(plan ? { plan } : {}),
          billing_cycle_start: new Date(subscription.start_date * 1000).toISOString(),
        })
        break
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        const user = await getUserByStripeCustomerId(customerId)
        if (!user) break

        await updateUserStripeInfo(user.id, {
          stripe_subscription_id: null,
          subscription_status: "canceled",
          plan: "free",
          billing_cycle_start: null,
          billing_cycle_end: null,
        })
        break
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string
        const user = await getUserByStripeCustomerId(customerId)
        if (!user) break

        await updateUserStripeInfo(user.id, {
          subscription_status: "past_due",
        })
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook handler failed"
    await logError({
      route: "/api/webhooks/stripe",
      method: "POST",
      status_code: 500,
      error_message: message,
      error_code: event.type,
      stack_trace: err instanceof Error ? err.stack : undefined,
      request_context: { event_id: event.id, event_type: event.type },
    }).catch(() => {})
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function mapSubscriptionStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active": return "active"
    case "past_due": return "past_due"
    case "canceled": return "canceled"
    case "trialing": return "trialing"
    default: return "none"
  }
}
