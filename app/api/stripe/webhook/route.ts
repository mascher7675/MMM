// app/api/stripe/webhook/route.ts

import { NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { createClient } from "@/lib/supabase/server"
import Stripe from "stripe"

// ---------------------------------------------------------------------------
// Stripe requires the raw request body to verify webhook signatures.
// Next.js App Router gives us access via request.text().
// ---------------------------------------------------------------------------
export const runtime = "nodejs"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a Unix timestamp to a YYYY-MM-DD string in EST (UTC-5). */
function unixToESTDateStr(unixTs: number): string {
  const EST_OFFSET_MS = -5 * 60 * 60 * 1000
  const d = new Date(unixTs * 1000 + EST_OFFSET_MS)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

// ---------------------------------------------------------------------------
// POST /api/stripe/webhook
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET is not set")
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 })
  }

  // ---------------------------------------------------------------------------
  // Verify the event came from Stripe
  // ---------------------------------------------------------------------------
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signature verification failed"
    console.error("[webhook] Signature verification failed:", message)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  // ---------------------------------------------------------------------------
  // Route events
  // ---------------------------------------------------------------------------
  try {
    switch (event.type) {
      case "invoice.upcoming":
        await handleInvoiceUpcoming(event.data.object as Stripe.Invoice)
        break

      default:
        // Acknowledge but ignore unhandled events
        break
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Handler error"
    console.error(`[webhook] Error handling ${event.type}:`, message)
    // Return 200 anyway so Stripe doesn't retry — we log the error for investigation
    return NextResponse.json({ error: message }, { status: 200 })
  }

  return NextResponse.json({ received: true })
}

// ---------------------------------------------------------------------------
// invoice.upcoming handler
//
// Stripe fires this ~1 hour before the invoice finalizes (Thursday ~11 PM,
// since all subscriptions are anchored to Friday noon UTC).
//
// All customers share the same skip cutoff: Thursday 5 PM EST.
// This fires after the cutoff, so skipped_dates is finalized by the time
// this runs.
//
// Logic:
//   1. Find the subscription in our DB by stripe_subscription_id via
//      get_subscription_for_webhook() — a SECURITY DEFINER function that
//      bypasses RLS so the sessionless webhook request can read the DB.
//   2. Determine the delivery date for this billing period:
//      - period_start is always a Friday (universal Friday billing anchor)
//      - Friday customers: delivery = that same Friday
//      - Thursday customers: delivery = the Thursday immediately before
//   3. Check if that delivery date is in skipped_dates.
//   4. If yes → add a credit invoice item equal to the full invoice amount,
//      bringing the total to $0. Customer is not charged.
// ---------------------------------------------------------------------------
async function handleInvoiceUpcoming(invoice: Stripe.Invoice) {
  // The 2026-02-25.clover API version moved subscription off the Invoice type.
  // Cast through unknown to access it, consistent with the rest of the codebase.
  const invoiceAny = invoice as unknown as { subscription?: string | { id: string } }
  const stripeSubscriptionId =
    typeof invoiceAny.subscription === "string"
      ? invoiceAny.subscription
      : invoiceAny.subscription?.id

  if (!stripeSubscriptionId) {
    // Not a subscription invoice — nothing to do
    return
  }

  // Use SECURITY DEFINER RPC functions so the webhook can read/write the DB
  // without a user session. Direct table access would be blocked by RLS since
  // Stripe webhook requests have no auth cookie.
  const supabase = await createClient()

  const { data: rows, error: subError } = await supabase
    .rpc("get_subscription_for_webhook", {
      p_stripe_subscription_id: stripeSubscriptionId,
    })

  const sub = rows?.[0] ?? null

  if (subError || !sub) {
    console.log(`[webhook] invoice.upcoming: no subscription found for ${stripeSubscriptionId}`)
    return
  }

  if (sub.status !== "active") {
    return
  }

  const skippedDates: string[] = Array.isArray(sub.skipped_dates) ? sub.skipped_dates : []

  if (skippedDates.length === 0) {
    return
  }

  // ---------------------------------------------------------------------------
  // Determine the delivery date this invoice is charging for.
  //
  // period_start is always a Friday (universal Friday billing anchor).
  //
  // Friday customers:   delivery = that same Friday
  // Thursday customers: delivery = the Thursday immediately before period_start
  //
  // We walk BACKWARD from period_start to find the correct weekday.
  // Walking forward would find the wrong week for Thursday customers
  // (next Thursday, 6 days later, instead of yesterday).
  // ---------------------------------------------------------------------------
  const periodStartDate = unixToESTDateStr(invoice.period_start)
  const deliveryDate = getDeliveryDateForPeriod(periodStartDate, sub.delivery_day as "thursday" | "friday")

  if (!deliveryDate) {
    console.log(`[webhook] invoice.upcoming: could not determine delivery date for period starting ${periodStartDate}`)
    return
  }

  if (!skippedDates.includes(deliveryDate)) {
    // This delivery isn't skipped — charge normally
    return
  }

  // ---------------------------------------------------------------------------
  // The delivery is skipped. Add a credit invoice item to zero out the invoice.
  // ---------------------------------------------------------------------------
  const amountToCredit = invoice.amount_due

  if (amountToCredit <= 0) {
    // Already zero — nothing to do
    return
  }

  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id

  if (!customerId) {
    console.error("[webhook] invoice.upcoming: no customer on invoice", invoice.id)
    return
  }

  console.log(
    `[webhook] Skipping delivery ${deliveryDate} for sub ${stripeSubscriptionId}. ` +
    `Crediting $${(amountToCredit / 100).toFixed(2)} on invoice ${invoice.id}`
  )

  await stripe.invoiceItems.create({
    customer: customerId,
    amount: -amountToCredit,        // negative = credit
    currency: invoice.currency,
    description: `Skipped delivery — ${deliveryDate}`,
    invoice: invoice.id ?? undefined,
  })

  // ---------------------------------------------------------------------------
  // Remove the date from skipped_dates after applying the credit.
  // This prevents double-crediting if Stripe retries the event.
  // Uses SECURITY DEFINER function to bypass RLS for the sessionless webhook.
  // ---------------------------------------------------------------------------
  const newSkippedDates = skippedDates.filter((d) => d !== deliveryDate)

  const { error: updateError } = await supabase
    .rpc("update_subscription_skipped_dates", {
      p_subscription_id: sub.id,
      p_skipped_dates: newSkippedDates,
    })

  if (updateError) {
    console.error(`[webhook] Failed to update skipped_dates for sub ${sub.id}:`, updateError.message)
  } else {
    console.log(
      `[webhook] Credit applied. Removed ${deliveryDate} from skipped_dates for sub ${sub.id}`
    )
  }
}

// ---------------------------------------------------------------------------
// Given a period_start date string (YYYY-MM-DD, always a Friday with universal
// Friday billing) and the customer's delivery day, find the delivery date for
// that billing period.
//
// We walk BACKWARD from period_start to find the matching weekday:
//   - Friday customers:   period_start IS the delivery date (0 days back)
//   - Thursday customers: delivery was the day before (1 day back)
//
// Walking backward is correct because Thursday delivery always precedes
// Friday billing. Walking forward would skip to the following Thursday
// (6 days later), matching the wrong week.
// ---------------------------------------------------------------------------
function getDeliveryDateForPeriod(
  periodStart: string,             // YYYY-MM-DD — always a Friday
  deliveryDay: "thursday" | "friday"
): string | null {
  const targetDayNum = deliveryDay === "friday" ? 5 : 4  // JS getDay(): Thu=4, Fri=5

  const [y, m, d] = periodStart.split("-").map(Number)
  const date = new Date(y, m - 1, d)

  // Walk backward up to 7 days to find the matching weekday
  for (let i = 0; i < 7; i++) {
    if (date.getDay() === targetDayNum) {
      const yyyy = date.getFullYear()
      const mm = String(date.getMonth() + 1).padStart(2, "0")
      const dd = String(date.getDate()).padStart(2, "0")
      return `${yyyy}-${mm}-${dd}`
    }
    date.setDate(date.getDate() - 1)
  }

  return null
}