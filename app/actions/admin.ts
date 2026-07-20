// app/actions/admin.ts
"use server"

import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { revalidatePath } from "next/cache"
import { PRODUCTS, normalizeProductName } from "@/lib/products"
import { computeNextDeliveryDate } from "@/lib/delivery-utils"
import { sendRefundRequestDeclinedEmail, sendOrderCancelledEmail } from "@/lib/email"

// ---------------------------------------------------------------------------
// Price helpers
// ---------------------------------------------------------------------------
function getCashItemPriceCents(productName: string, size: string): number {
  const canonical = normalizeProductName(productName, size)
  return PRODUCTS.find((p) => p.name === canonical)?.priceInCents ?? 0
}

function getCashSubscriptionPriceCents(productName: string, size: string): number {
  const canonical = normalizeProductName(productName, size)
  return PRODUCTS.find((p) => p.name === canonical)?.subscriptionPriceInCents ?? 0
}

// ---------------------------------------------------------------------------
async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error("Not authenticated")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "admin") throw new Error("Access denied: admin only")
  return { supabase, user }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AdminCustomer {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  delivery_day: string | null
  delivery_instructions: string | null
  stripe_customer_id: string | null
  role: string
  is_cash_customer: boolean
  route_position: number | null
  /** Thursday: route_position (above). Friday: this. See migration 018. */
  route_position_friday: number | null
  admin_notes: string | null
  created_at: string
}

export interface AdminOrder {
  id: string
  order_code: string | null
  user_id: string
  subscription_id: string | null
  status: string
  order_type: string
  subtotal: number
  total: number
  delivery_day: string | null
  delivery_address: string | null
  delivery_city: string | null
  delivery_zip: string | null
  delivery_state: string | null
  delivery_date: string | null
  admin_notes: string | null
  placed_at: string | null
  created_at: string
  stripe_session_id: string | null
  stripe_payment_intent_id: string | null
  stripe_invoice_id?: string | null
  stripe_subscription_id: string | null
  stripe_refund_id?: string | null
  refund_amount_cents?: number | null
  cancelled_at?: string | null
  customer_name?: string
  customer_email?: string
  customer_phone?: string
  is_cash_customer?: boolean
  order_items: {
    id: string
    product_id: string
    product_name: string
    size: string
    quantity: number
    price_cents: number
  }[]
}

export interface SubscriptionDeliveryLog {
  id: string
  order_id: string
  delivery_date: string
  delivery_state: string
  admin_notes: string | null
  created_at: string
  updated_at: string
}

export interface AdminSubscription {
  id: string
  user_id: string
  status: string
  delivery_day: string
  cancel_at_period_end: boolean
  current_period_end: string | null
  final_delivery_date: string | null
  stripe_subscription_id: string | null
  skipped_dates: string[] | null
  created_at: string
  customer_name?: string
  customer_email?: string
  subscription_items: {
    id: string
    product_id: string | null
    product_name: string | null
    size: string
    quantity: number
    price_cents: number | null
  }[]
}

export interface AdminMessage {
  id: string
  user_id: string | null
  type: string
  subject: string | null
  body: string
  status: string
  customer_name: string | null
  customer_email: string | null
  phone: string | null
  subscription_id: string | null
  order_id: string | null
  created_at: string
  updated_at: string
}

export interface CustomerHistoryOrder {
  id: string
  order_type: string
  status: string
  delivery_state: string | null
  delivery_day: string | null
  placed_at: string | null
  created_at: string
  items: { product_name: string; size: string; quantity: number }[]
}

export interface CustomerHistorySubscription {
  id: string
  status: string
  delivery_day: string
  created_at: string
  items: { product_name: string | null; size: string; quantity: number }[]
}

export interface DeliveryStop {
  customerId: string
  customerName: string
  customerPhone: string | null
  address: string
  city: string
  zip: string
  deliveryInstructions: string | null
  adminNotes: string | null
  items: { name: string; quantity: number; size: string }[]
  /** @deprecated use sourceIds */
  subscriptionId: string
  sourceIds: string[]
  isCashCustomer: boolean
  routePosition: number | null
  isOneTime: boolean
  hasSub: boolean
  hasOneTime: boolean
}

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------
export async function getAdminStats() {
  try {
    const { supabase } = await requireAdmin()

    const [
      { count: totalCustomers },
      { count: activeSubscriptions },
      { count: totalOrders },
      { count: unreadMessages },
      ordersThisWeek,
      revenueResult,
    ] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }).neq("role", "admin"),
      supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("orders").select("*", { count: "exact", head: true }),
      supabase.from("messages").select("*", { count: "exact", head: true }).eq("status", "unread"),
      // `status` is selected so weekly revenue can exclude cancelled/refunded
      // orders — see the reduce below.
      supabase
        .from("orders")
        .select("id,total,order_type,status")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from("orders").select("total").eq("status", "confirmed"),
    ])

    // ── Revenue ────────────────────────────────────────────────────────────
    // Both figures count CONFIRMED orders only, so they mean the same thing.
    //
    // This previously had no status filter at all, while allTimeRevenue
    // filtered status = "confirmed". Cancelled orders keep their `total`
    // intact (cancelAndRefundOrder only flips status and records
    // refund_amount_cents), so every refunded order was still counted as
    // weekly revenue at full price — money that was handed back to the
    // customer. On this database that inflated the KPI from $90 to $174.
    //
    // Skipped orders are unaffected either way: create_weekly_delivery_order
    // and set_weekly_order_skip_state both zero their total.
    const weeklyOrdersData = ordersThisWeek.data ?? []
    const weeklyRevenue = weeklyOrdersData
      .filter((o) => o.status === "confirmed")
      .reduce((s, o) => s + (o.total ?? 0), 0)
    const allTimeRevenue = (revenueResult.data ?? []).reduce((s, o) => s + (o.total ?? 0), 0)

    return {
      totalCustomers: totalCustomers ?? 0,
      activeSubscriptions: activeSubscriptions ?? 0,
      totalOrders: totalOrders ?? 0,
      unreadMessages: unreadMessages ?? 0,
      weeklyRevenue,
      allTimeRevenue,
      // "Orders This Week" excludes cancelled orders so the count agrees with
      // the revenue figure beside it. Skipped orders ARE counted — they're
      // real scheduled deliveries the customer chose to pause, not mistakes.
      // If you'd rather this read as "orders placed", including cancelled
      // ones, drop the filter — it's a reporting preference, not correctness.
      weeklyOrders: weeklyOrdersData.filter((o) => o.status !== "cancelled").length,
      error: null,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load stats", totalCustomers: 0, activeSubscriptions: 0, totalOrders: 0, unreadMessages: 0, weeklyRevenue: 0, allTimeRevenue: 0, weeklyOrders: 0 }
  }
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export async function getAdminCustomers(): Promise<{ data: AdminCustomer[]; error: string | null }> {
  try {
    const { supabase } = await requireAdmin()
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) return { data: [], error: error.message }
    return { data: data as AdminCustomer[], error: null }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : "Failed to load customers" }
  }
}

export async function updateCustomerRole(
  customerId: string,
  role: "customer" | "admin"
): Promise<{ error: string | null }> {
  try {
    const { supabase, user } = await requireAdmin()

    // ── Lockout guard ──────────────────────────────────────────────────────
    // Every admin action in this file goes through requireAdmin(), which gates
    // on profiles.role. So demoting the last admin — or yourself — is
    // irreversible FROM INSIDE THE APP: the only way back is editing the row
    // directly in Supabase.
    //
    // The protect_privileged_profile_columns trigger does NOT cover this. It
    // exempts admins outright ("IF public.is_admin() THEN RETURN NEW"), so it
    // stops customers escalating themselves, not admins demoting themselves.
    //
    // This matters because the role dropdown sits in the Customers table
    // right next to ordinary customers, and the admin's own row is listed
    // there too (getAdminCustomers does a bare select with no role filter) —
    // one misclick in a paginated list is all it takes.
    if (role === "customer") {
      if (customerId === user.id) {
        return { error: "You can't remove your own admin access — ask the other admin to do it." }
      }

      const { count, error: countError } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin")

      if (countError) return { error: countError.message }
      if ((count ?? 0) <= 1) {
        return { error: "Can't remove the last admin — the dashboard would become unreachable." }
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", customerId)

    if (error) return { error: error.message }
    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update role" }
  }
}

export async function updateCustomerAdminNotes(
  customerId: string,
  admin_notes: string
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase
      .from("profiles")
      .update({ admin_notes, updated_at: new Date().toISOString() })
      .eq("id", customerId)

    if (error) return { error: error.message }
    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update notes" }
  }
}

export async function getCashCustomerHistory(customerId: string): Promise<{
  orders: CustomerHistoryOrder[]
  subscriptions: CustomerHistorySubscription[]
  error: string | null
}> {
  try {
    const { supabase } = await requireAdmin()

    const [ordersResult, subsResult] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_type, status, delivery_state, delivery_day, placed_at, created_at, order_items(product_name, size, quantity)")
        .eq("user_id", customerId)
        .order("placed_at", { ascending: false }),
      supabase
        .from("subscriptions")
        .select("id, status, delivery_day, created_at, subscription_items(product_name, size, quantity)")
        .eq("user_id", customerId)
        .order("created_at", { ascending: false }),
    ])

    if (ordersResult.error) return { orders: [], subscriptions: [], error: ordersResult.error.message }
    if (subsResult.error)   return { orders: [], subscriptions: [], error: subsResult.error.message }

    const orders = (ordersResult.data ?? []).map(o => ({
      id: o.id,
      order_type: o.order_type,
      status: o.status,
      delivery_state: o.delivery_state ?? null,
      delivery_day: o.delivery_day ?? null,
      placed_at: o.placed_at ?? null,
      created_at: o.created_at,
      items: (o.order_items ?? []) as { product_name: string; size: string; quantity: number }[],
    }))

    const subscriptions = (subsResult.data ?? []).map(s => ({
      id: s.id,
      status: s.status,
      delivery_day: s.delivery_day,
      created_at: s.created_at,
      items: (s.subscription_items ?? []) as { product_name: string | null; size: string; quantity: number }[],
    }))

    return { orders, subscriptions, error: null }
  } catch (e) {
    return { orders: [], subscriptions: [], error: e instanceof Error ? e.message : "Failed to load history" }
  }
}

export async function deleteCashCustomer(
  customerId: string
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    // Clean up subscriptions BEFORE deleting the profile.
    //
    // There is no foreign key from subscriptions/subscription_items back to
    // profiles (confirmed against the live schema), so deleting only the
    // profile row left any subscription this cash customer had completely
    // orphaned: invisible cruft, not a recoverable "Deleted Customer" record
    // like orders get. getAdminSubscriptions actively filters these out
    // (`.filter((s) => profileMap[s.user_id])`), so an admin had no way to
    // even see, let alone clean up, a leftover row — it just sat in the
    // database forever.
    //
    // Cash-customer subscriptions never carry a stripe_subscription_id (cash
    // customers have no Stripe billing), so there is nothing to cancel on
    // Stripe's side — a straight delete is safe and complete. This does NOT
    // touch orders: those are deliberately preserved and surface in the
    // Orders tab as "Deleted Customer" with their own cleanup flow
    // (deleteOrphanedOrder), which stays unchanged.
    const { data: subs, error: subsFetchError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", customerId)

    if (subsFetchError) return { error: subsFetchError.message }

    const subIds = (subs ?? []).map((s) => s.id)

    if (subIds.length > 0) {
      const { error: itemsDeleteError } = await supabase
        .from("subscription_items")
        .delete()
        .in("subscription_id", subIds)
      if (itemsDeleteError) return { error: itemsDeleteError.message }

      const { error: subsDeleteError } = await supabase
        .from("subscriptions")
        .delete()
        .in("id", subIds)
      if (subsDeleteError) return { error: subsDeleteError.message }
    }

    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", customerId)
      .eq("is_cash_customer", true)

    if (error) return { error: error.message }
    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete customer" }
  }
}

// ---------------------------------------------------------------------------
// Cash Customer Management
// ---------------------------------------------------------------------------
export async function createCashCustomer(data: {
  first_name: string
  last_name: string
  phone?: string
  email?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  delivery_day?: string
  delivery_date?: string
  delivery_instructions?: string
  admin_notes?: string
  customer_type: "subscription" | "one_time"
  items: { product_name: string; size: string; quantity: number }[]
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    const { data: uuidRow } = await supabase.rpc("gen_random_uuid" as never) as { data: string | null }
    const newId = uuidRow ?? crypto.randomUUID()

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: newId,
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        delivery_day: data.delivery_day || "thursday",
        delivery_instructions: data.delivery_instructions || null,
        admin_notes: data.admin_notes || null,
        is_cash_customer: true,
        role: "customer",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (profileError || !profile) return { id: null, error: profileError?.message ?? "Failed to create profile" }

    const pricedItems = data.items.map((item) => ({
      ...item,
      price_cents: data.customer_type === "subscription"
        ? getCashSubscriptionPriceCents(item.product_name, item.size)
        : getCashItemPriceCents(item.product_name, item.size),
    }))
    const subtotalCents = pricedItems.reduce((sum, item) => sum + item.price_cents * item.quantity, 0)

    if (data.customer_type === "subscription") {
      const deliveryDay = (data.delivery_day ?? "thursday") as "thursday" | "friday"
      const nextDeliveryDate = computeNextDeliveryDate(deliveryDay)

      const { data: sub, error: subError } = await supabase
        .from("subscriptions")
        .insert({
          user_id: profile.id,
          status: "active",
          delivery_day: deliveryDay,
          skipped_dates: [],
          cancel_at_period_end: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single()

      if (subError) return { id: null, error: subError.message }

      if (sub && pricedItems.length > 0) {
        const subItems = pricedItems.flatMap((item) =>
          Array.from({ length: item.quantity }, () => ({
            subscription_id: sub.id,
            product_name: item.product_name,
            size: item.size,
            quantity: 1,
            price_cents: item.price_cents,
            created_at: new Date().toISOString(),
          }))
        )
        const { error: itemsError } = await supabase.from("subscription_items").insert(subItems)
        if (itemsError) return { id: null, error: itemsError.message }

        const deliveryDateStr = data.delivery_date ?? nextDeliveryDate
        const deliveryDateIso = new Date(deliveryDateStr + "T00:00:00").toISOString()

        const { data: order, error: orderError } = await supabase
          .from("orders")
          .insert({
            user_id: profile.id,
            subscription_id: sub.id,
            status: "confirmed",
            order_type: "subscription",
            subtotal: subtotalCents,
            total: subtotalCents,
            delivery_day: deliveryDay,
            delivery_address: data.address || null,
            delivery_city: data.city || null,
            delivery_zip: data.zip || null,
            delivery_date: deliveryDateStr,
            placed_at: deliveryDateIso,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single()

        if (!orderError && order) {
          const orderItems = pricedItems.map((item) => ({
            order_id: order.id,
            product_id: "cash-manual",
            product_name: item.product_name,
            size: item.size,
            quantity: item.quantity,
            price_cents: item.price_cents,
            created_at: new Date().toISOString(),
          }))
          await supabase.from("order_items").insert(orderItems)
        }
      }
    } else {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: profile.id,
          status: "confirmed",
          order_type: "one_time",
          subtotal: subtotalCents,
          total: subtotalCents,
          delivery_day: data.delivery_day || null,
          delivery_address: data.address || null,
          delivery_city: data.city || null,
          delivery_zip: data.zip || null,
          placed_at: new Date().toISOString(),
          delivery_date: data.delivery_date ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single()

      if (orderError) return { id: null, error: orderError.message }

      if (order) {
        const orderItems = pricedItems.map((item) => ({
          order_id: order.id,
          product_id: "cash-manual",
          product_name: item.product_name,
          size: item.size,
          quantity: item.quantity,
          price_cents: item.price_cents,
          created_at: new Date().toISOString(),
        }))
        const { error: itemsError } = await supabase.from("order_items").insert(orderItems)
        if (itemsError) return { id: null, error: itemsError.message }
      }
    }

    revalidatePath("/admin")
    return { id: profile.id, error: null }
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : "Failed to create customer" }
  }
}

export async function updateCashCustomer(
  customerId: string,
  data: Partial<{
    first_name: string
    last_name: string
    phone: string
    email: string
    address: string
    city: string
    state: string
    zip: string
    delivery_day: string
    delivery_instructions: string
    admin_notes: string
  }>
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase
      .from("profiles")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", customerId)
      .eq("is_cash_customer", true)

    if (error) return { error: error.message }
    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update customer" }
  }
}

// Edit an EXISTING cash-customer subscription's weekly items and/or delivery
// day. This updates the recurring template (subscriptions + subscription_items)
// that the delivery route is built from live each week — it does not touch
// already-created order rows. Use adminUpdateSubscriptionStatus (Subscriptions
// tab) or the cancel button in this flow to cancel the subscription itself.
export async function updateCashCustomerSubscription(
  subscriptionId: string,
  data: {
    delivery_day?: "thursday" | "friday"
    items?: { product_name: string; size: string; quantity: number }[]
  }
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("id, user_id")
      .eq("id", subscriptionId)
      .single()

    if (subError || !sub) return { error: "Subscription not found" }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_cash_customer")
      .eq("id", sub.user_id)
      .single()

    if (profileError || !profile?.is_cash_customer) {
      return { error: "This subscription does not belong to a cash customer" }
    }

    if (data.delivery_day) {
      const { error: dayError } = await supabase
        .from("subscriptions")
        .update({ delivery_day: data.delivery_day, updated_at: new Date().toISOString() })
        .eq("id", subscriptionId)
      if (dayError) return { error: dayError.message }
    }

    if (data.items) {
      if (data.items.length === 0) return { error: "At least one item is required." }

      const { error: deleteError } = await supabase
        .from("subscription_items")
        .delete()
        .eq("subscription_id", subscriptionId)
      if (deleteError) return { error: deleteError.message }

      const pricedItems = data.items.map((item) => ({
        ...item,
        price_cents: getCashSubscriptionPriceCents(item.product_name, item.size),
      }))

      const subItems = pricedItems.flatMap((item) =>
        Array.from({ length: item.quantity }, () => ({
          subscription_id: subscriptionId,
          product_name: item.product_name,
          size: item.size,
          quantity: 1,
          price_cents: item.price_cents,
          created_at: new Date().toISOString(),
        }))
      )
      const { error: itemsError } = await supabase.from("subscription_items").insert(subItems)
      if (itemsError) return { error: itemsError.message }
    }

    // Reflect the change immediately in the orders table for the next
    // upcoming delivery, instead of waiting on the daily cron
    // (run_cash_subscription_weekly_orders). Best-effort: if this fails,
    // the daily cron will still pick it up, so we don't fail the whole save.
    const { error: ensureError } = await supabase.rpc("ensure_cash_weekly_order_for_subscription", {
      p_subscription_id: subscriptionId,
    })
    if (ensureError) {
      console.error(`updateCashCustomerSubscription: failed to ensure weekly order for ${subscriptionId}:`, ensureError.message)
    }

    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update subscription" }
  }
}

export async function addOrderToCashCustomer(
  customerId: string,
  data: {
    delivery_day: string
    delivery_date?: string
    items: { product_name: string; size: string; quantity: number }[]
  }
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, address, city, state, zip")
      .eq("id", customerId)
      .eq("is_cash_customer", true)
      .single()

    if (profileError || !profile) return { error: "Cash customer not found" }

    const pricedItems = data.items.map(item => ({
      ...item,
      price_cents: getCashItemPriceCents(item.product_name, item.size),
    }))
    const subtotalCents = pricedItems.reduce((sum, item) => sum + item.price_cents * item.quantity, 0)

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: customerId,
        status: "confirmed",
        order_type: "one_time",
        subtotal: subtotalCents,
        total: subtotalCents,
        delivery_day: data.delivery_day,
        delivery_address: profile.address || null,
        delivery_city: profile.city || null,
        delivery_zip: profile.zip || null,
        placed_at: new Date().toISOString(),
        delivery_date: data.delivery_date ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (orderError) return { error: orderError.message }

    if (order && pricedItems.length > 0) {
      const orderItems = pricedItems.map((item) => ({
        order_id: order.id,
        product_id: "cash-manual",
        product_name: item.product_name,
        size: item.size,
        quantity: item.quantity,
        price_cents: item.price_cents,
        created_at: new Date().toISOString(),
      }))
      const { error: itemsError } = await supabase.from("order_items").insert(orderItems)
      if (itemsError) return { error: itemsError.message }
    }

    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add order" }
  }
}

export async function addSubscriptionToCashCustomer(
  customerId: string,
  data: {
    delivery_day: string
    delivery_date?: string
    items: { product_name: string; size: string; quantity: number }[]
  }
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, address, city, zip")
      .eq("id", customerId)
      .eq("is_cash_customer", true)
      .single()

    if (profileError || !profile) return { error: "Cash customer not found" }

    const deliveryDay = data.delivery_day as "thursday" | "friday"
    const nextDeliveryDate = computeNextDeliveryDate(deliveryDay)

    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .insert({
        user_id: customerId,
        status: "active",
        delivery_day: deliveryDay,
        skipped_dates: [],
        cancel_at_period_end: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (subError) return { error: subError.message }

    if (sub && data.items.length > 0) {
      const pricedItems = data.items.map((item) => ({
        ...item,
        price_cents: getCashSubscriptionPriceCents(item.product_name, item.size),
      }))

      const subItems = pricedItems.flatMap((item) =>
        Array.from({ length: item.quantity }, () => ({
          subscription_id: sub.id,
          product_name: item.product_name,
          size: item.size,
          quantity: 1,
          price_cents: item.price_cents,
          created_at: new Date().toISOString(),
        }))
      )
      const { error: itemsError } = await supabase.from("subscription_items").insert(subItems)
      if (itemsError) return { error: itemsError.message }

      const subtotalCents = pricedItems.reduce((sum, item) => sum + item.price_cents * item.quantity, 0)
      const deliveryDateStr = data.delivery_date ?? nextDeliveryDate
      const deliveryDateIso = new Date(deliveryDateStr + "T00:00:00").toISOString()

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: customerId,
          subscription_id: sub.id,
          status: "confirmed",
          order_type: "subscription",
          subtotal: subtotalCents,
          total: subtotalCents,
          delivery_day: deliveryDay,
          delivery_address: profile.address || null,
          delivery_city: profile.city || null,
          delivery_zip: profile.zip || null,
          delivery_date: deliveryDateStr,
          placed_at: deliveryDateIso,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single()

      if (!orderError && order) {
        const orderItems = pricedItems.map((item) => ({
          order_id: order.id,
          product_id: "cash-manual",
          product_name: item.product_name,
          size: item.size,
          quantity: item.quantity,
          price_cents: item.price_cents,
          created_at: new Date().toISOString(),
        }))
        await supabase.from("order_items").insert(orderItems)
      }
    }

    await supabase
      .from("profiles")
      .update({ delivery_day: data.delivery_day, updated_at: new Date().toISOString() })
      .eq("id", customerId)

    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add subscription" }
  }
}

// ---------------------------------------------------------------------------
// Delivery Route Ordering
// ---------------------------------------------------------------------------
export async function saveRouteOrder(
  orderedCustomerIds: string[],
  deliveryDay: "thursday" | "friday"
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    // Thursday and Friday routes have independent orderings (see migration
    // 018_add_friday_route_position). This used to always write
    // route_position regardless of which day's sheet was being reordered, so
    // a customer who ships on both days had their Thursday position silently
    // overwritten every time the Friday route was reordered, and vice versa.
    const column = deliveryDay === "friday" ? "route_position_friday" : "route_position"

    const updates = orderedCustomerIds.map((id, index) =>
      supabase
        .from("profiles")
        .update({ [column]: index, updated_at: new Date().toISOString() })
        .eq("id", id)
    )

    const results = await Promise.all(updates)
    const firstError = results.find((r) => r.error)
    if (firstError?.error) return { error: firstError.error.message }

    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save route order" }
  }
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
export async function getAdminOrders(limit = 200): Promise<{ data: AdminOrder[]; error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    const { data: orders, error } = await supabase
      .from("orders")
      .select(`*, order_items (*)`)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) return { data: [], error: error.message }

    const userIds = [...new Set((orders ?? []).map((o) => o.user_id))]
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, is_cash_customer")
      .in("id", userIds)

    const profileMap = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id, p])
    )

    const enriched = (orders ?? []).map((o) => ({
      ...o,
      customer_name: profileMap[o.user_id]
        ? ([profileMap[o.user_id]?.first_name, profileMap[o.user_id]?.last_name].filter(Boolean).join(" ") || "Unknown")
        : "Deleted Customer",
      customer_email: profileMap[o.user_id]?.email || "",
      customer_phone: profileMap[o.user_id]?.phone || "",
      is_cash_customer: profileMap[o.user_id]?.is_cash_customer ?? false,
      order_items: o.order_items ?? [],
    }))

    return { data: enriched as AdminOrder[], error: null }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : "Failed to load orders" }
  }
}

export async function updateOrderDeliveryState(
  orderId: string,
  deliveryState: string
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase
      .from("orders")
      .update({ delivery_state: deliveryState, updated_at: new Date().toISOString() })
      .eq("id", orderId)

    if (error) return { error: error.message }
    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update delivery state" }
  }
}

export async function updateOrderStatus(
  orderId: string,
  status: string
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase
      .from("orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", orderId)

    if (error) return { error: error.message }
    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update order status" }
  }
}

export async function updateOrderAdminNotes(
  orderId: string,
  notes: string
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase
      .from("orders")
      .update({ admin_notes: notes, updated_at: new Date().toISOString() })
      .eq("id", orderId)

    if (error) return { error: error.message }
    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save notes" }
  }
}

export async function cancelAndRefundOrder(
  orderId: string
): Promise<{ refunded: boolean; refundId: string | null; error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, status, order_type, total, stripe_payment_intent_id, user_id, order_code, delivery_date, order_items(product_name, quantity)")
      .eq("id", orderId)
      .single()

    if (fetchError || !order) {
      return { refunded: false, refundId: null, error: fetchError?.message ?? "Order not found" }
    }

    if (order.status === "cancelled") {
      return { refunded: false, refundId: null, error: null }
    }

    if (order.order_type !== "one_time") {
      return { refunded: false, refundId: null, error: "Only one-time orders can be cancelled via this action" }
    }

    let stripeRefundId: string | null = null
    let refundAmountCents: number | null = null
    let didRefund = false

    if (order.stripe_payment_intent_id) {
      try {
        const refund = await stripe.refunds.create({
          payment_intent: order.stripe_payment_intent_id,
          reason: "requested_by_customer",
        })
        stripeRefundId = refund.id
        refundAmountCents = refund.amount
        didRefund = true
      } catch (stripeErr: unknown) {
        const msg = stripeErr instanceof Error ? stripeErr.message : "Stripe refund failed"
        return { refunded: false, refundId: null, error: msg }
      }
    }

    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        delivery_state: "cancelled",
        cancelled_at: now,
        ...(stripeRefundId    ? { stripe_refund_id: stripeRefundId }       : {}),
        ...(refundAmountCents ? { refund_amount_cents: refundAmountCents } : {}),
        updated_at: now,
      })
      .eq("id", orderId)

    if (updateError) return { refunded: didRefund, refundId: stripeRefundId, error: updateError.message }

    // Best-effort confirmation email — a failure here shouldn't fail the
    // cancellation itself, since the order was already updated successfully.
    if (order.user_id) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name, email")
          .eq("id", order.user_id)
          .single()

        const customerEmail = profile?.email ?? null
        if (customerEmail) {
          const customerName =
            [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || "there"
          const orderRef = order.order_code ?? order.id.slice(-5).toUpperCase()
          const deliveryDateLabel = order.delivery_date
            ? new Date(order.delivery_date + "T12:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })
            : "unknown date"
          const itemsSummary =
            (order.order_items ?? [])
              .map((i: { product_name: string; quantity: number }) => `${i.product_name} × ${i.quantity}`)
              .join(", ") || "—"

          await sendOrderCancelledEmail({
            customerEmail,
            customerName,
            orderCode: orderRef,
            totalCents: order.total,
            deliveryDateLabel,
            itemsSummary,
            refunded: didRefund,
            refundAmountCents,
          })
        }
      } catch (emailErr) {
        console.error("[cancelAndRefundOrder] Failed to send confirmation email:", emailErr)
      }
    }

    revalidatePath("/admin")
    return { refunded: didRefund, refundId: stripeRefundId, error: null }
  } catch (e) {
    return { refunded: false, refundId: null, error: e instanceof Error ? e.message : "Failed to cancel order" }
  }
}

// ---------------------------------------------------------------------------
// Refund a single subscription delivery (e.g. customer wasn't home / out of
// town for the week). Refunds the charge for THAT week's order only — the
// underlying subscription is left untouched and keeps running for future
// weeks. This is deliberately separate from cancelAndRefundOrder above,
// which is one-time-order-only and cancels the whole order.
//
// Relies on orders.stripe_payment_intent_id, which is populated by the
// invoice.payment_succeeded webhook handler once Stripe actually charges
// that week's invoice (invoice.upcoming, which creates the order row
// earlier, fires before the charge happens and has no payment_intent yet —
// see app/api/stripe/webhook/route.ts).
// ---------------------------------------------------------------------------
export async function refundSubscriptionOrder(
  orderId: string
): Promise<{ refunded: boolean; refundId: string | null; error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select(
        "id, status, order_type, total, stripe_payment_intent_id, user_id, order_code, delivery_date, order_items(product_name, quantity)"
      )
      .eq("id", orderId)
      .single()

    if (fetchError || !order) {
      return { refunded: false, refundId: null, error: fetchError?.message ?? "Order not found" }
    }

    if (order.order_type !== "subscription") {
      return {
        refunded: false,
        refundId: null,
        error: "This action is for subscription delivery orders only. Use Cancel & Refund for one-time orders.",
      }
    }

    if (order.status === "cancelled") {
      return { refunded: false, refundId: null, error: "This delivery has already been cancelled or refunded." }
    }

    if (!order.stripe_payment_intent_id) {
      return {
        refunded: false,
        refundId: null,
        error:
          "No payment on record for this delivery yet. Stripe charges the card a few hours before delivery — if it hasn't happened yet, there's nothing to refund. If it's already been charged, check Supabase/Stripe directly before retrying.",
      }
    }

    let stripeRefundId: string | null = null
    let refundAmountCents: number | null = null

    try {
      const refund = await stripe.refunds.create({
        payment_intent: order.stripe_payment_intent_id,
        reason: "requested_by_customer",
      })
      stripeRefundId = refund.id
      refundAmountCents = refund.amount
    } catch (stripeErr: unknown) {
      const msg = stripeErr instanceof Error ? stripeErr.message : "Stripe refund failed"
      return { refunded: false, refundId: null, error: msg }
    }

    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        delivery_state: "cancelled",
        cancelled_at: now,
        stripe_refund_id: stripeRefundId,
        refund_amount_cents: refundAmountCents,
        updated_at: now,
      })
      .eq("id", orderId)

    if (updateError) return { refunded: true, refundId: stripeRefundId, error: updateError.message }

    // Best-effort confirmation email — a failure here shouldn't fail the
    // refund itself, since the order was already updated successfully.
    if (order.user_id) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name, email")
          .eq("id", order.user_id)
          .single()

        const customerEmail = profile?.email ?? null
        if (customerEmail) {
          const customerName =
            [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || "there"
          const orderRef = order.order_code ?? order.id.slice(-5).toUpperCase()
          const deliveryDateLabel = order.delivery_date
            ? new Date(order.delivery_date + "T12:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })
            : "unknown date"
          const itemsSummary =
            (order.order_items ?? [])
              .map((i: { product_name: string; quantity: number }) => `${i.product_name} × ${i.quantity}`)
              .join(", ") || "—"

          await sendOrderCancelledEmail({
            customerEmail,
            customerName,
            orderCode: orderRef,
            totalCents: order.total,
            deliveryDateLabel,
            itemsSummary,
            refunded: true,
            refundAmountCents,
          })
        }
      } catch (emailErr) {
        console.error("[refundSubscriptionOrder] Failed to send confirmation email:", emailErr)
      }
    }

    revalidatePath("/admin")
    return { refunded: true, refundId: stripeRefundId, error: null }
  } catch (e) {
    return { refunded: false, refundId: null, error: e instanceof Error ? e.message : "Failed to refund delivery" }
  }
}

// ---------------------------------------------------------------------------
// Decline a refund request without cancelling/refunding the order.
// Saves the (optional) reason to orders.admin_notes, emails the customer,
// and marks the originating message resolved.
// ---------------------------------------------------------------------------
export async function declineRefundRequest(
  orderId: string,
  messageId: string,
  reason: string
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, order_code, total, delivery_date, admin_notes, user_id, order_items(product_name, quantity)")
      .eq("id", orderId)
      .single()

    if (orderError || !order) {
      return { error: orderError?.message ?? "Order not found" }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("id", order.user_id)
      .single()

    const customerEmail = profile?.email ?? null
    const customerName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || "there"

    const orderRef = order.order_code ?? order.id.slice(-5).toUpperCase()
    const deliveryDateLabel = order.delivery_date
      ? new Date(order.delivery_date + "T12:00:00").toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      : "unknown date"
    const itemsSummary =
      (order.order_items ?? [])
        .map((i: { product_name: string; quantity: number }) => `${i.product_name} × ${i.quantity}`)
        .join(", ") || "—"

    const trimmedReason = reason.trim()
    const now = new Date().toISOString()

    // Save the reason to admin_notes (appended, not overwritten, so it doesn't
    // clobber any existing delivery/route notes on the order)
    if (trimmedReason) {
      const notePrefix = order.admin_notes ? `${order.admin_notes}\n\n` : ""
      const { error: notesError } = await supabase
        .from("orders")
        .update({
          admin_notes: `${notePrefix}[${now.slice(0, 10)}] Refund request declined: ${trimmedReason}`,
          updated_at: now,
        })
        .eq("id", orderId)

      if (notesError) return { error: notesError.message }
    }

    // Best-effort email — a failure here shouldn't block the decline itself
    if (customerEmail) {
      try {
        await sendRefundRequestDeclinedEmail({
          customerEmail,
          customerName,
          orderCode: orderRef,
          totalCents: order.total,
          deliveryDateLabel,
          itemsSummary,
          reason: trimmedReason || undefined,
        })
      } catch (emailErr) {
        console.error("[declineRefundRequest] Failed to send decline email:", emailErr)
      }
    }

    const { error: statusError } = await supabase
      .from("messages")
      .update({ status: "resolved", updated_at: now })
      .eq("id", messageId)

    if (statusError) return { error: statusError.message }

    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to decline request" }
  }
}

export async function deleteOrphanedOrder(
  orderId: string
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, user_id")
      .eq("id", orderId)
      .single()

    if (fetchError || !order) return { error: "Order not found" }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", order.user_id)
      .maybeSingle()

    if (profile) {
      return { error: "Cannot delete — customer profile still exists. Use cancel instead." }
    }

    const { error: itemsError } = await supabase
      .from("order_items")
      .delete()
      .eq("order_id", orderId)

    if (itemsError) return { error: itemsError.message }

    const { error: orderError } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId)

    if (orderError) return { error: orderError.message }

    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete order" }
  }
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------
export async function getAdminSubscriptions(): Promise<{ data: AdminSubscription[]; error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    const { data: subs, error } = await supabase
      .from("subscriptions")
      .select(`*, subscription_items (*)`)
      .order("created_at", { ascending: false })

    if (error) return { data: [], error: error.message }

    const userIds = [...new Set((subs ?? []).map((s) => s.user_id))]
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("id", userIds)

    const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

    const enriched = (subs ?? []).filter((s) => profileMap[s.user_id]).map((s) => ({
      ...s,
      customer_name: [profileMap[s.user_id]?.first_name, profileMap[s.user_id]?.last_name]
        .filter(Boolean)
        .join(" ") || "Unknown",
      customer_email: profileMap[s.user_id]?.email || "",
      subscription_items: s.subscription_items ?? [],
      skipped_dates: ((s.skipped_dates as string[] | null) ?? []).map((d: string) => d.length > 10 ? d.slice(0, 10) : d),
    }))

    return { data: enriched as AdminSubscription[], error: null }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : "Failed to load subscriptions" }
  }
}

export async function adminSkipWeeklyDelivery(
  subscriptionId: string,
  skipDates: string[]
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    if (!skipDates || skipDates.length === 0) {
      return { error: "Please select at least one delivery date to skip." }
    }

    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("id, skipped_dates")
      .eq("id", subscriptionId)
      .single()

    if (subError || !sub) return { error: "Subscription not found" }

    const current: string[] = ((sub.skipped_dates as string[] | null) ?? [])
      .map((d: string) => d.length > 10 ? d.slice(0, 10) : d)

    const merged = [...new Set([...current, ...skipDates])].sort()

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({ skipped_dates: merged, updated_at: new Date().toISOString() })
      .eq("id", subscriptionId)

    if (updateError) return { error: updateError.message }

    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to skip delivery" }
  }
}

export async function adminUnskipWeeklyDelivery(
  subscriptionId: string,
  deliveryDate: string
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("id, skipped_dates")
      .eq("id", subscriptionId)
      .single()

    if (subError || !sub) return { error: "Subscription not found" }

    const current: string[] = ((sub.skipped_dates as string[] | null) ?? [])
      .map((d: string) => d.length > 10 ? d.slice(0, 10) : d)

    const newSkipped = current.filter((d) => d !== deliveryDate)

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({ skipped_dates: newSkipped, updated_at: new Date().toISOString() })
      .eq("id", subscriptionId)

    if (updateError) return { error: updateError.message }

    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to unskip delivery" }
  }
}

export async function adminUpdateSubscriptionStatus(
  subscriptionId: string,
  status: "active" | "paused" | "cancelled"
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase
      .from("subscriptions")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", subscriptionId)

    if (error) return { error: error.message }
    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update subscription" }
  }
}

export async function adminCancelSubscriptionOnStripe(
  subscriptionId: string
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("id", subscriptionId)
      .single()

    if (sub?.stripe_subscription_id) {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id)
    }

    const { error } = await supabase
      .from("subscriptions")
      .update({
        status: "cancelled",
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)

    if (error) return { error: error.message }
    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to cancel subscription" }
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
export async function getAdminMessages(): Promise<{ data: AdminMessage[]; error: string | null }> {
  try {
    const { supabase } = await requireAdmin()
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) return { data: [], error: error.message }
    return { data: data as AdminMessage[], error: null }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : "Failed to load messages" }
  }
}

export async function updateMessageStatus(
  messageId: string,
  status: "unread" | "read" | "resolved"
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()
    const { error } = await supabase
      .from("messages")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", messageId)

    if (error) return { error: error.message }
    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update message" }
  }
}

// ---------------------------------------------------------------------------
// Delivery management
// ---------------------------------------------------------------------------
export async function getDeliveryList(deliveryDay: "thursday" | "friday", deliveryDate: string): Promise<{
  data: DeliveryStop[]
  error: string | null
}> {
  try {
    const { supabase } = await requireAdmin()

    // Include a subscription if EITHER it isn't cancelling, OR it is
    // cancelling but this specific date is its promised final delivery
    // (cancelSubscriptionAtPeriodEnd sets cancel_at_period_end=true
    // permanently once a cancellation is scheduled — including the
    // "cutoff already passed, this delivery is locked in and still ships"
    // case, where final_delivery_date is set to this exact date). Filtering
    // out ALL cancel_at_period_end=true rows here would silently drop that
    // customer's already-paid, promised-to-ship final delivery from the
    // route sheet — the driver would never know to go there.
    const { data: subs, error: subsError } = await supabase
      .from("subscriptions")
      .select(`id, user_id, status, skipped_dates, stripe_subscription_id, final_delivery_date, subscription_items (product_name, size, quantity)`)
      .in("status", ["active"])
      .eq("delivery_day", deliveryDay)
      .or(`cancel_at_period_end.eq.false,final_delivery_date.eq.${deliveryDate}`)

    if (subsError) return { data: [], error: subsError.message }

    const { data: oneTimeOrders, error: ordersError } = await supabase
      .from("orders")
      .select(`id, user_id, delivery_address, delivery_city, delivery_zip, placed_at, delivery_date, order_items (product_name, size, quantity)`)
      .eq("delivery_day", deliveryDay)
      .eq("order_type", "one_time")
      .eq("status", "confirmed")
      .not("delivery_state", "eq", "delivered")
      .eq("delivery_date", deliveryDate)

    if (ordersError) return { data: [], error: ordersError.message }

    const subUserIds = (subs ?? []).map((s) => s.user_id)
    const orderUserIds = (oneTimeOrders ?? []).map((o) => o.user_id)
    const allUserIds = [...new Set([...subUserIds, ...orderUserIds])]

    const { data: profiles } = allUserIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name, address, city, zip, delivery_instructions, phone, is_cash_customer, route_position, route_position_friday, admin_notes")
          .in("id", allUserIds)
      : { data: [] }

    const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

    // Thursday and Friday routes have independent manual orderings (see
    // migration 018_add_friday_route_position and saveRouteOrder above).
    // Both partial-stop builders below need "this profile's position on
    // THIS call's route sheet" — pick the column once here rather than
    // repeating the ternary at each of the two call sites.
    const routePositionFor = (
      p: { route_position: number | null; route_position_friday: number | null } | undefined
    ): number | null =>
      deliveryDay === "friday" ? (p?.route_position_friday ?? null) : (p?.route_position ?? null)

    type PartialStop = {
      customerId: string
      customerName: string
      customerPhone: string | null
      address: string
      city: string
      zip: string
      deliveryInstructions: string | null
      adminNotes: string | null
      items: { name: string; quantity: number; size: string }[]
      sourceId: string
      isCashCustomer: boolean
      routePosition: number | null
      isOneTime: boolean
    }

    const allPartialStops: PartialStop[] = []

    ;(subs ?? [])
      .filter((s) => {
        const profile = profileMap[s.user_id]
        if (!profile?.address) return false

        // Security: only trust subscriptions that are backed by a real Stripe
        // subscription OR belong to a verified cash customer. Without this, a
        // technical user could insert their own row into `subscriptions` with
        // status = 'active' (the RLS insert policy allows self-owned rows) and
        // appear on the delivery route without ever paying. Cash customers
        // legitimately have a null stripe_subscription_id, but the
        // `is_cash_customer` flag is admin-only (enforced by the
        // protect_privileged_profile_columns trigger), so it can't be spoofed.
        const isStripeBacked = !!s.stripe_subscription_id
        const isCashCustomer = profile?.is_cash_customer ?? false
        if (!isStripeBacked && !isCashCustomer) return false

        const skipDates: string[] = (s.skipped_dates ?? []).map((d: string) =>
          d.length > 10 ? d.slice(0, 10) : d
        )
        return !skipDates.includes(deliveryDate)
      })
      .forEach((s) => {
        const p = profileMap[s.user_id]
        allPartialStops.push({
          customerId: s.user_id,
          customerName: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Unknown",
          customerPhone: p?.phone ?? null,
          address: p?.address ?? "",
          city: p?.city ?? "",
          zip: p?.zip ?? "",
          deliveryInstructions: p?.delivery_instructions ?? null,
          adminNotes: p?.admin_notes ?? null,
          items: (s.subscription_items ?? []).map((i: { product_name: string | null; size: string; quantity: number }) => ({
            name: normalizeProductName(i.product_name, i.size),
            quantity: i.quantity,
            size: i.size,
          })),
          sourceId: s.id,
          isCashCustomer: p?.is_cash_customer ?? false,
          routePosition: routePositionFor(p),
          isOneTime: false,
        })
      })

    ;(oneTimeOrders ?? [])
      .filter((o) => profileMap[o.user_id] && (profileMap[o.user_id]?.address || o.delivery_address))
      .forEach((o) => {
        const p = profileMap[o.user_id]
        allPartialStops.push({
          customerId: o.user_id,
          customerName: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Unknown",
          customerPhone: p?.phone ?? null,
          address: o.delivery_address ?? p?.address ?? "",
          city: o.delivery_city ?? p?.city ?? "",
          zip: o.delivery_zip ?? p?.zip ?? "",
          deliveryInstructions: p?.delivery_instructions ?? null,
          adminNotes: p?.admin_notes ?? null,
          items: (o.order_items ?? []).map((i: { product_name: string | null; size: string; quantity: number }) => ({
            name: normalizeProductName(i.product_name, i.size),
            quantity: i.quantity,
            size: i.size,
          })),
          sourceId: o.id,
          isCashCustomer: p?.is_cash_customer ?? false,
          routePosition: routePositionFor(p),
          isOneTime: true,
        })
      })

    const stopMap = new Map<string, DeliveryStop>()

    for (const partial of allPartialStops) {
      const existing = stopMap.get(partial.customerId)
      if (!existing) {
        stopMap.set(partial.customerId, {
          customerId: partial.customerId,
          customerName: partial.customerName,
          customerPhone: partial.customerPhone,
          address: partial.address,
          city: partial.city,
          zip: partial.zip,
          deliveryInstructions: partial.deliveryInstructions,
          adminNotes: partial.adminNotes,
          items: [...partial.items],
          subscriptionId: partial.sourceId,
          sourceIds: [partial.sourceId],
          isCashCustomer: partial.isCashCustomer,
          routePosition: partial.routePosition,
          isOneTime: partial.isOneTime,
          hasSub: !partial.isOneTime,
          hasOneTime: partial.isOneTime,
        })
      } else {
        existing.items.push(...partial.items)
        existing.sourceIds.push(partial.sourceId)
        if (!partial.isOneTime) existing.hasSub = true
        if (partial.isOneTime) existing.hasOneTime = true
        existing.isOneTime = !existing.hasSub
      }
    }

    const list: DeliveryStop[] = Array.from(stopMap.values())

    list.sort((a, b) => {
      if (a.routePosition !== null && b.routePosition !== null) return a.routePosition - b.routePosition
      if (a.routePosition !== null) return -1
      if (b.routePosition !== null) return 1
      return a.customerName.localeCompare(b.customerName)
    })

    return { data: list, error: null }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : "Failed to load delivery list" }
  }
}