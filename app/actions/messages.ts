// app/actions/messages.ts

"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function sendMessage({
  type,
  subject,
  body,
  subscriptionId,
  orderId,
}: {
  type: "contact" | "pause_request" | "cancel_request" | "refund_request"
  subject?: string
  body: string
  subscriptionId?: string
  orderId?: string
}): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { error: "Not authenticated" }

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, email, phone")
      .eq("id", user.id)
      .single()

    const customerName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
      profile?.email ||
      user.email ||
      "Unknown"

    const customerEmail = profile?.email || user.email || ""
    const customerPhone = profile?.phone || null

    const { error: insertError } = await supabase.from("messages").insert({
      user_id: user.id,
      type,
      subject: subject || typeToSubject(type),
      body,
      customer_name: customerName,
      customer_email: customerEmail,
      phone: customerPhone,
      subscription_id: subscriptionId || null,
      order_id: orderId || null,
    })

    if (insertError) return { error: insertError.message }

    revalidatePath("/account")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to send message" }
  }
}

// ---------------------------------------------------------------------------
// Cutoff check: customers can only request cancellation before 5pm the day
// before their delivery date.
// ---------------------------------------------------------------------------
function isPastCancellationCutoff(deliveryDateStr: string | null): boolean {
  if (!deliveryDateStr) return false
  // deliveryDateStr is YYYY-MM-DD; interpret as local noon to avoid timezone drift
  const deliveryDate = new Date(deliveryDateStr + "T12:00:00")
  const cutoff = new Date(deliveryDate)
  cutoff.setDate(cutoff.getDate() - 1) // day before delivery
  cutoff.setHours(17, 0, 0, 0)         // 5:00 PM local time
  return new Date() >= cutoff
}

/**
 * Sends a cancellation/refund request for a specific one-time order.
 * Pulls order details from the DB server-side so the body is always accurate.
 */
export async function requestOrderRefund(
  orderId: string,
  customerNote: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { error: "Not authenticated" }

    // Fetch the order to verify ownership and get details for the message body
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, order_code, status, order_type, total, delivery_date, placed_at, order_items(product_name, quantity)")
      .eq("id", orderId)
      .eq("user_id", user.id)        // customers can only request for their own orders
      .eq("order_type", "one_time")  // only one-time orders
      .single()

    if (orderError || !order) return { error: "Order not found" }
    if (order.status === "cancelled") return { error: "This order has already been cancelled." }

    // Check the 5pm cutoff: cancellation must be requested before 5pm the day before delivery
    const cutoffDateStr = order.delivery_date ?? (order.placed_at ? order.placed_at.slice(0, 10) : null)
    if (isPastCancellationCutoff(cutoffDateStr)) {
      return { error: "The cancellation window has passed (5pm the day before delivery)." }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, email, phone")
      .eq("id", user.id)
      .single()

    const customerName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
      profile?.email || user.email || "Unknown"
    const customerEmail = profile?.email || user.email || ""
    const customerPhone = profile?.phone || null

    const orderRef = order.order_code ?? order.id.slice(-5).toUpperCase()
    const deliveryDateStr = order.delivery_date
      ? new Date(order.delivery_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
      : order.placed_at
        ? new Date(order.placed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "unknown date"
    const totalStr = `$${(order.total / 100).toFixed(2)}`
    const itemsSummary = (order.order_items ?? [])
      .map((i: { product_name: string; quantity: number }) => `${i.product_name} × ${i.quantity}`)
      .join(", ") || "—"

    const body = [
      `Order #${orderRef} — ${totalStr}`,
      `Delivery date: ${deliveryDateStr}`,
      `Items: ${itemsSummary}`,
      "",
      customerNote.trim() ? `Customer note: ${customerNote.trim()}` : "No additional note provided.",
    ].join("\n")

    const { error: insertError } = await supabase.from("messages").insert({
      user_id: user.id,
      type: "refund_request",
      subject: `Refund Request — Order #${orderRef}`,
      body,
      customer_name: customerName,
      customer_email: customerEmail,
      phone: customerPhone,
      order_id: orderId,
      subscription_id: null,
    })

    if (insertError) return { error: insertError.message }

    revalidatePath("/account")
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to send request" }
  }
}

function typeToSubject(type: string): string {
  switch (type) {
    case "pause_request":   return "Subscription Pause Request"
    case "cancel_request":  return "Subscription Cancellation Request"
    case "refund_request":  return "Order Refund / Cancellation Request"
    default:                return "Customer Message"
  }
}