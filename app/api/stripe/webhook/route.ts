// app/api/stripe/webhook/route.ts

import { NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { createClient } from "@/lib/supabase/server"
import Stripe from "stripe"

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

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signature verification failed"
    console.error("[webhook] Signature verification failed:", message)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "invoice.upcoming":
        await handleInvoiceUpcoming(event.data.object as Stripe.Invoice)
        break

      default:
        break
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Handler error"
    console.error(`[webhook] Error handling ${event.type}:`, message)
    return NextResponse.json({ error: message }, { status: 200 })
  }

  return NextResponse.json({ received: true })
}

// ---------------------------------------------------------------------------
// invoice.upcoming handler
// ---------------------------------------------------------------------------
async function handleInvoiceUpcoming(invoice: Stripe.Invoice) {
  const invoiceAny = invoice as unknown as { subscription?: string | { id: string } }
  const stripeSubscriptionId =
    typeof invoiceAny.subscription === "string"
      ? invoiceAny.subscription
      : invoiceAny.subscription?.id

  if (!stripeSubscriptionId) return

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

  if (sub.status !== "active") return

  const periodStartDate = unixToESTDateStr(invoice.period_start)
  const deliveryDate = getDeliveryDateForPeriod(periodStartDate, sub.delivery_day as "thursday" | "friday")

  if (!deliveryDate) {
    console.log(`[webhook] invoice.upcoming: could not determine delivery date for period starting ${periodStartDate}`)
    return
  }

  const skippedDates: string[] = Array.isArray(sub.skipped_dates) ? sub.skipped_dates : []
  const isSkipped = skippedDates.includes(deliveryDate)

  const { data: orderResult, error: orderError } = await supabase
    .rpc("create_weekly_delivery_order", {
      p_subscription_id: sub.id,
      p_delivery_date: deliveryDate,
      p_status: isSkipped ? "skipped" : "confirmed",
      p_stripe_invoice_id: invoice.id ?? "",
    })

  if (orderError) {
    console.error(`[webhook] Failed to create weekly delivery order for sub ${sub.id}:`, orderError.message)
  } else {
    const result = orderResult as { error: string | null; skipped_duplicate?: boolean; order_id?: string }
    if (result?.skipped_duplicate) {
      console.log(`[webhook] Weekly order already exists for sub ${sub.id} on ${deliveryDate} — skipping duplicate`)
    } else if (result?.order_id) {
      console.log(`[webhook] Created ${isSkipped ? "skipped" : "confirmed"} order ${result.order_id} for sub ${sub.id} on ${deliveryDate}`)
    }
  }

  if (!isSkipped) return

  const amountToCredit = invoice.amount_due

  if (amountToCredit > 0) {
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
      amount: -amountToCredit,
      currency: invoice.currency,
      description: `Skipped delivery — ${deliveryDate}`,
      invoice: invoice.id ?? undefined,
    })
  }

  const newSkippedDates = skippedDates.filter((d) => d !== deliveryDate)

  const { error: updateError } = await supabase
    .rpc("update_subscription_skipped_dates", {
      p_subscription_id: sub.id,
      p_skipped_dates: newSkippedDates,
    })

  if (updateError) {
    console.error(`[webhook] Failed to update skipped_dates for sub ${sub.id}:`, updateError.message)
  } else {
    console.log(`[webhook] Removed ${deliveryDate} from skipped_dates for sub ${sub.id}`)
  }
}

// ---------------------------------------------------------------------------
// Utility: given a period_start date (always a Friday) and delivery day,
// find the matching delivery date for that billing period.
// ---------------------------------------------------------------------------
function getDeliveryDateForPeriod(
  periodStart: string,
  deliveryDay: "thursday" | "friday"
): string | null {
  const targetDayNum = deliveryDay === "friday" ? 5 : 4
  const [y, m, d] = periodStart.split("-").map(Number)
  const date = new Date(y, m - 1, d)

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