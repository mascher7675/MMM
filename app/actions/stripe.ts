//app/actions/stripe.ts

"use server"

import Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { PRODUCTS } from "@/lib/products"
import { createClient } from "@/lib/supabase/server"
import { sendOrderConfirmationEmail } from "@/lib/email"
import { computeNextDeliveryDate } from "@/lib/delivery-utils"

interface CartItem {
  productId: string
  quantity: number
  isSubscription: boolean
}

// ---------------------------------------------------------------------------
// Compute the next Friday as a Unix timestamp (seconds).
//
// All subscriptions are anchored to Friday regardless of delivery day so that:
//   - Friday customers are charged on delivery day
//   - Thursday customers are charged the day after delivery
//   - invoice.upcoming always fires Thursday ~11 PM for everyone
//   - The skip cutoff (Thursday 5 PM) is the same for all customers
//   - Switching delivery days never requires a Stripe billing anchor change
// ---------------------------------------------------------------------------
function computeFridayBillingAnchorUnix(): number {
  const dateStr = computeNextDeliveryDate("friday")
  const [y, m, d] = dateStr.split("-").map(Number)
  return Math.floor(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getTime() / 1000)
}

// ---------------------------------------------------------------------------
// Create Checkout Session
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

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = cartItems.map((item) => {
      const product = PRODUCTS.find((p) => p.id === item.productId)
      if (!product) throw new Error(`Product not found: ${item.productId}`)

      return {
        price_data: {
          currency: "usd",
          product_data: {
            name: product.name,
            description: item.isSubscription
              ? "Weekly subscription — delivered every week, skip anytime before 5 PM Thursday"
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
      sessionParams.subscription_data = {
        billing_cycle_anchor: computeFridayBillingAnchorUnix(),
        proration_behavior: "none",
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

    if (session.mode === "subscription" && session.subscription) {
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription as Stripe.Subscription).id

      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["latest_invoice"],
      })

      const invoice = (subscription as unknown as { latest_invoice: Stripe.Invoice | null })
        .latest_invoice
      return invoice?.hosted_invoice_url ?? null
    }
  } catch (e) {
    console.error("Failed to fetch receipt URL from Stripe:", e)
  }

  return null
}

// ---------------------------------------------------------------------------
// Save Order From Session
// Called on the success page after checkout completes.
//
// For subscription orders this creates:
//   1. The orders row (week 1 delivery — the first delivery date)
//   2. The order_items snapshot
//   3. The subscriptions row
//   4. The subscription_items rows
//   5. Backfills subscription_id on the order row
//
// Subsequent weekly orders are created by the invoice.upcoming webhook.
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
      .select("id")
      .eq("stripe_session_id", sessionId)
      .maybeSingle()

    if (existingOrder) {
      return { error: null, orderId: existingOrder.id }
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

    const deliveryDay = session.metadata?.delivery_day || null
    const isSubscriptionMode = session.mode === "subscription"

    const purchasedAt = session.created
      ? new Date(session.created * 1000).toISOString()
      : new Date().toISOString()

    const firstDeliveryDate =
      isSubscriptionMode && deliveryDay
        ? computeNextDeliveryDate(deliveryDay as "thursday" | "friday")
        : null

    const placedAt = firstDeliveryDate
      ? new Date(firstDeliveryDate + "T12:00:00").toISOString()
      : purchasedAt

    const oneTimeDeliveryDate =
      !isSubscriptionMode && deliveryDay
        ? computeNextDeliveryDate(deliveryDay as "thursday" | "friday")
        : null

    const stripePaymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null

    const stripeCustomerId =
      typeof session.customer === "string"
        ? session.customer
        : (session.customer as Stripe.Customer | null)?.id ?? null

    const receiptUrl = await fetchReceiptUrl(session)

    // For subscriptions with a future billing anchor, Stripe returns amount_total = 0
    // on the checkout session because no charge is collected at signup time.
    // Calculate the real weekly total from cart items instead.
    const cartTotal = cartItems.reduce((sum, ci) => {
      const product = PRODUCTS.find((p) => p.id === ci.productId)
      const price = ci.isSubscription
        ? (product?.subscriptionPriceInCents ?? 0)
        : (product?.priceInCents ?? 0)
      return sum + price * ci.quantity
    }, 0)
    const amountTotal = isSubscriptionMode ? cartTotal : (session.amount_total ?? cartTotal)

    // Extract Stripe subscription ID early so we can store it on the order row
    const stripeSubIdForOrder = isSubscriptionMode
      ? (typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription as Stripe.Subscription | null)?.id ?? null)
      : null

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
        stripe_subscription_id: stripeSubIdForOrder,
        stripe_receipt_url: receiptUrl,
        delivery_date: isSubscriptionMode ? firstDeliveryDate : oneTimeDeliveryDate,
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
      const stripeSubId =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription as Stripe.Subscription | null)?.id

      let periodEnd: string | null = null
      if (stripeSubId) {
        try {
          const stripeSub = await stripe.subscriptions.retrieve(stripeSubId)
          const periodEndUnix = (stripeSub as unknown as { items: { data: { current_period_end: number }[] } })
            .items?.data?.[0]?.current_period_end
          if (periodEndUnix) {
            periodEnd = new Date(periodEndUnix * 1000).toISOString()
          }
        } catch (e) {
          console.error("Failed to retrieve Stripe subscription:", e)
        }
      }

      // ── 3a. Insert subscription row ────────────────────────────────────────
      const { data: sub, error: subError } = await supabase
        .from("subscriptions")
        .insert({
          user_id: user.id,
          stripe_subscription_id: stripeSubId ?? null,
          status: "active",
          delivery_day: deliveryDay ?? "thursday",
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

      // ── 3b. Insert subscription_items ──────────────────────────────────────
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

        // ── 3c. Backfill subscription_id on the order row ──────────────────
        await supabase
          .from("orders")
          .update({ subscription_id: sub.id })
          .eq("id", order.id)
      }
    }

    // ── 4. Send confirmation email ──────────────────────────────────────────
    if (profile && user.email) {
      try {
        await sendOrderConfirmationEmail({
          customerEmail: user.email,
          customerName:
            `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
            "Valued Customer",
          orderId: order.id.slice(-8).toUpperCase(),
          orderDate: new Date(purchasedAt).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          }),
          receiptUrl,
          deliveryAddress: {
            address: profile.address || "",
            city: profile.city || "",
            state: profile.state || "",
            zip: profile.zip || "",
          },
          items: cartItems.map((ci) => {
            const product = PRODUCTS.find((p) => p.id === ci.productId)
            return {
              name: product?.name || ci.productId,
              quantity: ci.quantity,
              price: ci.isSubscription
                ? (product?.subscriptionPriceInCents || 0)
                : (product?.priceInCents || 0),
            }
          }),
          subtotal: order.subtotal,
          total: order.total,
        })
      } catch (emailError) {
        console.error("Failed to send confirmation email:", emailError)
      }
    }

    return { error: null, orderId: order.id }
  } catch (e) {
    console.error("Error in saveOrderFromSession:", e)
    return {
      error: e instanceof Error ? e.message : "Failed to save order",
    }
  }
}