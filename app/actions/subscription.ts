//app/actions/subscription.ts
 
"use server"
 
import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { revalidatePath } from "next/cache"
import {
  computeNextDeliveryDate,
  computeDeliveryDates,
  isSkipLocked,
  isDeliveryDayChangeLocked,
  cutoffUnixForDeliveryDate,
  easternDateStrFromUnix,
} from "@/lib/delivery-utils"
import { PRODUCTS } from "@/lib/products"
import { sendMessage } from "@/app/actions/messages"
import { sendSubscriptionCancelledEmail } from "@/lib/email"
 
/**
 * Base URL for redirects (Stripe billing portal return_url).
 *
 * ⚠️ DEPLOYMENT: this reads NEXT_PUBLIC_APP_URL, which is a DIFFERENT variable
 * from the NEXT_PUBLIC_SITE_URL that app/actions/auth.ts uses. Both must be set
 * in the deployment environment; setting only one leaves the other silently
 * pointing at localhost. (lib/email.ts also reads NEXT_PUBLIC_APP_URL, with its
 * own hardcoded https://modernmilkmaid.store fallback — a third answer to the
 * same question.)
 *
 * This used to fall back to "http://localhost:3000/account" unconditionally
 * (note: port 3000, while auth.ts guessed 4000 — the fallbacks didn't even
 * agree with each other). In production that URL goes to Stripe as the billing
 * portal's return_url, so a missing env var meant customers managing their
 * subscription got dumped on localhost when they clicked "Return to Modern Milk
 * Maid" — with nothing logged and nothing erroring.
 *
 * Now it throws in production rather than handing Stripe a dead link, and keeps
 * the localhost convenience only in dev.
 *
 * NOTE: NEXT_PUBLIC_* values are inlined at BUILD time, so this must be present
 * in the build environment, not just at runtime.
 */
function getAccountUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (typeof appUrl === "string" && appUrl) {
    return `${appUrl.replace(/\/+$/, "")}/account`
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is not set. Refusing to hand Stripe a localhost " +
        "return_url. Set NEXT_PUBLIC_APP_URL in the deployment environment."
    )
  }

  return "http://localhost:3000/account"
}
 
// ---------------------------------------------------------------------------
// Helper: format a Date as YYYY-MM-DD using LOCAL date parts (not UTC).
// ---------------------------------------------------------------------------
function toLocalDateISO(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}
 
// Adds N days to a YYYY-MM-DD date string, returning a new YYYY-MM-DD string.
// Uses noon UTC as the anchor time so DST transitions never shift the
// calendar date during the addition.
function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z")
  d.setUTCDate(d.getUTCDate() + days)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}
 
/**
 * The cutoff (5 PM Eastern the evening before) gating the NEXT delivery on
 * the given day. Used to reschedule Stripe's billing cycle when a customer
 * changes their delivery day — see updateDeliveryDay below.
 *
 * DST-safe: delegates to cutoffUnixForDeliveryDate in lib/delivery-utils.ts,
 * which uses the real America/New_York UTC offset for the given date
 * instead of assuming fixed EST (UTC-5) year-round.
 */
function computeCutoffUnixForNextDelivery(deliveryDay: "thursday" | "friday"): number {
  const nextDelivery = computeNextDeliveryDate(deliveryDay)
  return cutoffUnixForDeliveryDate(nextDelivery)
}
 
// ---------------------------------------------------------------------------
// Change delivery day
//
// ⚠️ Must reschedule Stripe's billing cycle, not just our own delivery_day
// column. Our billing model anchors each subscription's recurring charge to
// a specific weekday (the cutoff) via trial_end (see app/actions/stripe.ts).
// If we only updated Supabase, Stripe would keep charging on the OLD
// weekday forever — silently breaking the "charge, then deliver the next
// day" guarantee for every future week. isDeliveryDayChangeLocked() already
// blocks changes during the Wed 5PM–Fri noon window that covers both
// cutoffs, so whenever this function is actually allowed to run, the
// customer's next pending charge hasn't fired yet and is safe to move by
// the ±1 day gap between Thursday's and Friday's cutoffs — proration is
// disabled since that gap is trivial and nothing needs crediting either way.
// ---------------------------------------------------------------------------
export async function updateDeliveryDay(
  subscriptionId: string,
  deliveryDay: "thursday" | "friday"
): Promise<{ error: string | null; nextDeliveryDate: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { error: "Not authenticated", nextDeliveryDate: null }
 
    // Reject if we're in the Wednesday 5 PM – Friday noon lock window
    if (isDeliveryDayChangeLocked()) {
      return {
        error: "Delivery day changes are locked from Wednesday at 5 PM until Friday at noon. Please try again after Friday noon.",
        nextDeliveryDate: null,
      }
    }
 
    // Fetch current state, including the Stripe subscription id — required
    // to reschedule the billing cycle below.
    const { data: sub, error: fetchError } = await supabase
      .from("subscriptions")
      .select("skipped_dates, stripe_subscription_id, delivery_day")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single()
 
    if (fetchError || !sub) return { error: "Subscription not found", nextDeliveryDate: null }
 
    const nextDeliveryDate = computeNextDeliveryDate(deliveryDay)
 
    // Compute the upcoming dates for the new delivery day
    const newDeliveryDates = computeDeliveryDates(deliveryDay)
 
    // Filter skipped_dates — remove any skips that no longer align with the new delivery day
    const skippedDates: string[] = Array.isArray(sub?.skipped_dates) ? sub.skipped_dates : []
    const newSkippedDates = skippedDates.filter((d) => newDeliveryDates.includes(d))
 
    // ── Reschedule Stripe's billing cycle to the new cutoff ─────────────────
    // Skipped entirely if the day isn't actually changing (avoids a pointless
    // trial_end update on a no-op resubmit). If the Stripe call fails, we
    // deliberately do NOT touch Supabase's delivery_day — better to leave
    // the change blocked than let Supabase and Stripe disagree about which
    // day is real.
    let newPeriodEnd: string | null = null
 
    if (sub.stripe_subscription_id && sub.delivery_day !== deliveryDay) {
      const newCutoffUnix = computeCutoffUnixForNextDelivery(deliveryDay)
      try {
        const updated = (await stripe.subscriptions.update(sub.stripe_subscription_id, {
          trial_end: newCutoffUnix,
          proration_behavior: "none",
        })) as unknown as { items: { data: { current_period_end: number }[] } }
 
        const periodEndUnix = updated.items?.data?.[0]?.current_period_end
        newPeriodEnd = new Date((periodEndUnix ?? newCutoffUnix) * 1000).toISOString()
      } catch (e) {
        console.error("Failed to reschedule Stripe billing cycle for delivery day change:", e)
        return {
          error: "We couldn't update your billing schedule for the new delivery day. Please contact us so we can fix this manually.",
          nextDeliveryDate: null,
        }
      }
    }
 
    const { error } = await supabase
      .from("subscriptions")
      .update({
        delivery_day: deliveryDay,
        skipped_dates: newSkippedDates,
        ...(newPeriodEnd ? { current_period_end: newPeriodEnd } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
 
    if (error) return { error: error.message, nextDeliveryDate: null }
 
    // Best-effort cleanup: if a weekly order row was already pre-created
    // under the OLD delivery day (via the invoice.upcoming webhook, which
    // can fire a few days before the cutoff — i.e. potentially before this
    // change was made), it's now stale: it'll never be delivered on that
    // date since the underlying Stripe charge was just moved. Cancel any
    // such future, not-yet-fulfilled order rather than leaving it sitting
    // in the delivery/admin views with a date that's no longer real.
    // Failure here is logged but never blocks the actual day change above.
    try {
      const todayISO = toLocalDateISO(new Date())
      await supabase
        .from("orders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("subscription_id", subscriptionId)
        .in("status", ["confirmed", "skipped"])
        .gte("delivery_date", todayISO)
        .not("delivery_date", "in", `(${newDeliveryDates.map((d) => `"${d}"`).join(",")})`)
    } catch (cleanupError) {
      console.error("Non-blocking: failed to clean up stale pre-created order after delivery day change:", cleanupError)
    }
 
    revalidatePath("/account")
    return { error: null, nextDeliveryDate }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update delivery day", nextDeliveryDate: null }
  }
}
 
// ---------------------------------------------------------------------------
// Skip a weekly delivery (self-service, before the 5 PM EST cutoff)
//
// Adds a delivery date to the subscription's skipped_dates array.
// No Stripe interaction needed — weekly billing means no charge = no delivery.
// The delivery tab already filters out skipped dates from the delivery list.
// ---------------------------------------------------------------------------
export async function skipWeeklyDelivery(
  subscriptionId: string,
  deliveryDate: string // YYYY-MM-DD
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { error: "Not authenticated" }
 
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("id, status, delivery_day, skipped_dates")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single()
 
    if (subError || !sub) return { error: "Subscription not found" }
    if (sub.status !== "active") return { error: "Only active subscriptions can have deliveries skipped." }
 
    const deliveryDay = sub.delivery_day as "thursday" | "friday"
 
    // Validate deliveryDate is actually an upcoming delivery date for this subscription
    const upcomingDates = computeDeliveryDates(deliveryDay, 12)
    if (!upcomingDates.includes(deliveryDate)) {
      return { error: "That date is not a valid upcoming delivery date for this subscription." }
    }
 
    // Check cutoff — 5 PM EST the evening before delivery — only applies to the
    // immediate next delivery date, not future ones.
    const isNextDelivery = upcomingDates[0] === deliveryDate
    if (isNextDelivery && isSkipLocked(deliveryDay)) {
      return { error: "The skip window for this delivery has closed (cutoff: 5 PM the evening before delivery). Please contact us if you need help." }
    }
 
    const currentSkipped: string[] = Array.isArray(sub.skipped_dates) ? sub.skipped_dates : []
 
    if (currentSkipped.includes(deliveryDate)) {
      return { error: null } // Already skipped — idempotent
    }
 
    const newSkipped = [...currentSkipped, deliveryDate].sort()
 
    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({
        skipped_dates: newSkipped,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
 
    if (updateError) return { error: updateError.message }
 
    revalidatePath("/account")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to skip delivery" }
  }
}
 
// ---------------------------------------------------------------------------
// Unskip a weekly delivery (undo a skip, before the 5 PM EST cutoff)
//
// Removes a delivery date from the subscription's skipped_dates array.
// ---------------------------------------------------------------------------
export async function unskipWeeklyDelivery(
  subscriptionId: string,
  deliveryDate: string // YYYY-MM-DD
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { error: "Not authenticated" }
 
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("id, status, delivery_day, skipped_dates")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single()
 
    if (subError || !sub) return { error: "Subscription not found" }
 
    const deliveryDay = sub.delivery_day as "thursday" | "friday"
 
    // Can't unskip after cutoff either — but only applies to the immediate next delivery.
    const upcomingForUnskip = computeDeliveryDates(deliveryDay, 12)
    const isNextDeliveryUnskip = upcomingForUnskip[0] === deliveryDate
    if (isNextDeliveryUnskip && isSkipLocked(deliveryDay)) {
      return { error: "The cutoff has passed for this delivery — the skip can no longer be changed. Please contact us if you need help." }
    }
 
    const currentSkipped: string[] = Array.isArray(sub.skipped_dates) ? sub.skipped_dates : []
    const newSkipped = currentSkipped.filter((d) => d !== deliveryDate)
 
    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({
        skipped_dates: newSkipped,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
 
    if (updateError) return { error: updateError.message }
 
    revalidatePath("/account")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to unskip delivery" }
  }
}
 
/**
 * The cutoff (5 PM Eastern the evening before) for a specific delivery date —
 * used by cancelSubscriptionAtPeriodEnd to determine whether an
 * already-charged upcoming delivery is still refundable or already locked in.
 *
 * DST-safe: delegates to cutoffUnixForDeliveryDate in lib/delivery-utils.ts.
 */
function cutoffUnixForDelivery(deliveryDateStr: string): number {
  return cutoffUnixForDeliveryDate(deliveryDateStr)
}
 
// ---------------------------------------------------------------------------
// Cancel subscription
//
// ⚠️ Session 14 rewrite. Under our billing model, the customer is charged
// for a delivery either at signup (week 1) or at their weekly cutoff (every
// week after) — well before the cutoff has any bearing on whether that
// specific charge should be considered "final." The OLD version of this
// function used Stripe's current_period_end (the NEXT charge's cutoff,
// auto-advanced weekly by the webhook) and searched BACKWARD from it for a
// delivery weekday — but under this model the delivery is always the day
// AFTER its cutoff, never on/before it, so that search pointed the wrong
// direction and could surface a date days in the past.
//
// The correct question isn't "what does Stripe's period math say" — it's
// simply: is there an upcoming, already-charged delivery for this
// subscription whose OWN cutoff (5 PM the evening before ITS delivery date)
// has already passed?
// - If yes: that delivery is locked in — stop future charges
//   (cancel_at_period_end), let this one ship as the final delivery.
// - If no (cutoff hasn't passed yet, or nothing's been charged for an
//   upcoming delivery at all): refund that charge if one exists, cancel the
//   Stripe subscription immediately (not "at period end" — there's nothing
//   left to run out), and nothing further ships or is owed.
//
// This directly answers "cancel before 5 PM the evening before your
// delivery day and you're refunded, cancel after and that delivery still
// comes" — the same policy already used for skips, now applied
// consistently to cancellation regardless of when the charge happened to
// land (signup or a later cutoff).
// ---------------------------------------------------------------------------
// Given a delivery date that would otherwise anchor the reactivate deadline,
// push it out one extra week if it falls TOMORROW relative to today (ET).
// That situation means today IS that delivery's cutoff day, hours before the
// cutoff hour — a deadline of "today" isn't a meaningful reactivate window,
// so give the customer a full extra cycle instead. Used by every branch of
// cancelSubscriptionAtPeriodEnd (charged-and-refunded, locked-in-final, and
// nothing-charged-yet) so this same-day case is handled consistently no
// matter which cutoff branch a given cancellation falls into.
function resolveDeadlineDeliveryDate(baseDeliveryDate: string, nowET: string): string {
  const isTomorrow = addDaysToDateStr(nowET, 1) === baseDeliveryDate
  return isTomorrow ? addDaysToDateStr(baseDeliveryDate, 7) : baseDeliveryDate
}
 
export async function cancelSubscriptionAtPeriodEnd(
  subscriptionId: string
): Promise<{ error: string | null; finalDeliveryDate: string | null; refunded: boolean }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { error: "Not authenticated", finalDeliveryDate: null, refunded: false }
    }
 
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, delivery_day")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single()
 
    if (subError || !sub) {
      return { error: "Subscription not found", finalDeliveryDate: null, refunded: false }
    }
 
    // If stripe_subscription_id is missing, look it up from Stripe using the customer ID.
    if (!sub.stripe_subscription_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", user.id)
        .single()
 
      if (profile?.stripe_customer_id) {
        const list = await stripe.subscriptions.list({
          customer: profile.stripe_customer_id,
          status: "active",
          limit: 1,
        })
        if (list.data.length > 0) {
          const found = list.data[0].id
          await supabase
            .from("subscriptions")
            .update({ stripe_subscription_id: found, updated_at: new Date().toISOString() })
            .eq("id", subscriptionId)
            .eq("user_id", user.id)
          sub.stripe_subscription_id = found
        }
      }
    }
 
    // Find the nearest upcoming, already-charged delivery — the ONLY
    // delivery that could possibly still be "pending" (charged but not yet
    // shipped). Anything earlier already happened; anything later hasn't
    // been charged yet and needs nothing from us.
    const todayISO = toLocalDateISO(new Date())
    const { data: pendingOrder } = await supabase
      .from("orders")
      .select("id, delivery_date, stripe_payment_intent_id, total")
      .eq("subscription_id", subscriptionId)
      .eq("user_id", user.id)
      .neq("status", "cancelled")
      .not("stripe_payment_intent_id", "is", null)
      .gte("delivery_date", todayISO)
      .order("delivery_date", { ascending: true })
      .limit(1)
      .maybeSingle()
 
    let finalDeliveryDate: string | null = null
    let refunded = false
    let refundAmountCents: number | null = null
    // Unix timestamp of the moment the subscription will actually terminate
    // and the customer's "reactivate before" window closes. Computed by us
    // directly from the business cutoff rules — not read from Stripe's
    // internal period_end, which we've seen can be stale/misleading
    // immediately after a subscription is created.
    let reactivateDeadlineUnix: number | null = null
    const nowET = easternDateStrFromUnix(Math.floor(Date.now() / 1000))
    const deliveryDay = sub.delivery_day as "thursday" | "friday"
 
    if (pendingOrder) {
      const cutoffUnix = cutoffUnixForDelivery(pendingOrder.delivery_date)
      const nowUnix = Math.floor(Date.now() / 1000)
 
      if (nowUnix < cutoffUnix) {
        // Cutoff hasn't passed yet — refund this charge and schedule the
        // subscription to terminate at the deadline computed below. Nothing
        // further is owed unless the customer reactivates first.
        if (pendingOrder.stripe_payment_intent_id) {
          try {
            const refund = await stripe.refunds.create({
              payment_intent: pendingOrder.stripe_payment_intent_id,
              reason: "requested_by_customer",
            })
 
            await supabase
              .from("orders")
              .update({
                status: "cancelled",
                stripe_refund_id: refund.id,
                refund_amount_cents: refund.amount,
                updated_at: new Date().toISOString(),
              })
              .eq("id", pendingOrder.id)
 
            refunded = true
            refundAmountCents = refund.amount
          } catch (refundErr) {
            console.error("Failed to refund pending delivery on cancel:", refundErr)
            // Fall through — still cancel the subscription even if the
            // refund call itself failed; this needs manual follow-up.
          }
        }
 
        // Deadline is normally this delivery's own cutoff — the moment this
        // refunded charge would otherwise have locked in for good. The
        // shared helper pushes it out a week if today IS that cutoff day.
        const deadlineDeliveryDate = resolveDeadlineDeliveryDate(pendingOrder.delivery_date, nowET)
        reactivateDeadlineUnix = cutoffUnixForDeliveryDate(deadlineDeliveryDate)
 
        if (sub.stripe_subscription_id) {
          try {
            await stripe.subscriptions.update(sub.stripe_subscription_id, {
              cancel_at: reactivateDeadlineUnix,
            })
          } catch (cancelErr) {
            console.error("Failed to schedule subscription cancellation after refund:", cancelErr)
          }
        }
 
        finalDeliveryDate = null
      } else {
        // Cutoff already passed — this delivery is locked in. Stop future
        // charges but let this one ship as the final delivery. Deadline is
        // the cutoff of the delivery AFTER this one (the next charge that
        // would otherwise have occurred).
        const deadlineDeliveryDate = addDaysToDateStr(pendingOrder.delivery_date, 7)
        reactivateDeadlineUnix = cutoffUnixForDeliveryDate(deadlineDeliveryDate)
 
        if (sub.stripe_subscription_id) {
          await stripe.subscriptions.update(sub.stripe_subscription_id, {
            cancel_at: reactivateDeadlineUnix,
          })
        }
        finalDeliveryDate = pendingOrder.delivery_date
      }
    } else if (sub.stripe_subscription_id) {
      // No pending paid delivery at all (mid-cycle, next charge hasn't
      // happened yet — e.g. a returning week-N subscriber cancelling days
      // before their delivery, before that delivery's charge has fired).
      // Nothing to refund. Deadline is the cutoff of the next not-yet-
      // charged delivery — same shared helper, since this can equally land
      // on "today IS the cutoff day" if they cancel hours before their own
      // charge would have fired.
      const nextDelivery = computeNextDeliveryDate(deliveryDay)
      const deadlineDeliveryDate = resolveDeadlineDeliveryDate(nextDelivery, nowET)
      reactivateDeadlineUnix = cutoffUnixForDeliveryDate(deadlineDeliveryDate)
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at: reactivateDeadlineUnix,
      })
    }
 
    await supabase
      .from("subscriptions")
      .update({
        // cancel_at_period_end is our own row's "cancellation is scheduled"
        // flag for the UI — it stays true regardless of which cutoff branch
        // fired above. The actual Stripe-side termination is now driven by
        // the explicit cancel_at timestamp set per-branch, not by Stripe's
        // own period boundary. status stays "active" until the
        // customer.subscription.deleted webhook flips it to "cancelled" once
        // that deadline arrives. final_delivery_date distinguishes the UI
        // copy: null = refunded (no delivery this week); set = a paid
        // delivery still ships. current_period_end now stores our
        // deterministic reactivate deadline directly, so the banner shows
        // the correct date immediately with no client-side Stripe sync
        // needed.
        cancel_at_period_end: true,
        final_delivery_date: finalDeliveryDate,
        current_period_end: reactivateDeadlineUnix
          ? new Date(reactivateDeadlineUnix * 1000).toISOString()
          : undefined,
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
 
    // Best-effort cleanup: cancel any OTHER future, not-yet-delivered order
    // for this subscription beyond the one we just resolved — e.g. a
    // preview order pre-created by invoice.upcoming for a delivery that
    // will now never be charged.
    try {
      let cleanupQuery = supabase
        .from("orders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("subscription_id", subscriptionId)
        .neq("status", "cancelled")
        .gte("delivery_date", todayISO)
 
      if (finalDeliveryDate) {
        cleanupQuery = cleanupQuery.neq("delivery_date", finalDeliveryDate)
      }
      await cleanupQuery
    } catch (cleanupError) {
      console.error("Non-blocking: failed to clean up future orders after cancel:", cleanupError)
    }
 
    // Best-effort confirmation email — a failure here shouldn't fail the
    // cancellation itself, since it's already been fully processed above.
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("id", user.id)
        .single()

      const customerEmail = profile?.email ?? user.email ?? null
      if (customerEmail) {
        const customerName =
          [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
          profile?.email ||
          user.email ||
          "there"

        const finalDeliveryDateLabel = finalDeliveryDate
          ? new Date(finalDeliveryDate + "T12:00:00").toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })
          : null

        await sendSubscriptionCancelledEmail({
          customerEmail,
          customerName,
          refunded,
          refundAmountCents,
          finalDeliveryDateLabel,
        })
      }
    } catch (emailErr) {
      console.error("[cancelSubscriptionAtPeriodEnd] Failed to send cancellation confirmation email:", emailErr)
    }

    await sendMessage({
      type: "cancel_request",
      body: refunded
        ? `Customer cancelled their subscription before their delivery cutoff. Refunded $${((pendingOrder?.total ?? 0) / 100).toFixed(2)} and ended the subscription immediately.`
        : `Customer cancelled their subscription. Final delivery date: ${finalDeliveryDate || "none — no further deliveries"}.`,
      subscriptionId,
    })
 
    revalidatePath("/account")
    return { error: null, finalDeliveryDate, refunded }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to cancel subscription",
      finalDeliveryDate: null,
      refunded: false,
    }
  }
}
 
// ---------------------------------------------------------------------------
// Create Stripe Customer Portal session
// ---------------------------------------------------------------------------
export async function createBillingPortalSession(
  subscriptionId: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { url: null, error: "Not authenticated" }
 
    // Verify the subscription belongs to this user
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single()
 
    if (subError || !sub) return { url: null, error: "Subscription not found" }
 
    // stripe_customer_id lives on the profile, not the subscription
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single()
    const stripeCustomerId = profile?.stripe_customer_id
 
    if (!stripeCustomerId) {
      return { url: null, error: "No billing account found. Please contact support." }
    }
 
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: getAccountUrl(),
    })
 
    return { url: session.url, error: null }
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : "Failed to create billing portal session" }
  }
}
 
// ---------------------------------------------------------------------------
// Reactivate subscription (undo cancel_at_period_end)
// ---------------------------------------------------------------------------
export async function reactivateSubscription(
  subscriptionId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { error: "Not authenticated" }
 
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, cancel_at_period_end")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single()
 
    if (subError || !sub) return { error: "Subscription not found" }
 
    if (sub.stripe_subscription_id) {
      // Cancellation was scheduled via the explicit `cancel_at` timestamp
      // (see cancelSubscriptionAtPeriodEnd), not `cancel_at_period_end` — so
      // undoing it means clearing `cancel_at`, not toggling that flag.
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at: null,
      })
    }
 
    const { error } = await supabase
      .from("subscriptions")
      .update({
        cancel_at_period_end: false,
        final_delivery_date: null,
        current_period_end: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
 
    if (error) return { error: error.message }
 
    revalidatePath("/account")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to reactivate subscription" }
  }
}
 
// ---------------------------------------------------------------------------
// Swap subscription milk type
// ---------------------------------------------------------------------------
export async function swapSubscriptionMilk(
  subscriptionId: string,
  itemId: string,
  newProductId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { error: "Not authenticated" }
 
    // Verify subscription belongs to user
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("id, delivery_day, status")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single()
 
    if (subError || !sub) return { error: "Subscription not found" }
    if (sub.status !== "active") return { error: "Subscription is not active" }
 
    // Check milk-change lock (same 5 PM EST cutoff)
    const deliveryDay = sub.delivery_day as "thursday" | "friday"
    if (isSkipLocked(deliveryDay)) {
      return { error: "Milk type changes are locked from 5 PM the evening before delivery until noon on delivery day." }
    }
 
    // Look up the new product
    const newProduct = PRODUCTS.find((p) => p.id === newProductId)
    if (!newProduct) return { error: "Product not found" }
 
    const { error: updateError } = await supabase
      .from("subscription_items")
      .update({
        product_id: newProduct.id,
        product_name: newProduct.name,
        size: newProduct.size,
        price_cents: newProduct.subscriptionPriceInCents,
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .eq("subscription_id", subscriptionId)
 
    if (updateError) return { error: updateError.message }
 
    revalidatePath("/account")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to swap milk type" }
  }
}
 
// ---------------------------------------------------------------------------
// Backfill current_period_end from Stripe
// ---------------------------------------------------------------------------
export async function syncPeriodEndFromStripe(
  subscriptionId: string
): Promise<{ current_period_end: string | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { current_period_end: null, error: "Not authenticated" }
 
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, current_period_end")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single()
 
    if (subError || !sub) return { current_period_end: null, error: "Subscription not found" }
 
    if (sub.current_period_end) return { current_period_end: sub.current_period_end, error: null }
 
    if (!sub.stripe_subscription_id) return { current_period_end: null, error: null }
 
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id) as unknown as { items: { data: { current_period_end: number }[] } }
    const periodEndUnix = stripeSub.items?.data?.[0]?.current_period_end
 
    if (!periodEndUnix) return { current_period_end: null, error: null }
 
    const periodEndISO = new Date(periodEndUnix * 1000).toISOString()
 
    await supabase
      .from("subscriptions")
      .update({ current_period_end: periodEndISO, updated_at: new Date().toISOString() })
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
 
    revalidatePath("/account")
    return { current_period_end: periodEndISO, error: null }
  } catch (e) {
    return {
      current_period_end: null,
      error: e instanceof Error ? e.message : "Failed to sync period end",
    }
  }
}