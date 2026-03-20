import { Resend } from "resend"

// ── Client ─────────────────────────────────────────────

let _resend: Resend | null = null

function getResendClient(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error("Missing RESEND_API_KEY environment variable")
    }
    _resend = new Resend(apiKey)
  }
  return _resend
}

// ── Constants ──────────────────────────────────────────

const FROM_EMAIL = "Surge <noreply@surgeweb.site>"

// ── Email Functions ────────────────────────────────────

/**
 * Send a welcome email after user signup.
 */
export async function sendWelcomeEmail(to: string, name?: string): Promise<void> {
  const resend = getResendClient()
  const greeting = name ? `Hi ${name}` : "Welcome"

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Welcome to Surge",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="color: #f59e0b; font-size: 24px; margin-bottom: 16px;">Surge</h1>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">${greeting},</p>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
          Thanks for signing up! You can now generate beautiful websites for any local business in seconds.
        </p>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
          Get started by entering a business name and location — we'll handle the rest.
        </p>
        <a href="https://surgeweb.site/generate" style="display: inline-block; padding: 12px 24px; background: linear-gradient(to right, #f59e0b, #f97316); color: #000; font-weight: 600; text-decoration: none; border-radius: 8px; margin-top: 16px;">Generate Your First Site</a>
        <p style="color: #9ca3af; font-size: 13px; margin-top: 32px;">— The Surge Team</p>
      </div>
    `,
  })
}

/**
 * Send "Your site is live!" notification after successful deployment.
 */
export async function sendSiteLiveEmail(
  to: string,
  businessName: string,
  siteUrl: string
): Promise<void> {
  const resend = getResendClient()

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Your site is live — ${businessName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="color: #f59e0b; font-size: 24px; margin-bottom: 16px;">Your site is live!</h1>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
          Great news — <strong>${businessName}</strong> is now live on the web.
        </p>
        <a href="${siteUrl}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(to right, #f59e0b, #f97316); color: #000; font-weight: 600; text-decoration: none; border-radius: 8px; margin-top: 16px;">Visit Your Site</a>
        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
          URL: <a href="${siteUrl}" style="color: #f59e0b;">${siteUrl}</a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">
          You can manage your site from your <a href="https://surgeweb.site/dashboard" style="color: #f59e0b;">dashboard</a>.
        </p>
        <p style="color: #9ca3af; font-size: 13px; margin-top: 32px;">— The Surge Team</p>
      </div>
    `,
  })
}

/**
 * Send notification when site generation fails.
 */
export async function sendGenerationFailedEmail(
  to: string,
  businessName: string,
  errorMessage: string
): Promise<void> {
  const resend = getResendClient()

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Generation failed — ${businessName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="color: #ef4444; font-size: 24px; margin-bottom: 16px;">Generation Failed</h1>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
          Unfortunately, we couldn't generate the website for <strong>${businessName}</strong>.
        </p>
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="color: #991b1b; font-size: 14px; margin: 0;">${errorMessage}</p>
        </div>
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
          You can try again from your dashboard. If this keeps happening, our team is looking into it.
        </p>
        <a href="https://surgeweb.site/dashboard" style="display: inline-block; padding: 12px 24px; background: linear-gradient(to right, #f59e0b, #f97316); color: #000; font-weight: 600; text-decoration: none; border-radius: 8px; margin-top: 16px;">Go to Dashboard</a>
        <p style="color: #9ca3af; font-size: 13px; margin-top: 32px;">— The Surge Team</p>
      </div>
    `,
  })
}
