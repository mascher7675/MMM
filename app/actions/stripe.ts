//app/actions/stripe.ts

"use server"

import Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { PRODUCTS } from "@/lib/products"
import { createClient } from "@/lib/supabase/server"
import { sendOrderConfirmationEmail } from "@/lib/email"
import { computeNextDeliveryDate, cutoffUnixForDeliveryDate } from "@/lib/delivery-utils"

interface CartItem {
  productId: string
  quantity: number
  isSubscription: boolean
}

// ---------------------------------------------------------------------------
// Billing model — FINAL (locked Session 11, payment-resolution fix Session 12):
// "pay for week 1 today, renew at your cutoff" — the same customer
// experience as Factor/HelloFresh.
//
// 1. Checkout is a completely normal subscription checkout: the customer is
//    charged the FULL weekly price today (real price on the checkout page,
//    no $0). This payment covers their first delivery.
// 2. Immediately after checkout succeeds, we make ONE server-side update to
//    the subscription: `trial_end` = the cutoff before their SECOND delivery,
//    with `proration_behavior: "none"`. This is Stripe's own documented
//    method for rescheduling a subscription's billing date
//    (docs.stripe.com/billing/subscriptions/billing-cycle — "Change the
//    billing period using a trial period").
// 3. From then on, Stripe automatically charges the full weekly amount at
//    the customer's cutoff (Wednesday 5 PM Eastern for Thursday customers,
//    Thursday 5 PM Eastern for Friday customers — DST-safe, see
//    delivery-utils.ts), each charge paying for the
//    delivery that goes out the next day. The webhook handlers in
//    app/api/stripe/webhook/route.ts take it from there.
//
// ⚠️ ORDERING MATTERS (Session 12 bug fix): the trial_end update generates a
// $0 `subscription_update` invoice, which becomes the subscription's
// latest_invoice. The first-week payment must therefore be resolved from
// the SIGNUP invoice specifically — via session.invoice — and BEFORE the
// reschedule, never from latest_invoice afterward (that's how we ended up
// with a null payment intent on the first live test).
//
// Net guarantee: money always precedes milk. Skip/cancel before your
// cutoff = no charge, no delivery. After the cutoff = charged, and the
// paid delivery still goes out.
// ---------------------------------------------------------------------------

/**
 * The cutoff gating the customer's SECOND delivery — where the first renewal
 * charge should land. First delivery is always the day after its own cutoff,
 * so the second delivery is first delivery + 7 days, and its cutoff is 5 PM
 * Eastern the evening before that. This lands 7–14 days out depending on
 * signup timing, which is fine for trial_end (unlike billing_cycle_anchor,
 * it has no 7-day cap).
 *
 * DST-safe: delegates to cutoffUnixForDeliveryDate in lib/delivery-utils.ts,
 * the single source of truth for "what UTC instant is 5 PM Eastern the
 * evening before delivery date D".
 *
 * ⚠️ This previously hand-rolled `Date.UTC(y, m-1, d+6, 22, 0, 0)` with a
 * local `CUTOFF_HOUR_UTC = 22` constant, which only resolves to 5 PM Eastern
 * during EST (roughly Nov–Mar). Through EDT — most of the delivery season —
 * 5 PM ET is 21:00 UTC, so every first renewal was anchored an hour late,
 * an hour AFTER the skip window had already locked. Do not reintroduce a
 * fixed UTC offset here; see the notes in delivery-utils.ts.
 */
function computeSecondCutoffUnix(deliveryDay: "thursday" | "friday"): number {
  const firstDelivery = computeNextDeliveryDate(deliveryDay)
  const [y, m, d] = firstDelivery.split("-").map(Number)

  // Second delivery = first delivery + 7 days. Constructing a local Date and
  // reading the components back normalizes month/year overflow for us; only
  // the calendar date matters here, never the time-of-day.
  const second = new Date(y, m - 1, d + 7)
  const secondDeliveryStr =
    `${second.getFullYear()}-` +
    `${String(second.getMonth() + 1).padStart(2, "0")}-` +
    `${String(second.getDate()).padStart(2, "0")}`

  return cutoffUnixForDeliveryDate(secondDeliveryStr)
}

// ---------------------------------------------------------------------------
// Create Checkout Session
//
// For subscription carts: a plain, standard subscription checkout. The
// customer pays the full weekly price today — no anchor, no proration
// settings, no special line items. The renewal date gets moved to the
// correct cutoff right after checkout (see rescheduleRenewalToCutoff).
// ---------------------------------------------------------------------------
export async function createCheckoutSession(
  cartItems: CartItem[],
  returnUrl: string,
  returnUrlSuffix: string = "",
  deliveryDay?: string
): Promise<{ clientSecret: string | null; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const hasSubscription = cartItems.some((i) => i.isSubscription)
    const hasOneTime = cartItems.some((i) => !i.isSubscription)

    if (hasSubscription && hasOneTime) {
      return {
        clientSecret: null,
        error: "Subscription and one-time items cannot be combined in a single checkout session.",
      }
    }

    const day: "thursday" | "friday" = deliveryDay === "thursday" ? "thursday" : "friday"

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = cartItems.map((item) => {
      const product = PRODUCTS.find((p) => p.id === item.productId)
      if (!product) throw new Error(`Product not found: ${item.productId}`)

      return {
        price_data: {
          currency: "usd",
          product_data: {
            name: product.name,
            description: item.isSubscription
              ? `Weekly subscription — today's payment covers your first delivery. After that, your card is charged each week at your cutoff (5 PM the evening before your ${day === "thursday" ? "Thursday" : "Friday"} delivery). Skip or cancel anytime before then.`
              : product.description,
          },
          unit_amount: item.isSubscription
            ? product.subscriptionPriceInCents
            : product.priceInCents,
          ...(item.isSubscription && {
            recurring: { interval: "week" as const },
          }),
        },
        quantity: item.quantity,
      }
    })

    const mode: Stripe.Checkout.SessionCreateParams.Mode = hasSubscription
      ? "subscription"
      : "payment"

    const metadata: Record<string, string> = {
      cart_items: JSON.stringify(
        cartItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          isSubscription: i.isSubscription,
        }))
      ),
    }
    if (user) metadata.user_id = user.id
    if (deliveryDay) metadata.delivery_day = deliveryDay

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      ui_mode: "embedded",
      line_items: lineItems,
      mode,
      return_url: `${returnUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}${returnUrlSuffix}`,
      metadata,
    }

    if (hasSubscription) {
      // Deliberately NO billing_cycle_anchor and NO proration_behavior here.
      // The customer pays the normal full price today; the renewal date is
      // moved to the correct cutoff immediately after checkout via
      // rescheduleRenewalToCutoff (Stripe's documented trial_end method).
      sessionParams.subscription_data = {
        metadata: {
          delivery_day: deliveryDay ?? "",
        },
      }
    }

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("stripe_customer_id, email")
        .eq("id", user.id)
        .single()

      if (profile?.stripe_customer_id) {
        sessionParams.customer = profile.stripe_customer_id
      } else if (profile?.email) {
        sessionParams.customer_email = profile.email
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams)
    return { clientSecret: session.client_secret }
  } catch (error) {
    console.error("Error creating checkout session:", error)
    return {
      clientSecret: null,
      error: error instanceof Error ? error.message : "Failed to create checkout session",
    }
  }
}

// ---------------------------------------------------------------------------
// Get Checkout Session
// ---------------------------------------------------------------------------
export async function getCheckoutSession(sessionId: string) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items", "customer", "subscription"],
    })
    return { session, error: null }
  } catch (error) {
    console.error("Error retrieving checkout session:", error)
    return {
      session: null,
      error: error instanceof Error ? error.message : "Failed to retrieve session",
    }
  }
}

// ---------------------------------------------------------------------------
// Move the subscription's next renewal to the cutoff before the customer's
// SECOND delivery. Stripe's documented method: update trial_end (which also
// resets the billing cycle anchor to that date) with proration disabled —
// no credit is owed because week 1 was already fully paid at checkout.
//
// NOTE: this update makes Stripe generate a $0 "subscription_update"
// invoice, which becomes the subscription's latest_invoice — which is why
// the first-week payment must be resolved BEFORE calling this (see
// resolveFirstPayment and the ordering in saveOrderFromSession).
//
// Returns the subscription's new current_period_end (= the trial end = the
// second cutoff) for storage in Supabase.
// ---------------------------------------------------------------------------
async function rescheduleRenewalToCutoff(
  stripeSubscriptionId: string,
  deliveryDay: "thursday" | "friday"
): Promise<{ periodEnd: string | null; error: string | null }> {
  try {
    const trialEnd = computeSecondCutoffUnix(deliveryDay)

    const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
      trial_end: trialEnd,
      proration_behavior: "none",
    })

    const periodEndUnix = (updated as unknown as { items: { data: { current_period_end: number }[] } })
      .items?.data?.[0]?.current_period_end

    // Prefer the authoritative value from Stripe's response; fall back to
    // the trial end we just set (they should be the same moment).
    const effectiveEnd = periodEndUnix ?? trialEnd
    return { periodEnd: new Date(effectiveEnd * 1000).toISOString(), error: null }
  } catch (e) {
    console.error(
      `CRITICAL: failed to reschedule renewal to cutoff for ${stripeSubscriptionId} — ` +
        `subscription will renew on its natural weekly date (signup weekday) instead of the cutoff. ` +
        `Fix manually in Stripe Dashboard (add a trial ending at the correct cutoff, no proration).`,
      e
    )
    return {
      periodEnd: null,
      error: e instanceof Error ? e.message : "Failed to reschedule renewal",
    }
  }
}

// ---------------------------------------------------------------------------
// Resolve the payment intent + invoice id for the customer's first-week
// charge — the payment they just made at checkout.
//
// The Checkout Session itself points at the signup invoice (session.invoice),
// which is the reliable source: the subscription's latest_invoice becomes
// the $0 trial-reschedule invoice as soon as rescheduleRenewalToCutoff runs,
// so it must never be used for this after that point. latest_invoice is kept
// only as a fallback for the case where session.invoice is missing AND the
// reschedule hasn't happened yet (i.e. this is called before it, which is
// the required ordering anyway).
//
// Under newer Stripe API versions (2025-03-31 "basil" and later, including
// our 2026 "clover" version), invoices don't expose a top-level
// `payment_intent` field — payments live in the invoice's `payments` list.
// Modern shape tried first, legacy field as fallback.
// ---------------------------------------------------------------------------
function extractPaymentIntentFromInvoice(invoice: Stripe.Invoice | null): {
  paymentIntentId: string | null
  invoiceId: string | null
} {
  if (!invoice) return { paymentIntentId: null, invoiceId: null }

  const invAny = invoice as unknown as {
    id?: string
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
  const paymentIntentId = typeof raw === "string" ? raw : raw?.id ?? null

  return { paymentIntentId, invoiceId: invAny.id ?? null }
}

async function resolveFirstPayment(
  session: Stripe.Checkout.Session,
  stripeSubscriptionId: string
): Promise<{ paymentIntentId: string | null; invoiceId: string | null }> {
  try {
    // Preferred: the signup invoice the Checkout Session itself points at.
    const sessionInvoice = (session as unknown as { invoice?: string | { id: string } | null }).invoice
    const sessionInvoiceId =
      typeof sessionInvoice === "string" ? sessionInvoice : sessionInvoice?.id ?? null

    if (sessionInvoiceId) {
      const invoice = await stripe.invoices.retrieve(sessionInvoiceId, {
        expand: ["payments"],
      })
      const result = extractPaymentIntentFromInvoice(invoice)
      if (result.paymentIntentId) return result
    }

    // Fallback: subscription's latest invoice. Only reliable BEFORE the
    // trial reschedule runs — which is the required call ordering anyway.
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ["latest_invoice.payments"],
    })
    const latestInvoice = (sub as unknown as { latest_invoice: Stripe.Invoice | null }).latest_invoice
    return extractPaymentIntentFromInvoice(latestInvoice)
  } catch (e) {
    console.error("Failed to resolve first payment for subscription:", e)
    return { paymentIntentId: null, invoiceId: null }
  }
}

// ---------------------------------------------------------------------------
// Fetch receipt URL from Stripe
// ---------------------------------------------------------------------------
async function fetchReceiptUrl(session: Stripe.Checkout.Session): Promise<string | null> {
  try {
    if (session.mode === "payment" && session.payment_intent) {
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent.id

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      })

      const charge = paymentIntent.latest_charge as Stripe.Charge | null
      return charge?.receipt_url ?? null
    }

    if (session.mode === "subscription") {
      // Use the signup invoice the session points at (NOT latest_invoice,
      // which becomes the $0 trial-reschedule invoice — see resolveFirstPayment).
      const sessionInvoice = (session as unknown as { invoice?: string | { id: string } | null }).invoice
      const sessionInvoiceId =
        typeof sessionInvoice === "string" ? sessionInvoice : sessionInvoice?.id ?? null

      if (sessionInvoiceId) {
        const invoice = await stripe.invoices.retrieve(sessionInvoiceId)
        return invoice.hosted_invoice_url ?? null
      }
    }
  } catch (e) {
    console.error("Failed to fetch receipt URL from Stripe:", e)
  }

  return null
}

// ---------------------------------------------------------------------------
// Save Order From Session
// Called on the success page after checkout completes.
// ---------------------------------------------------------------------------
export async function saveOrderFromSession(sessionId: string) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { error: "User not authenticated" }

    const { session, error: sessionError } = await getCheckoutSession(sessionId)
    if (sessionError || !session) {
      return { error: sessionError || "Failed to get session" }
    }

    // Idempotency — don't double-save if the success page is revisited
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, order_code")
      .eq("stripe_session_id", sessionId)
      .maybeSingle()

    if (existingOrder) {
      return { error: null, orderId: existingOrder.id, orderCode: existingOrder.order_code ?? null }
    }

    // Parse metadata
    let cartItems: Array<{
      productId: string
      quantity: number
      isSubscription: boolean
    }> = []

    try {
      if (session.metadata?.cart_items) {
        cartItems = JSON.parse(session.metadata.cart_items)
      }
    } catch {
      console.error("Failed to parse cart_items from session metadata")
    }

    const deliveryDay = (session.metadata?.delivery_day || "friday") as "thursday" | "friday"
    const isSubscriptionMode = session.mode === "subscription"

    const purchasedAt = session.created
      ? new Date(session.created * 1000).toISOString()
      : new Date().toISOString()

    const deliveryDate = computeNextDeliveryDate(deliveryDay)

    const placedAt = isSubscriptionMode
      ? new Date(deliveryDate + "T12:00:00").toISOString()
      : purchasedAt

    const stripeCustomerId =
      typeof session.customer === "string"
        ? session.customer
        : (session.customer as Stripe.Customer | null)?.id ?? null

    const receiptUrl = await fetchReceiptUrl(session)

    // The customer pays the full weekly price at checkout, so
    // session.amount_total is the real charged amount. Cart-derived total
    // kept as a fallback only.
    const cartTotal = cartItems.reduce((sum, ci) => {
      const product = PRODUCTS.find((p) => p.id === ci.productId)
      const price = ci.isSubscription
        ? (product?.subscriptionPriceInCents ?? 0)
        : (product?.priceInCents ?? 0)
      return sum + price * ci.quantity
    }, 0)
    const amountTotal = session.amount_total ?? cartTotal

    const stripeSubIdForOrder = isSubscriptionMode
      ? (typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription as Stripe.Subscription | null)?.id ?? null)
      : null

    // Payment intent: one-time checkouts carry it on the session; for
    // subscription checkouts the charge lives on the signup invoice.
    let stripePaymentIntentId: string | null =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null

    let stripeInvoiceId: string | null = null
    let periodEnd: string | null = null

    if (isSubscriptionMode && stripeSubIdForOrder) {
      // ⚠️ ORDER MATTERS (Session 12 fix):
      // 1. Resolve the first-week payment FIRST, from the signup invoice —
      //    the reschedule below generates a $0 invoice that becomes
      //    latest_invoice and would otherwise shadow the real payment.
      const firstPayment = await resolveFirstPayment(session, stripeSubIdForOrder)
      if (firstPayment.paymentIntentId) stripePaymentIntentId = firstPayment.paymentIntentId
      stripeInvoiceId = firstPayment.invoiceId

      if (!firstPayment.paymentIntentId) {
        console.error(
          `saveOrderFromSession: could not resolve first-week payment intent for ${stripeSubIdForOrder} — ` +
            `admin refunds for this order won't work until it's backfilled. Check the signup invoice in Stripe.`
        )
      }

      // 2. THEN move the renewal to the correct cutoff (Stripe-documented
      //    trial_end method — see rescheduleRenewalToCutoff). Failure here
      //    is logged CRITICALLY but doesn't block the order.
      const reschedule = await rescheduleRenewalToCutoff(stripeSubIdForOrder, deliveryDay)
      periodEnd = reschedule.periodEnd
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()

    if (stripeCustomerId && profile && !profile.stripe_customer_id) {
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", user.id)
    }

    // ── 1. Create order record ──────────────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        status: "confirmed",
        order_type: isSubscriptionMode ? "subscription" : "one_time",
        subtotal: amountTotal,
        total: amountTotal,
        delivery_day: deliveryDay,
        delivery_address: profile?.address || null,
        delivery_city: profile?.city || null,
        delivery_zip: profile?.zip || null,
        stripe_session_id: sessionId,
        stripe_payment_intent_id: stripePaymentIntentId,
        stripe_invoice_id: stripeInvoiceId,
        stripe_subscription_id: stripeSubIdForOrder,
        stripe_receipt_url: receiptUrl,
        delivery_date: deliveryDate,
        delivery_state: "pending",
        placed_at: placedAt,
        created_at: purchasedAt,
        updated_at: purchasedAt,
      })
      .select()
      .single()

    if (orderError) {
      console.error("Error creating order:", orderError)
      return { error: orderError.message }
    }

    // ── 2. Save order items ─────────────────────────────────────────────────
    if (cartItems.length > 0) {
      const orderItems = cartItems.map((ci) => {
        const product = PRODUCTS.find((p) => p.id === ci.productId)
        return {
          order_id: order.id,
          product_id: ci.productId,
          product_name: product?.name || ci.productId,
          size: product?.size || "16oz",
          quantity: ci.quantity,
          price_cents: ci.isSubscription
            ? (product?.subscriptionPriceInCents || 0)
            : (product?.priceInCents || 0),
        }
      })

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems)

      if (itemsError) console.error("Error creating order items:", itemsError)
    }

    // ── 3. Save subscription record (subscription mode only) ────────────────
    if (isSubscriptionMode) {
      const { data: sub, error: subError } = await supabase
        .from("subscriptions")
        .insert({
          user_id: user.id,
          stripe_subscription_id: stripeSubIdForOrder,
          status: "active",
          delivery_day: deliveryDay,
          cancel_at_period_end: false,
          current_period_end: periodEnd,
          skipped_dates: [],
          created_at: purchasedAt,
          updated_at: purchasedAt,
        })
        .select()
        .single()

      if (subError) {
        console.error("Error creating subscription:", subError)
      }

      if (sub && cartItems.length > 0) {
        const subItems = cartItems.map((ci) => {
          const product = PRODUCTS.find((p) => p.id === ci.productId)
          return {
            subscription_id: sub.id,
            product_id: ci.productId,
            product_name: product?.name || ci.productId,
            size: product?.size || "16oz",
            quantity: ci.quantity,
            price_cents: product?.subscriptionPriceInCents || 0,
          }
        })

        const { error: subItemsError } = await supabase
          .from("subscription_items")
          .insert(subItems)

        if (subItemsError) console.error("Error creating subscription items:", subItemsError)

        await supabase
          .from("orders")
          .update({ subscription_id: sub.id })
          .eq("id", order.id)
      }
    }

    // ── 4. Send confirmation email ──────────────────────────────────────────
    if (user.email) {
      const customerName =
        `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "there"

      const emailItems = cartItems.map((ci) => {
        const product = PRODUCTS.find((p) => p.id === ci.productId)
        return {
          name: product?.name || ci.productId,
          quantity: ci.quantity,
          price: ci.isSubscription
            ? (product?.subscriptionPriceInCents || 0)
            : (product?.priceInCents || 0),
        }
      })

      try {
        await sendOrderConfirmationEmail({
          customerEmail: user.email,
          customerName,
          orderId: order.order_code ?? order.id.slice(-8).toUpperCase(),
          orderDate: new Date(purchasedAt).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          }),
          isSubscription: isSubscriptionMode,
          deliveryDate,
          deliveryDay,
          receiptUrl,
          deliveryAddress: {
            address: profile?.address || "",
            city: profile?.city || "",
            state: profile?.state || "NY",
            zip: profile?.zip || "",
          },
          items: emailItems,
          subtotal: amountTotal,
          total: amountTotal,
        })
      } catch (emailError) {
        console.error("Failed to send confirmation email:", emailError)
      }
    }

    return { error: null, orderId: order.id, orderCode: order.order_code ?? null }
  } catch (e) {
    console.error("Error in saveOrderFromSession:", e)
    return {
      error: e instanceof Error ? e.message : "Failed to save order",
    }
  }
}