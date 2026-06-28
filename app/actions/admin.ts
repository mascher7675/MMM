// app/actions/admin.ts
"use server"

import { createClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { revalidatePath } from "next/cache"
import { PRODUCTS, normalizeProductName } from "@/lib/products"
import { computeNextDeliveryDate } from "@/lib/delivery-utils"


// ---------------------------------------------------------------------------
// Price helpers
// Resolve price_cents by normalizing the name → canonical product lookup.
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
  admin_notes: string | null
  created_at: string
}

export interface AdminOrder {
  id: string
  order_code: string | null
  user_id: string
  status: string
  order_type: string
  subtotal: number
  total: number
  delivery_day: string | null
  delivery_address: string | null
  delivery_city: string | null
  delivery_zip: string | null
  delivery_state: string | null
  admin_notes: string | null
  placed_at: string | null
  delivery_date: string | null
  created_at: string
  stripe_session_id: string | null
  stripe_payment_intent_id: string | null
  stripe_refund_id?: string | null
  refund_amount_cents?: number | null
  cancelled_at?: string | null
  customer_name?: string
  customer_email?: string
  customer_phone?: string
  is_cash_customer?: boolean
  subscription_next_delivery_date?: string | null
  subscription_final_delivery_date?: string | null
  subscription_cancel_at_period_end?: boolean | null
  // All 4 delivery dates stored explicitly — updated when user changes delivery day
  stripe_subscription_id?: string | null
  delivery_logs: SubscriptionDeliveryLog[]
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
  delivery_date: string   // YYYY-MM-DD
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
  /** All subscription/order IDs contributing to this stop */
  sourceIds: string[]
  isCashCustomer: boolean
  routePosition: number | null
  /** true if ALL sources are one-time orders (no subscription) */
  isOneTime: boolean
  /** true if stop contains at least one subscription */
  hasSub: boolean
  /** true if stop contains at least one one-time order */
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
      // Orders placed in last 7 days
      supabase
        .from("orders")
        .select("id,total,order_type")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      // All-time revenue
      supabase.from("orders").select("total").eq("status", "confirmed"),
    ])

    const weeklyRevenue = (ordersThisWeek.data ?? []).reduce((s, o) => s + (o.total ?? 0), 0)
    const allTimeRevenue = (revenueResult.data ?? []).reduce((s, o) => s + (o.total ?? 0), 0)

    return {
      totalCustomers: totalCustomers ?? 0,
      activeSubscriptions: activeSubscriptions ?? 0,
      totalOrders: totalOrders ?? 0,
      unreadMessages: unreadMessages ?? 0,
      weeklyRevenue,
      allTimeRevenue,
      weeklyOrders: ordersThisWeek.data?.length ?? 0,
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
    const { supabase } = await requireAdmin()
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

// ---------------------------------------------------------------------------
// Cash Customer Management
// ---------------------------------------------------------------------------

/**
 * Creates a cash-only customer profile. These customers have no Supabase
 * auth account — we create a profile row with a generated UUID. They are
 * tracked for admin/delivery purposes only.
 */
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
  delivery_date?: string  // specific date for one-time orders (YYYY-MM-DD)
  delivery_instructions?: string
  admin_notes?: string
  customer_type: "subscription" | "one_time"
  items: { product_name: string; size: string; quantity: number }[]
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    // Generate a UUID for the profile — this customer has no auth.users row
    const { data: uuidRow } = await supabase.rpc("gen_random_uuid" as never) as { data: string | null }
    // Fallback: use crypto if RPC not available
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
        // Expand quantity > 1 into individual rows so customers can swap each bottle independently.
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

        // Create a confirmed order for the first delivery
        const deliveryDateIso = data.delivery_date
          ? new Date(data.delivery_date + "T00:00:00").toISOString()
          : new Date(nextDeliveryDate + "T00:00:00").toISOString()

        const { data: order, error: orderError } = await supabase
          .from("orders")
          .insert({
            user_id: profile.id,
            status: "confirmed",
            order_type: "subscription",
            subtotal: subtotalCents,
            total: subtotalCents,
            delivery_day: deliveryDay,
            delivery_address: data.address || null,
            delivery_city: data.city || null,
            delivery_zip: data.zip || null,
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
      // one_time
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
          // delivery_state is the delivery status field (pending/delivered/etc.)
          // — do NOT set it to the US state abbreviation; let it default to 'pending'
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

/**
 * Updates a cash customer's profile info and optionally their admin notes.
 */
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

/**
 * Updates the admin_notes field for any customer (cash or online).
 */
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

/**
 * Fetches all orders and subscriptions for a cash customer.
 */
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

/**
 * Deletes a cash customer profile and their subscription/items (cascade).
 * Only works on is_cash_customer = true rows for safety.
 */
export async function deleteCashCustomer(
  customerId: string
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

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

/**
 * Adds a new one-time order to an existing cash customer.
 */
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

    // Verify the customer is a cash customer
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, address, city, state, zip")
      .eq("id", customerId)
      .eq("is_cash_customer", true)
      .single()

    if (profileError || !profile) return { error: "Cash customer not found" }

    const deliveryDateIso = data.delivery_date
      ? new Date(data.delivery_date + "T00:00:00").toISOString()
      : new Date().toISOString()

    // Calculate line item prices and order total
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
        // delivery_state is the delivery status field (pending/delivered/etc.)
        // — do NOT set it to the US state abbreviation; let it default to 'pending'
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

/**
 * Adds a recurring subscription to an existing cash customer.
 * If they already have an active subscription, this adds an additional one.
 * Also creates a confirmed order for the first delivery.
 */
export async function addSubscriptionToCashCustomer(
  customerId: string,
  data: {
    delivery_day: string
    delivery_date?: string  // specific date for first delivery (YYYY-MM-DD)
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
      // Use subscription price ($48 / $72), not one-time price
      const pricedItems = data.items.map((item) => ({
        ...item,
        price_cents: getCashSubscriptionPriceCents(item.product_name, item.size),
      }))

      // Save subscription items — expand quantity > 1 into individual rows so each bottle can be swapped independently.
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

      // Create a confirmed order for the first delivery
      const subtotalCents = pricedItems.reduce(
        (sum, item) => sum + item.price_cents * item.quantity,
        0
      )
      const deliveryDateIso = data.delivery_date
        ? new Date(data.delivery_date + "T00:00:00").toISOString()
        : new Date(nextDeliveryDate + "T00:00:00").toISOString()

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: customerId,
          status: "confirmed",
          order_type: "subscription",
          subtotal: subtotalCents,
          total: subtotalCents,
          delivery_day: deliveryDay,
          delivery_address: profile.address || null,
          delivery_city: profile.city || null,
          delivery_zip: profile.zip || null,
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

    // Update the profile's delivery_day to the new subscription day
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

/**
 * Saves the admin-arranged route order. Accepts an array of customer IDs
 * in the desired stop order and writes their position index to profiles.
 */
export async function saveRouteOrder(
  orderedCustomerIds: string[]
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    const updates = orderedCustomerIds.map((id, index) =>
      supabase
        .from("profiles")
        .update({ route_position: index, updated_at: new Date().toISOString() })
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
export async function getAdminOrders(limit = 50): Promise<{ data: AdminOrder[]; error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    const { data: orders, error } = await supabase
      .from("orders")
      .select(`
        *,
        order_items (*)
      `)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) return { data: [], error: error.message }

    // Attach customer names by joining profiles separately
    const userIds = [...new Set((orders ?? []).map((o) => o.user_id))]
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, is_cash_customer")
      .in("id", userIds)

    const profileMap = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id, p])
    )

    // Fetch subscriptions to get delivery info and current items
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("user_id, stripe_subscription_id, delivery_day, final_delivery_date, cancel_at_period_end, status, subscription_items(id, product_id, product_name, size, quantity, price_cents)")
      .in("user_id", userIds)

    // Map user_id -> subscription info (prefer active, fall back to most recent)
    type SubMapEntry = {
      final_delivery_date: string | null
      cancel_at_period_end: boolean
      delivery_day: string | null
      stripe_subscription_id: string | null
      subscription_items: { id: string; product_id: string | null; product_name: string | null; size: string; quantity: number; price_cents: number | null }[]
    }
    const subMap: Record<string, SubMapEntry> = {}
    for (const s of subs ?? []) {
      const existing = subMap[s.user_id]
      // Prefer active subscriptions over cancelled/inactive
      if (!existing || (s.status === "active" && existing.cancel_at_period_end !== false)) {
        subMap[s.user_id] = {
          final_delivery_date: s.final_delivery_date,
          cancel_at_period_end: s.cancel_at_period_end ?? false,
          delivery_day: s.delivery_day ?? null,
          stripe_subscription_id: (s as { stripe_subscription_id?: string | null }).stripe_subscription_id ?? null,
          subscription_items: (s.subscription_items ?? []) as SubMapEntry["subscription_items"],
        }
      }
    }

    // Fetch delivery logs for all subscription orders
    const subOrderIds = (orders ?? [])
      .filter((o) => o.order_type === "subscription")
      .map((o) => o.id)

    let logsMap: Record<string, SubscriptionDeliveryLog[]> = {}
    if (subOrderIds.length > 0) {
      const { data: logs } = await supabase
        .from("subscription_delivery_logs")
        .select("*")
        .in("order_id", subOrderIds)
        .order("delivery_date", { ascending: true })

      for (const log of logs ?? []) {
        if (!logsMap[log.order_id]) logsMap[log.order_id] = []
        logsMap[log.order_id].push(log as SubscriptionDeliveryLog)
      }
    }

    const enriched = (orders ?? []).map((o) => ({
      ...o,
      customer_name: profileMap[o.user_id]
        ? ([profileMap[o.user_id]?.first_name, profileMap[o.user_id]?.last_name].filter(Boolean).join(" ") || "Unknown")
        : "Deleted Customer",
      customer_email: profileMap[o.user_id]?.email || "",
      customer_phone: profileMap[o.user_id]?.phone || "",
      is_cash_customer: profileMap[o.user_id]?.is_cash_customer ?? false,
      // For subscription orders, use live subscription_items so milk swaps are reflected.
      // Fall back to order_items snapshot if no subscription found (e.g. cancelled sub).
      order_items: o.order_type === "subscription" && (subMap[o.user_id]?.subscription_items ?? []).length > 0
        ? (subMap[o.user_id].subscription_items as { id: string; product_id: string; product_name: string; size: string; quantity: number; price_cents: number }[])
        : (o.order_items ?? []),
      delivery_logs: logsMap[o.id] ?? [],
      subscription_next_delivery_date: o.order_type === "subscription" && subMap[o.user_id]?.delivery_day
        ? computeNextDeliveryDate(subMap[o.user_id].delivery_day as "thursday" | "friday")
        : null,
      subscription_final_delivery_date: o.order_type === "subscription" ? (subMap[o.user_id]?.final_delivery_date ?? null) : null,
      subscription_cancel_at_period_end: o.order_type === "subscription" ? (subMap[o.user_id]?.cancel_at_period_end ?? null) : null,
      stripe_subscription_id: o.order_type === "subscription" ? (subMap[o.user_id]?.stripe_subscription_id ?? null) : null,
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

// ---------------------------------------------------------------------------
// Cancel & Refund a one-time order (admin only)
// ---------------------------------------------------------------------------
/**
 * Cancels a one-time order and issues a full Stripe refund if a payment intent
 * exists. For cash/manual orders (no Stripe payment), only the DB record is
 * updated. Safe to call on already-cancelled orders — it will no-op gracefully.
 *
 * What it does:
 *   1. Loads the order to verify it exists and is a one-time order
 *   2. If stripe_payment_intent_id is set → issues a full refund via Stripe
 *   3. Marks order:  status = 'cancelled', delivery_state = 'cancelled',
 *                    cancelled_at = now, stripe_refund_id (if refunded),
 *                    refund_amount_cents (if refunded)
 */
export async function cancelAndRefundOrder(
  orderId: string
): Promise<{ refunded: boolean; refundId: string | null; error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    // ── 1. Fetch the order ──────────────────────────────────────────────────
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, status, order_type, total, stripe_payment_intent_id, is_cash_customer")
      .eq("id", orderId)
      .single()

    if (fetchError || !order) {
      return { refunded: false, refundId: null, error: fetchError?.message ?? "Order not found" }
    }

    // Already cancelled — no-op
    if (order.status === "cancelled") {
      return { refunded: false, refundId: null, error: null }
    }

    // Only one-time orders are eligible for this flow
    if (order.order_type !== "one_time") {
      return { refunded: false, refundId: null, error: "Only one-time orders can be cancelled via this action" }
    }

    // ── 2. Issue Stripe refund if applicable ────────────────────────────────
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
        refundAmountCents = refund.amount  // Stripe returns amount in cents
        didRefund = true
      } catch (stripeErr: unknown) {
        const msg = stripeErr instanceof Error ? stripeErr.message : "Stripe refund failed"
        return { refunded: false, refundId: null, error: msg }
      }
    }

    // ── 3. Update the order record ──────────────────────────────────────────
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

    revalidatePath("/admin")
    return { refunded: didRefund, refundId: stripeRefundId, error: null }
  } catch (e) {
    return { refunded: false, refundId: null, error: e instanceof Error ? e.message : "Failed to cancel order" }
  }
}

// ---------------------------------------------------------------------------
// Delete an orphaned order (one whose user profile no longer exists)
// ---------------------------------------------------------------------------
/**
 * Permanently deletes an order and its order_items when the associated
 * user profile no longer exists (i.e. the customer was deleted).
 * Refuses to delete if the profile still exists — use cancelAndRefundOrder instead.
 */
export async function deleteOrphanedOrder(
  orderId: string
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()

    // Fetch the order to get user_id
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, user_id")
      .eq("id", orderId)
      .single()

    if (fetchError || !order) return { error: "Order not found" }

    // Safety check: refuse if the profile still exists
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", order.user_id)
      .maybeSingle()

    if (profile) {
      return { error: "Cannot delete — customer profile still exists. Use cancel instead." }
    }

    // Delete order_items first (FK constraint), then the order
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
// Subscription delivery log — upsert one row per order+delivery_date
// ---------------------------------------------------------------------------
export async function upsertSubscriptionDeliveryLog(
  orderId: string,
  deliveryDate: string,  // YYYY-MM-DD
  deliveryState: string,
  adminNotes?: string
): Promise<{ error: string | null }> {
  try {
    const { supabase } = await requireAdmin()
    const now = new Date().toISOString()

    const { error } = await supabase
      .from("subscription_delivery_logs")
      .upsert(
        {
          order_id: orderId,
          delivery_date: deliveryDate,
          delivery_state: deliveryState,
          admin_notes: adminNotes ?? null,
          updated_at: now,
        },
        { onConflict: "order_id,delivery_date" }
      )

    if (error) return { error: error.message }
    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save delivery log" }
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

// ---------------------------------------------------------------------------
// Admin: Skip one or more weekly deliveries for a subscription
//
// Adds dates to skipped_dates array in Supabase.
// No Stripe interaction needed — with weekly billing, skipping a week
// automatically means no charge for that week.
// ---------------------------------------------------------------------------
export async function adminSkipWeeklyDelivery(
  subscriptionId: string,
  skipDates: string[]  // YYYY-MM-DD array
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
      .update({
        skipped_dates: merged,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)

    if (updateError) return { error: updateError.message }

    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to skip delivery" }
  }
}

// ---------------------------------------------------------------------------
// Admin: Unskip a weekly delivery (remove from skipped_dates)
// ---------------------------------------------------------------------------
export async function adminUnskipWeeklyDelivery(
  subscriptionId: string,
  deliveryDate: string  // YYYY-MM-DD
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
      .update({
        skipped_dates: newSkipped,
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscriptionId)

    if (updateError) return { error: updateError.message }

    revalidatePath("/admin")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to unskip delivery" }
  }
}

// ---------------------------------------------------------------------------
// Admin: Set subscription status to "active" or "cancelled" (DB only).
// Do NOT pass "paused" here — use adminPauseSubscription instead,
// which also handles Stripe pause_collection correctly.
// ---------------------------------------------------------------------------
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
// Delivery management — get this week's delivery list
// Includes both active subscriptions AND confirmed one-time orders for the day
// Also includes cash customers and respects route_position ordering
// ---------------------------------------------------------------------------
export async function getDeliveryList(deliveryDay: "thursday" | "friday", deliveryDate: string): Promise<{
  data: DeliveryStop[]
  error: string | null
}> {
  try {
    const { supabase } = await requireAdmin()

    // ── 1. Active subscriptions for this delivery day ──────────────────────
    // Fetches active subs and filters out any that have this date in skipped_dates.
    const { data: subs, error: subsError } = await supabase
      .from("subscriptions")
      .select(`
        id,
        user_id,
        status,
        skipped_dates,
        subscription_items (product_name, size, quantity)
      `)
      .in("status", ["active"])
      .eq("delivery_day", deliveryDay)
      .eq("cancel_at_period_end", false)


    if (subsError) return { data: [], error: subsError.message }

    // ── 2. Confirmed one-time orders for this delivery day ─────────────────
    // Filter by delivery_date (the chosen delivery date) rather than placed_at
    // (which is the order creation time and may differ from the delivery date,
    // e.g. when an order is placed Wednesday night for the following Thursday).
    const { data: oneTimeOrders, error: ordersError } = await supabase
      .from("orders")
      .select(`
        id,
        user_id,
        delivery_address,
        delivery_city,
        delivery_zip,
        placed_at,
        delivery_date,
        order_items (product_name, size, quantity)
      `)
      .eq("delivery_day", deliveryDay)
      .eq("order_type", "one_time")
      .eq("status", "confirmed")
      .not("delivery_state", "eq", "delivered")
      .eq("delivery_date", deliveryDate)

    if (ordersError) return { data: [], error: ordersError.message }

    // ── 3. Fetch profiles for everyone ────────────────────────────────────
    const subUserIds = (subs ?? []).map((s) => s.user_id)
    const orderUserIds = (oneTimeOrders ?? []).map((o) => o.user_id)
    const allUserIds = [...new Set([...subUserIds, ...orderUserIds])]

    const { data: profiles } = allUserIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, first_name, last_name, address, city, zip, delivery_instructions, phone, is_cash_customer, route_position, admin_notes")
          .in("id", allUserIds)
      : { data: [] }

    const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

    // ── 4. Build subscription stops ────────────────────────────────────────
    // Exclude any subscription that has this specific date in its skipped_dates.
    // This handles partial pauses (e.g. skipping 2 of 4 weeks) gracefully.
    // Each sub becomes a partial stop entry keyed by user_id.
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

    // Subscription partials
    ;(subs ?? [])
      .filter((s) => {
        if (!profileMap[s.user_id]?.address) return false
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
          routePosition: p?.route_position ?? null,
          isOneTime: false,
        })
      })

    // ── 5. Build one-time order partials ──────────────────────────────────────
    // Skip orders whose customer profile no longer exists (e.g. deleted cash customer).
    // Without a profile there's no name, phone, delivery instructions, or route position,
    // so the stop would appear as "Unknown" and can't be acted on meaningfully.
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
          routePosition: p?.route_position ?? null,
          isOneTime: true,
        })
      })

    // ── 6. Group partial stops by customerId ───────────────────────────────
    // All subscriptions and one-time orders for the same user on the same
    // delivery day are merged into a single stop — items are combined and
    // type flags (hasSub / hasOneTime) reflect the mix.
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
        // Merge items into existing stop
        existing.items.push(...partial.items)
        existing.sourceIds.push(partial.sourceId)
        if (!partial.isOneTime) existing.hasSub = true
        if (partial.isOneTime) existing.hasOneTime = true
        // isOneTime = true only if ALL sources are one-time
        existing.isOneTime = !existing.hasSub
      }
    }

    const list: DeliveryStop[] = Array.from(stopMap.values())

    // Sort by route_position (nulls go to end), then by customer name as tiebreaker
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