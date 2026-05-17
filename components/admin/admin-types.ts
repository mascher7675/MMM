// components/admin/admin-types.ts
// Shared types, constants, and helpers used across admin components
 
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
 
/** Returns the next N upcoming Thursdays (day=4) and Fridays (day=5), sorted ascending */
export function getUpcomingThursFri(count = 8): { label: string; value: string; dayName: string }[] {
  const results: { label: string; value: string; dayName: string }[] = []
  const d = new Date()
  d.setHours(0, 0, 0, 0)
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