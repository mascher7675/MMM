// app/api/stripe/webhook/route.ts

import { NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { createServiceClient } from "@/lib/supabase/service"
import Stripe from "stripe"
import { cutoffUnixForDeliveryDate, easternDateStrFromUnix } from "@/lib/delivery-utils"

export const runtime = "nodejs"

// ---------------------------------------------------------------------------
// Billing model: "pay for week 1 today, renew at your cutoff" (locked
// Session 11 — see app/actions/stripe.ts and the checklist for the full
// design).
//
// - The customer pays the full weekly price AT CHECKOUT; that signup charge
//   covers delivery #1 and is attached to the first order by the success
//   page (saveOrderFromSession), NOT by this webhook.
// - Immediately after checkout, the app moves the renewal to the customer's
//   weekly cutoff via a trial_end update — Stripe generates a $0
//   "subscription_update" invoice for that, which is noise this webhook
//   deliberately ignores.
// - From the first renewal onward, every weekly charge fires at the cutoff
//   (5 PM EST the evening before delivery) and is handled here.
//
// Event responsibilities:
// - invoice.upcoming        → pre-create the weekly order row a few days early
//                             (routing/admin visibility). Preview only — no
//                             real invoice exists yet, so no crediting here.
// - invoice.created         → THE authoritative moment (fires at the cutoff,
//                             when skips are locked). Ensures the order row
//                             exists, applies the skip credit to the real
//                             draft invoice if the week was skipped,
//                             finalizes the order's skip state, and advances
//                             subscriptions.current_period_end to the next
// -                            cutoff so the DB stays fresh week over week.
// - invoice.payment_succeeded → attach the real payment_intent to the weekly
//                             order row so admin refunds have a charge to
//                             act on (renewal invoices only — the signup
//                             invoice is handled by the success page).
// - customer.subscription.deleted → mark our subscription row cancelled.
//
// Auth note (added during pre-launch security pass): every supabase.rpc()
// call below hits a SECURITY DEFINER function that bypasses RLS by design —
// that's required for a webhook, since there's no logged-in user. Those
// functions' EXECUTE privilege is now locked to the service_role only (see
// migration lock_down_webhook_rpcs_to_service_role /
// revoke_public_execute_on_webhook_rpcs), so this route must authenticate
// with the service-role client, not the anon-key one. Using the anon-key
// client here would now just fail these calls outright.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// The old local date/cutoff helpers were removed here. They assumed a fixed
// UTC-5 offset, which is wrong half the year (EDT = UTC-4), so cutoffs during
// daylight time were computed an hour late. Date/cutoff math now delegates to
// the DST-safe helpers imported from lib/delivery-utils.ts (the same ones used
// by subscription.ts and the rest of the app).

/**
 * Extract the subscription id from an invoice.
 *
 * Under newer Stripe API versions (2025-03-31 "basil" and later, including
 * our 2026 "clover" version), invoices no longer carry a top-level
 * `subscription` field — it moved to invoice.parent.subscription_details.
 * We check the modern location first and fall back to the legacy field.
 */
function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const invAny = invoice as unknown as {
    parent?: {
      subscription_details?: {
        subscription?: string | { id: string } | null
      } | null
    } | null
    subscription?: string | { id: string } | null
  }

  const modern = invAny.parent?.subscription_details?.subscription
  if (modern) return typeof modern === "string" ? modern : modern.id

  const legacy = invAny.subscription
  if (legacy) return typeof legacy === "string" ? legacy : legacy.id

  return null
}

/** Get the invoice's billing_reason (typed loosely for API-version drift). */
function getBillingReason(invoice: Stripe.Invoice): string | null {
  return (invoice as unknown as { billing_reason?: string | null }).billing_reason ?? null
}

/**
 * Resolve the payment_intent id for an invoice.
 *
 * Modern API versions don't include payment_intent on the invoice object —
 * payments live in the invoice's `payments` list, which requires an explicit
 * retrieve with expand. Legacy field checked as a fallback.
 */
async function resolvePaymentIntentForInvoice(invoiceId: string): Promise<string | null> {
  try {
    const invoice = await stripe.invoices.retrieve(invoiceId, {
      expand: ["payments"],
    })

    const invAny = invoice as unknown as {
      payment_intent?: string | { id: string } | null
      payments?: {
        data?: Array<{
          payment?: {
            type?: string
            payment_intent?: string | { id: string } | null
          }
        }>
      }
    }

    const fromPayments = invAny.payments?.data
      ?.map((p) => p.payment?.payment_intent)
      .find((pi) => !!pi)

    const raw = fromPayments ?? invAny.payment_intent ?? null
    return typeof raw === "string" ? raw : raw?.id ?? null
  } catch (e) {
    console.error(`[webhook] Failed to resolve payment_intent for invoice ${invoiceId}:`, e)
    return null
  }
}

/**
 * Given a billing period start (the cutoff moment) and the customer's
 * delivery day, find the delivery this charge pays for: the FIRST occurrence
 * of the delivery day ON or AFTER the period start.
 *
 * Charge Wed 5 PM → delivery Thursday (next day).
 * Charge Thu 5 PM → delivery Friday (next day).
 */
function getDeliveryDateForPeriod(
  periodStart: string,
  deliveryDay: "thursday" | "friday"
): string | null {
  const targetDayNum = deliveryDay === "friday" ? 5 : 4
  const [y, m, d] = periodStart.split("-").map(Number)
  const date = new Date(y, m - 1, d)

  for (let i = 0; i <= 7; i++) {
    if (date.getDay() === targetDayNum) {
      const yyyy = date.getFullYear()
      const mm = String(date.getMonth() + 1).padStart(2, "0")
      const dd = String(date.getDate()).padStart(2, "0")
      return `${yyyy}-${mm}-${dd}`
    }
    date.setDate(date.getDate() + 1)
  }

  return null
}

/**
 * The next cutoff after a given delivery date: 5 PM Eastern on delivery + 6
 * days. DST-safe. cutoffUnixForDeliveryDate(X) returns "5 PM ET the evening
 * before X", so to get "5 PM ET on delivery + 6" we ask for the cutoff before
 * delivery + 7 (same trick used in subscription.ts).
 */
function nextPeriodEndISOFromDelivery(deliveryDate: string): string {
  const [y, m, d] = deliveryDate.split("-").map(Number)
  const nextDelivery = new Date(y, m - 1, d + 7)
  const yyyy = nextDelivery.getFullYear()
  const mm = String(nextDelivery.getMonth() + 1).padStart(2, "0")
  const dd = String(nextDelivery.getDate()).padStart(2, "0")
  return new Date(cutoffUnixForDeliveryDate(`${yyyy}-${mm}-${dd}`) * 1000).toISOString()
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

      case "invoice.created":
        await handleInvoiceCreated(event.data.object as Stripe.Invoice)
        break

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
        break

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
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
// customer.subscription.deleted handler
// ---------------------------------------------------------------------------
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const stripeSubscriptionId = subscription.id

  if (!stripeSubscriptionId) return

  const supabase = createServiceClient()

  const { data: wasFound, error } = await supabase.rpc("mark_subscription_cancelled_by_stripe_id", {
    p_stripe_subscription_id: stripeSubscriptionId,
  })

  if (error) {
    console.error(
      `[webhook] Failed to mark subscription cancelled for stripe sub ${stripeSubscriptionId}:`,
      error.message
    )
  } else if (wasFound) {
    console.log(`[webhook] Marked subscription cancelled for stripe sub ${stripeSubscriptionId}`)
  } else {
    console.log(
      `[webhook] customer.subscription.deleted received for stripe sub ${stripeSubscriptionId}, but no matching row exists in subscriptions — nothing updated`
    )
  }
}

// ---------------------------------------------------------------------------
// Shared: look up our subscription row + the delivery date for an invoice.
// ---------------------------------------------------------------------------
type WebhookSub = {
  id: string
  status: string
  delivery_day: "thursday" | "friday"
  skipped_dates: string[]
}

async function lookupSubAndDeliveryDate(
  invoice: Stripe.Invoice,
  eventLabel: string
): Promise<{ stripeSubscriptionId: string; sub: WebhookSub; deliveryDate: string } | null> {
  const stripeSubscriptionId = getSubscriptionIdFromInvoice(invoice)

  if (!stripeSubscriptionId) {
    console.log(
      `[webhook] ${eventLabel}: invoice ${invoice.id ?? "(preview)"} has no subscription attached — skipping (expected for one-time invoices or bare stripe trigger fixtures)`
    )
    return null
  }

  const supabase = createServiceClient()
  const { data: rows, error: subError } = await supabase.rpc("get_subscription_for_webhook", {
    p_stripe_subscription_id: stripeSubscriptionId,
  })

  const subRow = rows?.[0] ?? null
  if (subError || !subRow) {
    console.log(`[webhook] ${eventLabel}: no subscription found for ${stripeSubscriptionId}`)
    return null
  }

  const sub: WebhookSub = {
    id: subRow.id,
    status: subRow.status,
    delivery_day: subRow.delivery_day === "thursday" ? "thursday" : "friday",
    skipped_dates: Array.isArray(subRow.skipped_dates) ? subRow.skipped_dates : [],
  }

  const periodStartDate = easternDateStrFromUnix(invoice.period_start)
  const deliveryDate = getDeliveryDateForPeriod(periodStartDate, sub.delivery_day)

  if (!deliveryDate) {
    console.log(
      `[webhook] ${eventLabel}: could not determine delivery date for period starting ${periodStartDate}`
    )
    return null
  }

  return { stripeSubscriptionId, sub, deliveryDate }
}

// ---------------------------------------------------------------------------
// invoice.upcoming handler
//
// PREVIEW event — fires a few days before the cutoff. We pre-create the
// weekly order row here so it shows up early for routing/admin planning.
// No real invoice exists yet, so no crediting and no skipped_dates mutation
// happens here — that's invoice.created's job (the authoritative moment).
// ---------------------------------------------------------------------------
async function handleInvoiceUpcoming(invoice: Stripe.Invoice) {
  const ctx = await lookupSubAndDeliveryDate(invoice, "invoice.upcoming")
  if (!ctx) return
  const { sub, deliveryDate } = ctx

  if (sub.status !== "active") return

  const supabase = createServiceClient()
  const isSkipped = sub.skipped_dates.includes(deliveryDate)

  const { data: orderResult, error: orderError } = await supabase.rpc("create_weekly_delivery_order", {
    p_subscription_id: sub.id,
    p_delivery_date: deliveryDate,
    p_status: isSkipped ? "skipped" : "confirmed",
    p_stripe_invoice_id: "", // preview invoices have no real id
  })

  if (orderError) {
    console.error(`[webhook] invoice.upcoming: failed to create weekly order for sub ${sub.id}:`, orderError.message)
    return
  }

  const result = orderResult as { error: string | null; skipped_duplicate?: boolean; order_id?: string }
  if (result?.skipped_duplicate) {
    console.log(`[webhook] invoice.upcoming: weekly order already exists for sub ${sub.id} on ${deliveryDate}`)
  } else if (result?.order_id) {
    console.log(
      `[webhook] invoice.upcoming: pre-created ${isSkipped ? "skipped" : "confirmed"} order ${result.order_id} for sub ${sub.id} on ${deliveryDate}`
    )
  }
}

// ---------------------------------------------------------------------------
// invoice.created handler
//
// Fires when the REAL invoice is created at the cutoff (5 PM EST the evening
// before delivery). The skip window is locked at this exact moment, so the
// subscription's skipped_dates are final for this delivery. Subscription
// renewal invoices are created as drafts and auto-finalize about an hour
// later, which gives us the window to attach a credit line item.
//
// Responsibilities:
// 1. Ensure the weekly order row exists (safety net if invoice.upcoming
//    didn't fire or was missed).
// 2. Advance subscriptions.current_period_end to the next cutoff, so the
//    DB stays accurate week over week instead of freezing at the signup
//    value.
// 3. If the week is skipped: credit the full amount on this draft invoice,
//    mark the order skipped, and clear the date from skipped_dates.
// 4. If NOT skipped (including "skipped, then changed their mind"): make sure
//    the order row says confirmed.
// ---------------------------------------------------------------------------
async function handleInvoiceCreated(invoice: Stripe.Invoice) {
  // Only weekly renewal invoices. The signup invoice (subscription_create)
  // is fully handled at checkout, the $0 trial-reschedule invoice
  // (subscription_update) needs nothing, and manual invoices aren't ours
  // to touch.
  if (getBillingReason(invoice) !== "subscription_cycle") return

  const ctx = await lookupSubAndDeliveryDate(invoice, "invoice.created")
  if (!ctx) return
  const { stripeSubscriptionId, sub, deliveryDate } = ctx

  const supabase = createServiceClient()
  const isSkipped = sub.skipped_dates.includes(deliveryDate)

  // 1. Ensure the order row exists (idempotent — duplicate-safe RPC).
  const { data: orderResult, error: orderError } = await supabase.rpc("create_weekly_delivery_order", {
    p_subscription_id: sub.id,
    p_delivery_date: deliveryDate,
    p_status: isSkipped ? "skipped" : "confirmed",
    p_stripe_invoice_id: invoice.id ?? "",
  })

  if (orderError) {
    console.error(`[webhook] invoice.created: failed to ensure weekly order for sub ${sub.id}:`, orderError.message)
  } else {
    const result = orderResult as { error: string | null; skipped_duplicate?: boolean; order_id?: string }
    if (result?.order_id && !result?.skipped_duplicate) {
      console.log(
        `[webhook] invoice.created: created ${isSkipped ? "skipped" : "confirmed"} order ${result.order_id} for sub ${sub.id} on ${deliveryDate} (upcoming didn't pre-create it)`
      )
    }
  }

  // 2. Advance current_period_end to the next cutoff (this charge's period
  //    ends at the following week's cutoff = delivery + 6 days, 5 PM EST).
  const nextPeriodEnd = nextPeriodEndISOFromDelivery(deliveryDate)
  const { error: periodError } = await supabase.rpc("update_subscription_period_end", {
    p_stripe_subscription_id: stripeSubscriptionId,
    p_period_end: nextPeriodEnd,
  })
  if (periodError) {
    console.error(
      `[webhook] invoice.created: failed to advance current_period_end for sub ${sub.id}:`,
      periodError.message
    )
  } else {
    console.log(`[webhook] invoice.created: advanced current_period_end to ${nextPeriodEnd} for sub ${sub.id}`)
  }

  // 3. Make the order's skip state authoritative (order may have been
  //    pre-created with a stale state by invoice.upcoming days ago).
  const { error: stateError } = await supabase.rpc("set_weekly_order_skip_state", {
    p_stripe_subscription_id: stripeSubscriptionId,
    p_delivery_date: deliveryDate,
    p_skipped: isSkipped,
  })
  if (stateError) {
    console.error(`[webhook] invoice.created: failed to set skip state for sub ${sub.id} on ${deliveryDate}:`, stateError.message)
  }

  if (!isSkipped) return

  // 4. Skipped week: credit the full recurring amount on this draft invoice
  //    so the customer pays $0 for it.
  const amountToCredit = invoice.amount_due

  if (amountToCredit > 0 && invoice.id) {
    const customerId =
      typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id

    if (!customerId) {
      console.error("[webhook] invoice.created: no customer on invoice", invoice.id)
      return
    }

    console.log(
      `[webhook] invoice.created: skipping delivery ${deliveryDate} for sub ${stripeSubscriptionId}. ` +
        `Crediting $${(amountToCredit / 100).toFixed(2)} on invoice ${invoice.id}`
    )

    await stripe.invoiceItems.create({
      customer: customerId,
      amount: -amountToCredit,
      currency: invoice.currency,
      description: `Skipped delivery — ${deliveryDate}`,
      invoice: invoice.id,
    })
  }

  // 5. Clear the consumed skip date.
  const newSkippedDates = sub.skipped_dates.filter((d) => d !== deliveryDate)

  const { error: updateError } = await supabase.rpc("update_subscription_skipped_dates", {
    p_subscription_id: sub.id,
    p_skipped_dates: newSkippedDates,
  })

  if (updateError) {
    console.error(`[webhook] invoice.created: failed to update skipped_dates for sub ${sub.id}:`, updateError.message)
  } else {
    console.log(`[webhook] invoice.created: removed ${deliveryDate} from skipped_dates for sub ${sub.id}`)
  }
}

// ---------------------------------------------------------------------------
// invoice.payment_succeeded handler
//
// Fires once Stripe has actually charged the card. Attaches the real
// payment_intent to the matching weekly order row so admin refunds have a
// charge to act on.
//
// Renewal invoices only. Two signup-time invoice types are deliberately
// ignored with clear logs (they fire during checkout, before our DB rows
// even exist, and need nothing from this handler):
// - billing_reason "subscription_create": the week-1 charge — the success
//   page (saveOrderFromSession) creates the order AND attaches this payment
//   itself, from the signup invoice.
// - billing_reason "subscription_update": the $0 invoice Stripe generates
//   when the app moves the renewal to the cutoff via trial_end.
// ---------------------------------------------------------------------------
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const billingReason = getBillingReason(invoice)

  if (billingReason === "subscription_create") {
    console.log(
      `[webhook] invoice.payment_succeeded: signup invoice ${invoice.id} — expected; the checkout success page attaches this payment to the first order itself. Nothing to do here.`
    )
    return
  }

  if (billingReason === "subscription_update") {
    console.log(
      `[webhook] invoice.payment_succeeded: $0 trial-reschedule invoice ${invoice.id} — expected side effect of moving the renewal to the cutoff. Nothing to do here.`
    )
    return
  }

  const ctx = await lookupSubAndDeliveryDate(invoice, "invoice.payment_succeeded")
  if (!ctx) return
  const { stripeSubscriptionId, sub, deliveryDate } = ctx

  if (!invoice.id) return

  const paymentIntentId = await resolvePaymentIntentForInvoice(invoice.id)

  if (!paymentIntentId) {
    console.log(
      `[webhook] invoice.payment_succeeded: no payment_intent on invoice ${invoice.id} for sub ${stripeSubscriptionId} — likely a $0 invoice (fully credited skip), nothing to attach`
    )
    return
  }

  const supabase = createServiceClient()

  const { data: attachResult, error: attachError } = await supabase.rpc("attach_payment_to_weekly_order", {
    p_stripe_subscription_id: stripeSubscriptionId,
    p_delivery_date: deliveryDate,
    p_stripe_payment_intent_id: paymentIntentId,
    p_stripe_invoice_id: invoice.id,
  })

  if (attachError) {
    console.error(
      `[webhook] Failed to attach payment_intent to order for sub ${sub.id} on ${deliveryDate}:`,
      attachError.message
    )
    return
  }

  const result = attachResult as { error: string | null; order_id?: string | null }
  if (result?.order_id) {
    console.log(
      `[webhook] Attached payment_intent ${paymentIntentId} to order ${result.order_id} (sub ${sub.id}, ${deliveryDate})`
    )
  } else {
    console.log(
      `[webhook] invoice.payment_succeeded: no matching order row found for sub ${sub.id} on ${deliveryDate}`
    )
  }
}