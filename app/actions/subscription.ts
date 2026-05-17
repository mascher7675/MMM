//app/actions/subscription.ts

"use server"

import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { revalidatePath } from "next/cache"
import {
  computeNextDeliveryDate,
  computeDeliveryDates,
  recomputeDeliveryDatesOnDayChange,
  isDeliveryDayLocked,
  isDeliveryDayChangeLocked,
} from "@/lib/delivery-utils"
import { PRODUCTS } from "@/lib/products"
import { sendMessage } from "@/app/actions/messages"

// Base URL for redirects (Stripe billing portal return_url)
function getAccountUrl(): string {
  if (typeof process.env.NEXT_PUBLIC_APP_URL === "string" && process.env.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL}/account`
  }
  return "http://localhost:3000/account"
}

// ---------------------------------------------------------------------------
// Helper: format a Date as YYYY-MM-DD using LOCAL date parts (not UTC).
// Using toISOString() would shift midnight-local dates back one day in UTC.
// ---------------------------------------------------------------------------
function toLocalDateISO(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

// ---------------------------------------------------------------------------
// Change delivery day
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

    // Fetch the current delivery_dates so we can preserve past deliveries
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("delivery_dates")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single()

    // Compute server-side so it's immune to browser clock / timezone drift
    const nextDeliveryDate = computeNextDeliveryDate(deliveryDay)

    // Recompute delivery dates: keep already-past dates, shift future ones to new day
    const existingDates: string[] = Array.isArray(sub?.delivery_dates) ? sub.delivery_dates : []
    const newDeliveryDates = existingDates.length > 0
      ? recomputeDeliveryDatesOnDayChange(existingDates, deliveryDay)
      : computeDeliveryDates(deliveryDay)

    const { error } = await supabase
      .from("subscriptions")
      .update({
        delivery_day: deliveryDay,
        next_delivery_date: nextDeliveryDate,
        delivery_dates: newDeliveryDates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)
      .eq("user_id", user.id)

    if (error) return { error: error.message, nextDeliveryDate: null }

    revalidatePath("/account")
    return { error: null, nextDeliveryDate }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update delivery day", nextDeliveryDate: null }
  }
}

// ---------------------------------------------------------------------------
// Cancel subscription at period end
// ---------------------------------------------------------------------------
export async function cancelSubscriptionAtPeriodEnd(
  subscriptionId: string
): Promise<{ error: string | null; finalDeliveryDate: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { error: "Not authenticated", finalDeliveryDate: null }
    }

    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, delivery_day")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single()

    if (subError || !sub) {
      return { error: "Subscription not found", finalDeliveryDate: null }
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

    let finalDeliveryDate: string | null = null

    if (sub.stripe_subscription_id) {
      const stripeSub = await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      }) as unknown as { items: { data: { current_period_end: number }[] } }

      // Stripe API 2026-02-25.clover moved current_period_end to subscription item
      const periodEndUnix = stripeSub.items?.data?.[0]?.current_period_end

      const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null

      if (periodEnd) {
        finalDeliveryDate = getLastDeliveryBefore(periodEnd, sub.delivery_day)
      }

      // Always write cancel_at_period_end to Supabase — even if periodEndUnix
      // is missing. Previously this update was gated inside the periodEndUnix
      // check, so Stripe got updated but the DB did not, leaving the UI stale.
      const finalDeliveryDateISO = periodEnd
        ? getLastDeliveryDateISO(periodEnd, sub.delivery_day)
        : null

      await supabase
        .from("subscriptions")
        .update({
          cancel_at_period_end: true,
          current_period_end: periodEnd ? periodEnd.toISOString() : null,
          final_delivery_date: finalDeliveryDateISO,
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscriptionId)
        .eq("user_id", user.id)
    } else {
      // No Stripe subscription — still mark cancelled in DB so the UI reflects it
      await supabase
        .from("subscriptions")
        .update({
          cancel_at_period_end: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscriptionId)
        .eq("user_id", user.id)
    }

    await sendMessage({
      type: "cancel_request",
      body: `Customer cancelled their subscription. Final delivery date: ${
        finalDeliveryDate || "unknown"
      }.`,
      subscriptionId,
    })

    revalidatePath("/account")
    return { error: null, finalDeliveryDate }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to cancel subscription",
      finalDeliveryDate: null,
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
      .select("id")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single()

    if (subError || !sub) {
      return { url: null, error: "Subscription not found" }
    }

    // stripe_customer_id lives on profiles, not subscriptions
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile?.stripe_customer_id) {
      return { url: null, error: "No billing account found. Please contact support." }
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: getAccountUrl(),
    })

    return { url: session.url, error: null }
  } catch (e) {
    return {
      url: null,
      error: e instanceof Error ? e.message : "Failed to open billing portal",
    }
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
      .select("stripe_subscription_id")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single()

    if (subError || !sub) return { error: "Subscription not found" }

    if (sub.stripe_subscription_id) {
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: false,
      })
    }

    await supabase
      .from("subscriptions")
      .update({
        cancel_at_period_end: false,
        current_period_end: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)
      .eq("user_id", user.id)

    revalidatePath("/account")
    return { error: null }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to reactivate subscription",
    }
  }
}

// ---------------------------------------------------------------------------
// Swap the milk type on a subscription item
// ---------------------------------------------------------------------------
export async function swapSubscriptionMilk(
  subscriptionId: string,
  subscriptionItemId: string,
  newMilkType: "oat" | "almond" | "hemp"
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { error: "Not authenticated" }

    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single()

    if (subError || !sub) return { error: "Subscription not found" }

    const { data: currentItem, error: itemError } = await supabase
      .from("subscription_items")
      .select("id, size, product_id")
      .eq("id", subscriptionItemId)
      .eq("subscription_id", subscriptionId)
      .single()

    if (itemError || !currentItem) return { error: "Subscription item not found" }

    const newProduct = PRODUCTS.find(
      (p) => p.milkType === newMilkType && p.size === currentItem.size
    )

    if (!newProduct) return { error: "Product not found for selected milk type and size" }

    if (currentItem.product_id === newProduct.id) {
      return { error: null }
    }

    const { error: updateError } = await supabase
      .from("subscription_items")
      .update({
        product_id: newProduct.id,
        product_name: newProduct.name,
        price_cents: newProduct.subscriptionPriceInCents,
      })
      .eq("id", subscriptionItemId)
      .eq("subscription_id", subscriptionId)

    if (updateError) return { error: updateError.message }

    revalidatePath("/account")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to swap milk type" }
  }
}

// ---------------------------------------------------------------------------
// Request a subscription pause
//
// The customer picks which of their upcoming scheduled delivery dates they
// want to skip. We store the request in Supabase and notify the admin.
// Stripe is NOT touched here — the admin approves and triggers Stripe.
//
// skipDates: array of YYYY-MM-DD strings from the subscription's delivery_dates
// note: optional reason (e.g. "Going on vacation")
// ---------------------------------------------------------------------------
export async function requestSubscriptionPause(
  subscriptionId: string,
  skipDates: string[],  // YYYY-MM-DD strings — must be a subset of delivery_dates
  note: string
): Promise<{ error: string | null }> {
  try {
    if (!skipDates || skipDates.length === 0) {
      return { error: "Please select at least one delivery date to skip." }
    }

    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { error: "Not authenticated" }

    // Verify subscription belongs to this user and fetch delivery_dates
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("id, status, pause_status, delivery_dates, delivery_day")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single()

    if (subError || !sub) return { error: "Subscription not found" }

    if (sub.status !== "active") {
      return { error: "Only active subscriptions can be paused." }
    }

    if (sub.pause_status === "pending") {
      return { error: "You already have a pending pause request. Please wait for it to be reviewed." }
    }

    if (sub.pause_status === "approved") {
      return { error: "Your subscription is already paused." }
    }

    // Validate that all requested skip dates are actually in the delivery_dates array
    const scheduledDates: string[] = (sub.delivery_dates ?? []).map((d: string) =>
      // delivery_dates may come back as plain date strings or with time — normalise
      d.length > 10 ? d.slice(0, 10) : d
    )

    const today = toLocalDateISO(new Date())
    const futureScheduled = scheduledDates.filter((d) => d >= today)

    const invalidDates = skipDates.filter((d) => !futureScheduled.includes(d))
    if (invalidDates.length > 0) {
      return { error: "One or more selected dates are not valid upcoming delivery dates." }
    }

    // Compute the pause window from the earliest to latest skip date
    const sorted = [...skipDates].sort()
    const pauseFrom = sorted[0]
    const pauseUntil = sorted[sorted.length - 1]

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({
        pause_status: "pending",
        pause_requested_from: pauseFrom,
        pause_requested_until: pauseUntil,
        pause_skip_dates: skipDates,
        pause_note: note.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)
      .eq("user_id", user.id)

    if (updateError) return { error: updateError.message }

    // Resolve any previous pause_request messages for this subscription
    // so re-submissions don't leave stale entries in the admin inbox.
    await supabase
      .from("messages")
      .update({ status: "resolved", updated_at: new Date().toISOString() })
      .eq("subscription_id", subscriptionId)
      .eq("type", "pause_request")
      .in("status", ["unread", "read"])

    // Build a clear message for the admin
    // Format as "Jun 12" — weekday is redundant since it's always the same
    // delivery day (Thu or Fri) for every date in the subscription.
    const dateList = sorted
      .map((d) => {
        const parsed = new Date(d + "T12:00:00")
        return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      })
      .join(", ")

    // Format delivery day nicely for the message (e.g. "Thursdays")
    const dayLabel = sub.delivery_day
      ? sub.delivery_day.charAt(0).toUpperCase() + sub.delivery_day.slice(1) + "s"
      : ""

    const messageBody = [
      `Requested skip${skipDates.length > 1 ? "s" : ""} (${dayLabel}): ${dateList}`,
      note.trim() ? `Reason: ${note.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n")

    await sendMessage({
      type: "pause_request",
      body: messageBody,
      subscriptionId,
    })

    revalidatePath("/account")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to submit pause request" }
  }
}

// ---------------------------------------------------------------------------
// Cancel a pending pause request (customer changes their mind before approval)
// Also resolves the associated message so stale requests don't clog the inbox.
// ---------------------------------------------------------------------------
export async function cancelPauseRequest(
  subscriptionId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { error: "Not authenticated" }

    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("id, pause_status")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single()

    if (subError || !sub) return { error: "Subscription not found" }

    if (sub.pause_status !== "pending") {
      return { error: "No pending pause request to cancel." }
    }

    // Clear pause fields on the subscription
    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({
        pause_status: "none",
        pause_requested_from: null,
        pause_requested_until: null,
        pause_skip_dates: null,
        pause_note: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)
      .eq("user_id", user.id)

    if (updateError) return { error: updateError.message }

    // Resolve any unread/read pause_request messages for this subscription
    // so stale requests don't sit in the admin inbox when the customer
    // changes their mind or re-submits with different dates.
    await supabase
      .from("messages")
      .update({ status: "resolved", updated_at: new Date().toISOString() })
      .eq("subscription_id", subscriptionId)
      .eq("type", "pause_request")
      .in("status", ["unread", "read"])

    revalidatePath("/account")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to cancel pause request" }
  }
}

// ---------------------------------------------------------------------------
// Helper: returns ISO date string (YYYY-MM-DD) of the last delivery weekday
// on or before `before`. Saved to DB as final_delivery_date on cancel.
// ---------------------------------------------------------------------------
function getLastDeliveryDateISO(before: Date, deliveryDay: string): string | null {
  const targetDayNum = deliveryDay === "friday" ? 5 : 4
  const d = new Date(before)
  for (let i = 0; i < 7; i++) {
    if (d.getDay() === targetDayNum) {
      return toLocalDateISO(d)
    }
    d.setDate(d.getDate() - 1)
  }
  return null
}

// ---------------------------------------------------------------------------
// Helper: find the last delivery date on a given weekday before a cutoff.
// Returns a human-readable string for display purposes.
// ---------------------------------------------------------------------------
function getLastDeliveryBefore(before: Date, deliveryDay: string): string {
  const targetDayNum = deliveryDay === "friday" ? 5 : 4
  const d = new Date(before)

  for (let i = 0; i < 7; i++) {
    if (d.getDay() === targetDayNum) {
      return d.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    }
    d.setDate(d.getDate() - 1)
  }

  return before.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
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