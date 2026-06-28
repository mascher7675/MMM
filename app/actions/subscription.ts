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
      .select("skipped_dates")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single()

    const nextDeliveryDate = computeNextDeliveryDate(deliveryDay)

    // Compute the upcoming dates for the new delivery day
    const newDeliveryDates = computeDeliveryDates(deliveryDay)

    // Filter skipped_dates — remove any skips that no longer align with the new delivery day
    const skippedDates: string[] = Array.isArray(sub?.skipped_dates) ? sub.skipped_dates : []
    const newSkippedDates = skippedDates.filter((d) => newDeliveryDates.includes(d))

    const { error } = await supabase
      .from("subscriptions")
      .update({
        delivery_day: deliveryDay,
        skipped_dates: newSkippedDates,
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
      // For weekly billing, cancel_at_period_end = true means the subscription
      // cancels at the end of the CURRENT week's billing cycle (7 days from last charge).
      const stripeSub = await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      }) as unknown as { items: { data: { current_period_end: number }[] } }

      const periodEndUnix = stripeSub.items?.data?.[0]?.current_period_end
      const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null

      if (periodEnd) {
        finalDeliveryDate = getLastDeliveryBefore(periodEnd, sub.delivery_day)
      }

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
      .select("stripe_subscription_id, stripe_customer_id")
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .single()

    if (subError || !sub) return { url: null, error: "Subscription not found" }

    // Try to get customer ID from subscription, then fall back to profile
    let stripeCustomerId = sub.stripe_customer_id

    if (!stripeCustomerId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", user.id)
        .single()
      stripeCustomerId = profile?.stripe_customer_id
    }

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
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: false,
      })
    }

    const { error } = await supabase
      .from("subscriptions")
      .update({
        cancel_at_period_end: false,
        final_delivery_date: null,
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