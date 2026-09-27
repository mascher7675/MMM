// components/admin/admin-types.ts
// Shared types, constants, and helpers used across admin components

import type { AdminOrder } from "@/app/actions/admin"
import { cutoffUnixForDeliveryDate } from "@/lib/delivery-utils"
 
export interface AdminStats {
  totalCustomers: number
  activeSubscriptions: number
  totalOrders: number
  unreadMessages: number
  weeklyRevenue: number
  allTimeRevenue: number
  weeklyOrders: number
  error: string | null
}
 
export type AdminTab = "overview" | "orders" | "subscriptions" | "customers" | "messages" | "delivery"
export type EditTab = "history" | "profile" | "add_order" | "add_subscription"
 
// ── Helpers ───────────────────────────────────────────────────────────────────
export const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`
export const fmtDate = (s: string) => {
  // Append T12:00:00 for plain YYYY-MM-DD strings to parse as local noon, not UTC midnight
  // (UTC midnight shifts the date back 1 day in US timezones like CST/CDT)
  const d = new Date(s.length === 10 ? s + "T12:00:00" : s)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

/**
 * The date to show for "when this order is placed" in the small header line.
 *
 * For one-time orders and cash subscriptions, that's simply created_at — the
 * card is charged (or the sale recorded) right then.
 *
 * For online subscription orders, `created_at` is when the row was
 * pre-created by the invoice.upcoming webhook, up to a week before Stripe
 * actually charges the card. The real charge happens at the 5 PM ET cutoff
 * the evening before delivery_date (isUpcoming/isAwaitingCharge above), so
 * that's the date shown instead — whether it's already happened or is still
 * to come.
 */
export function orderPlacedDate(order: AdminOrder): string {
  const isOnlineSubscription = order.order_type === "subscription" && !order.is_cash_customer && !!order.stripe_subscription_id
  const deliveryDate = order.delivery_date ?? order.placed_at?.slice(0, 10)

  if (isOnlineSubscription && deliveryDate) {
    const [y, m, d] = deliveryDate.split("-").map(Number)
    const chargeDate = new Date(y, m - 1, d - 1) // evening before delivery
    return chargeDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  return fmtDate(order.created_at)
}
 
// ── Constants ─────────────────────────────────────────────────────────────────
export const DELIVERY_STATE_LABELS: Record<string, { label: string; color: string }> = {
  pending:           { label: "Pending",           color: "bg-yellow-100 text-yellow-800" },
  preparing:         { label: "Preparing",         color: "bg-blue-100 text-blue-800" },
  out_for_delivery:  { label: "Out for Delivery",  color: "bg-purple-100 text-purple-800" },
  delivered:         { label: "Delivered",         color: "bg-green-100 text-green-800" },
  failed:            { label: "Failed",            color: "bg-red-100 text-red-800" },
  cancelled:         { label: "Cancelled",         color: "bg-gray-100 text-gray-600" },
}
 
export const STATUS_COLORS: Record<string, string> = {
  confirmed:  "bg-green-100 text-green-800",
  pending:    "bg-yellow-100 text-yellow-800",
  cancelled:  "bg-red-100 text-red-800",
  active:     "bg-green-100 text-green-800",
  paused:     "bg-yellow-100 text-yellow-800",
  unread:     "bg-red-100 text-red-800",
  read:       "bg-yellow-100 text-yellow-800",
  resolved:   "bg-green-100 text-green-800",
}
 
export const MSG_TYPE_LABEL: Record<string, string> = {
  contact:        "Contact",
  pause_request:  "Pause Request",
  cancel_request: "Cancel Request",
  refund_request: "Refund Request",
}
 
export const DELIVERY_DAYS = ["thursday", "friday"]
 
/**
 * Returns the next N upcoming Thursdays and Fridays, sorted ascending.
 * Admin version — no cutoff logic. Always includes today if it's a Thu/Fri,
 * so the admin can add a last-minute cash customer on the day of delivery.
 */
export function getUpcomingThursFri(count = 8): { label: string; value: string; dayName: string }[] {
  const results: { label: string; value: string; dayName: string }[] = []
  const d = new Date()
  d.setHours(0, 0, 0, 0) // start from today midnight — include today if it's Thu/Fri
  while (results.length < count) {
    const day = d.getDay()
    if (day === 4 || day === 5) {
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, "0")
      const dd = String(d.getDate()).padStart(2, "0")
      const value = `${yyyy}-${mm}-${dd}`
      const dayName = day === 4 ? "thursday" : "friday"
      const label = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
      results.push({ label, value, dayName })
    }
    d.setDate(d.getDate() + 1)
  }
  return results
}

// Weekly subscription orders are pre-created by the invoice.upcoming webhook
// about a week ahead, but Stripe doesn't charge the card until just after the
// 5 PM cutoff the evening before delivery. Until the payment is attached, the
// order hasn't been paid for — so it's kept out of the main list (shown only
// under the Orders tab's "Upcoming" filter) until its cutoff passes.
export function isAwaitingCharge(o: AdminOrder): boolean {
  return (
    o.order_type === "subscription" &&
    !o.is_cash_customer &&
    !!o.stripe_subscription_id &&
    o.status === "confirmed" &&
    !o.stripe_payment_intent_id
  )
}

export function isUpcoming(o: AdminOrder, nowUnix: number): boolean {
  if (!isAwaitingCharge(o)) return false
  const date = o.delivery_date ?? o.placed_at?.slice(0, 10)
  if (!date) return false
  return nowUnix < cutoffUnixForDeliveryDate(date)
}
