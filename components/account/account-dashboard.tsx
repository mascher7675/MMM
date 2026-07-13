//components/account/account-dashboard.tsx
 
"use client"
 
import { useState, useEffect } from "react"
import type { User } from "@supabase/supabase-js"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SubscriptionPanel, type Subscription } from "./subscription-panel"
import { ContactPanel } from "./contact-panel"
import { LogOut, Settings, ShoppingBag, ChevronDown, ChevronUp, MapPin, CreditCard, Truck, XCircle, CheckCircle, Loader2 } from "lucide-react"
import { signOut } from "@/app/actions/auth"
import { requestOrderRefund } from "@/app/actions/messages"
import Link from "next/link"
 
interface Profile {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  address: string | null
  city: string | null
  zip: string | null
  delivery_instructions: string | null
}
 
interface OrderItem {
  id: string
  product_id: string
  product_name: string
  quantity: number
  price_cents: number
}
 
interface Order {
  id: string
  order_code: string | null
  status: string
  order_type: string
  total: number
  created_at: string
  placed_at: string | null
  delivery_date: string | null
  delivery_address: string | null
  delivery_city: string | null
  delivery_zip: string | null
  delivery_state: string | null
  stripe_payment_intent_id: string | null
  stripe_session_id: string | null
  stripe_receipt_url: string | null
  cancelled_at: string | null
  refund_amount_cents: number | null
  order_items: OrderItem[]
  // Server-derived: true if there's an unresolved refund_request message
  // tied to this order. Comes from the DB, not component state, so it
  // survives a page refresh — prevents duplicate refund requests.
  has_pending_refund_request?: boolean
}
 
interface AccountDashboardProps {
  user: User
  profile: Profile | null
  subscriptions: Subscription[]
  orders: Order[]
}
 
const DELIVERY_STATE_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  pending:          { label: "Preparing",        badgeClass: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  preparing:        { label: "Preparing",        badgeClass: "bg-blue-100 text-blue-800 border-blue-200" },
  out_for_delivery: { label: "Out for Delivery", badgeClass: "bg-purple-100 text-purple-800 border-purple-200" },
  delivered:        { label: "Delivered",        badgeClass: "bg-green-100 text-green-800 border-green-200" },
  failed:           { label: "Delivery Failed",  badgeClass: "bg-red-100 text-red-800 border-red-200" },
  cancelled:        { label: "Cancelled",        badgeClass: "bg-gray-100 text-gray-600 border-gray-200" },
}
 
// ---------------------------------------------------------------------------
// Returns true if the 5pm-day-before cutoff has passed for a given order.
// Uses delivery_date if present, falls back to placed_at date.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Deterministic date helpers — no toLocaleDateString() to avoid hydration
// mismatches between Node.js SSR and the browser.
// ---------------------------------------------------------------------------
const WEEKDAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
const MONTH_NAMES_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const MONTH_NAMES_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"]
 
function formatOrderDate(dateString: string): string {
  // "May 19, 2026" — replaces toLocaleDateString for order created_at
  const ymd = dateString.slice(0, 10).split("-").map(Number)
  return `${MONTH_NAMES_SHORT[ymd[1] - 1]} ${ymd[2]}, ${ymd[0]}`
}
 
function getCutoffDateMs(order: Order): number | null {
  const dateStr = order.delivery_date
    ?? (order.placed_at ? order.placed_at.slice(0, 10) : null)
  if (!dateStr) return null
  const deliveryDate = new Date(dateStr + "T12:00:00")
  const cutoff = new Date(deliveryDate)
  cutoff.setDate(cutoff.getDate() - 1)
  cutoff.setHours(17, 0, 0, 0)
  return cutoff.getTime()
}
 
function getCutoffLabel(order: Order): string {
  // "Wednesday, May 6th at 5pm" — deterministic, no toLocaleDateString
  const dateStr = order.delivery_date
    ?? (order.placed_at ? order.placed_at.slice(0, 10) : null)
  if (!dateStr) return "5pm the day before delivery"
  const deliveryDate = new Date(dateStr + "T12:00:00")
  const cutoff = new Date(deliveryDate)
  cutoff.setDate(cutoff.getDate() - 1)
  cutoff.setHours(17, 0, 0, 0)
  const day = cutoff.getDate()
  const suffix =
    day % 10 === 1 && day !== 11 ? "st" :
    day % 10 === 2 && day !== 12 ? "nd" :
    day % 10 === 3 && day !== 13 ? "rd" : "th"
  return `${WEEKDAY_NAMES[cutoff.getDay()]}, ${MONTH_NAMES_LONG[cutoff.getMonth()]} ${day}${suffix} at 5pm`
}
 
export function AccountDashboard({ user, profile, subscriptions, orders }: AccountDashboardProps) {
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())
  const [showAllOrders, setShowAllOrders] = useState(false)
 
  // Refund request state per order
  const [refundOpen, setRefundOpen]       = useState<Set<string>>(new Set())
  const [refundNote, setRefundNote]       = useState<Record<string, string>>({})
  const [refundSending, setRefundSending] = useState<Set<string>>(new Set())
  const [refundSent, setRefundSent]       = useState<Set<string>>(new Set())
  const [refundError, setRefundError]     = useState<Record<string, string>>({})
 
  const hasActiveSubscription = subscriptions.some(
    (s) => s.status === "active" && Array.isArray(s.subscription_items) && s.subscription_items.length > 0
  )
 
  // Use first active subscription for the contact panel
  const primarySubscription = subscriptions.find((s) => s.status === "active") ?? null
 
  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`
 
  // nowMs is null on SSR and set client-side — used for cutoff comparisons
  // to avoid new Date() hydration mismatches.
  const [nowMs, setNowMs] = useState<number | null>(null)
  useEffect(() => { setNowMs(Date.now()) }, [])
 
  const toggleOrder = (orderId: string) => {
    const newExpanded = new Set(expandedOrders)
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId)
    } else {
      newExpanded.add(orderId)
    }
    setExpandedOrders(newExpanded)
  }
 
  const getDeliveryBadge = (order: Order) => {
    const state = order.delivery_state
    if (!state || state === "pending") return null
    const config = DELIVERY_STATE_CONFIG[state]
    if (!config) return null
    return (
      <Badge variant="outline" className={`gap-1 text-xs ${config.badgeClass}`}>
        <Truck className="h-2.5 w-2.5" />
        {config.label}
      </Badge>
    )
  }
 
  // ── Refund request helpers ─────────────────────────────────────────────────
  const toggleRefundForm = (orderId: string) => {
    const next = new Set(refundOpen)
    next.has(orderId) ? next.delete(orderId) : next.add(orderId)
    setRefundOpen(next)
  }
 
  const handleRefundRequest = async (orderId: string) => {
    const sending = new Set(refundSending)
    sending.add(orderId)
    setRefundSending(sending)
    setRefundError((prev) => ({ ...prev, [orderId]: "" }))
 
    const result = await requestOrderRefund(orderId, refundNote[orderId] ?? "")
 
    const doneSending = new Set(refundSending)
    doneSending.delete(orderId)
    setRefundSending(doneSending)
 
    if (result.error) {
      setRefundError((prev) => ({ ...prev, [orderId]: result.error! }))
    } else {
      const sent = new Set(refundSent)
      sent.add(orderId)
      setRefundSent(sent)
      // Close form after success
      const close = new Set(refundOpen)
      close.delete(orderId)
      setRefundOpen(close)
    }
  }
 
  /**
   * A one-time order is eligible for a refund request if:
   * - It's a one-time order (not a subscription)
   * - It hasn't been cancelled yet
   * - It hasn't been delivered yet
   * - There isn't already a pending refund request for it (server-derived,
   *   not just this session — see has_pending_refund_request)
   */
  /**
   * True = show the "Request cancellation" button.
   * False AND pastCutoff = show "window closed" message instead.
   */
  const isRefundEligible = (order: Order) =>
    order.order_type === "one_time" &&
    order.status !== "cancelled" &&
    order.delivery_state !== "delivered" &&
    order.delivery_state !== "cancelled" &&
    !refundSent.has(order.id) &&
    !order.has_pending_refund_request

  // True when the order is a one-time that wasn't already cancelled/delivered
  // but the 5pm cutoff has already passed — we show a "window closed" note.
  const isPastCutoff = (order: Order, nowTimestamp: number | null) => {
    if (nowTimestamp === null) return false
    const cutoffMs = getCutoffDateMs(order)
    return (
      order.order_type === "one_time" &&
      order.status !== "cancelled" &&
      order.delivery_state !== "delivered" &&
      order.delivery_state !== "cancelled" &&
      !refundSent.has(order.id) &&
      !order.has_pending_refund_request &&
      cutoffMs !== null &&
      nowTimestamp >= cutoffMs
    )
  }
 
  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-2 text-sm uppercase tracking-[0.2em] text-sage">Your Account</p>
          <h1 className="font-serif text-3xl font-medium text-foreground md:text-4xl">
            Welcome{profile?.first_name ? `, ${profile.first_name}` : ""}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Manage your subscription and delivery details
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild className="gap-2 bg-transparent">
            <Link href="/account/settings">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </Button>
          <form action={signOut}>
            <Button variant="outline" type="submit" className="gap-2 bg-transparent cursor-pointer">
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </form>
        </div>
      </div>
 
      {/* Top row: Subscriptions */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl font-medium">Your Subscriptions</CardTitle>
          <CardDescription>
            {hasActiveSubscription
              ? "Manage your weekly milk delivery"
              : "Start your weekly milk delivery subscription"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubscriptionPanel
            userId={user.id}
            subscriptions={subscriptions}
          />
        </CardContent>
      </Card>
 
      {/* Bottom row: Order History + Contact Us */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Order History — takes up 2/3 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-serif text-xl font-medium">Order History</CardTitle>
            <CardDescription>View your past orders and their status</CardDescription>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <div className="py-8 text-center">
                <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-muted-foreground">No orders yet</p>
                <Button asChild className="mt-4">
                  <Link href="/shop">Shop Now</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.slice(0, showAllOrders ? orders.length : 5).map((order) => {
                  const isExpanded    = expandedOrders.has(order.id)
                  const deliveryBadge = getDeliveryBadge(order)
                  const totalQty      = order.order_items?.reduce((sum, i) => sum + (i.quantity || 0), 0) ?? 0
                  const isCancelled   = order.status === "cancelled" || order.delivery_state === "cancelled"
                  const cutoffMs      = getCutoffDateMs(order)
                  const pastCutoff    = nowMs !== null && cutoffMs !== null && nowMs >= cutoffMs
                  const eligible      = isRefundEligible(order) && !pastCutoff
                  const cutoffPassed  = isPastCutoff(order, nowMs)
                  const formOpen      = refundOpen.has(order.id)
                  const isSending     = refundSending.has(order.id)
                  const wasSent       = refundSent.has(order.id) || Boolean(order.has_pending_refund_request)
                  const errMsg        = refundError[order.id] ?? ""
 
                  return (
                    <div
                      key={order.id}
                      className={`rounded-lg border overflow-hidden ${
                        isCancelled
                          ? "border-gray-200 bg-gray-50/50"
                          : "border-border bg-secondary/30"
                      }`}
                    >
                      <button
                        onClick={() => toggleOrder(order.id)}
                        className="w-full flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-secondary/50 transition-colors cursor-pointer"
                      >
                        <div className="flex-1 text-left">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-foreground">
                              Order #{order.order_code ?? order.id.slice(-5).toUpperCase()}
                            </p>
                            <Badge
                              variant={order.status === "confirmed" ? "default" : "secondary"}
                              className={
                                order.status === "confirmed" ? "bg-sage text-sage-foreground" :
                                order.status === "cancelled" ? "bg-gray-100 text-gray-600 border border-gray-200" : ""
                              }
                            >
                              {order.status}
                            </Badge>
                            {order.order_type === "subscription" && (
                              <Badge variant="outline" className="text-xs">
                                Subscription
                              </Badge>
                            )}
                            {!isCancelled && deliveryBadge}
                            {/* Refund issued badge */}
                            {isCancelled && order.refund_amount_cents != null && (
                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                Refunded {formatPrice(order.refund_amount_cents)}
                              </Badge>
                            )}
                            {/* Request sent badge */}
                            {wasSent && (
                              <Badge variant="outline" className="gap-1 text-xs bg-amber-50 text-amber-700 border-amber-200">
                                <CheckCircle className="h-2.5 w-2.5" /> Refund request sent
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatOrderDate(order.created_at)} · {totalQty} item{totalQty !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="font-semibold text-foreground">
                            {formatPrice(order.total)}
                            {order.order_type === "subscription" && (
                              <span className="text-xs font-normal text-muted-foreground">/week</span>
                            )}
                          </p>
                          {isExpanded ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </button>
 
                      {isExpanded && (
                        <div className="border-t border-border bg-background/50 p-4 space-y-4">
                          {/* Order items */}
                          {order.order_items && order.order_items.length > 0 && (
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Items</p>
                              <div className="space-y-2">
                                {order.order_items.map((item) => (
                                  <div key={item.id} className="flex justify-between items-center text-sm">
                                    <div>
                                      <p className="text-foreground">{item.product_name}</p>
                                      <p className="text-muted-foreground text-xs">Qty: {item.quantity}</p>
                                    </div>
                                    <p className="font-medium text-foreground">
                                      {formatPrice(item.price_cents)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
 
                          {/* Delivery address */}
                          {order.delivery_address && (
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Delivery Address</p>
                              <p className="text-sm flex items-start gap-1.5 text-foreground">
                                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                                {order.delivery_address}{order.delivery_city ? `, ${order.delivery_city}` : ""}{order.delivery_zip ? ` ${order.delivery_zip}` : ""}
                              </p>
                            </div>
                          )}
 
                          {/* Payment / Receipt */}
                          {order.stripe_receipt_url ? (
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Payment</p>
                              <a
                                href={order.stripe_receipt_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-sm text-sage hover:underline"
                              >
                                <CreditCard className="h-3.5 w-3.5" />
                                View receipt
                              </a>
                              <p className="mt-1 text-xs text-muted-foreground">
                                A copy of this receipt was also sent to your email.
                              </p>
                            </div>
                          ) : order.stripe_payment_intent_id ? (
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Payment</p>
                              <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                                <CreditCard className="h-3.5 w-3.5" />
                                Paid via card — receipt sent to your email
                              </p>
                            </div>
                          ) : null}
 
                          {/* Delivery status */}
                          {order.delivery_state && order.delivery_state !== "pending" && (
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Delivery Status</p>
                              <p className="text-sm flex items-center gap-1.5">
                                <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                                {DELIVERY_STATE_CONFIG[order.delivery_state]?.label ?? order.delivery_state}
                              </p>
                            </div>
                          )}
 
                          {/* Cancellation info */}
                          {isCancelled && (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/30">
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                This {order.order_type === "subscription" ? "subscription " : ""}order was cancelled
                                {order.cancelled_at && (
                                  <> on {formatOrderDate(order.cancelled_at!)}</>
                                )}.
                              </p>
                              {order.refund_amount_cents != null && (
                                <p className="mt-0.5 text-sm font-medium text-blue-700 dark:text-blue-400">
                                  Refund of {formatPrice(order.refund_amount_cents)} has been issued to your original payment method.
                                </p>
                              )}
                            </div>
                          )}
 
                          {/* ── Refund request section ── */}
                          {cutoffPassed && (
                            <div className="border-t border-border pt-3">
                              <p className="text-xs text-muted-foreground">
                                The cancellation window for this order has passed ({getCutoffLabel(order)}).
                                To request a refund, please{" "}
                                <Link
                                  href="/#contact"
                                  className="underline hover:text-foreground"
                                >
                                  contact us
                                </Link>
                                .
                              </p>
                            </div>
                          )}
 
                          {eligible && (
                            <div className="border-t border-border pt-3">
                              {!formOpen && !wasSent && (
                                <button
                                  onClick={() => toggleRefundForm(order.id)}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  Request cancellation / refund
                                </button>
                              )}
 
                              {formOpen && (
                                <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
                                  <div>
                                    <p className="text-sm font-medium text-foreground">Request a cancellation or refund</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                      We'll review your request and process it as soon as possible. You'll be notified via email.
                                    </p>
                                  </div>
                                  <textarea
                                    value={refundNote[order.id] ?? ""}
                                    onChange={(e) => setRefundNote((prev) => ({ ...prev, [order.id]: e.target.value }))}
                                    placeholder="Optional: let us know why you're requesting a cancellation…"
                                    rows={3}
                                    className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sage/50"
                                  />
                                  {errMsg && (
                                    <p className="text-xs text-destructive">{errMsg}</p>
                                  )}
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => handleRefundRequest(order.id)}
                                      disabled={isSending}
                                      className="gap-2 bg-foreground text-background hover:bg-foreground/90"
                                    >
                                      {isSending ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <XCircle className="h-3.5 w-3.5" />
                                      )}
                                      {isSending ? "Sending…" : "Submit request"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => toggleRefundForm(order.id)}
                                      disabled={isSending}
                                      className="bg-transparent"
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}
 
                              {wasSent && (
                                <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 dark:border-green-800 dark:bg-green-950/30">
                                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                                  <div>
                                    <p className="text-sm font-medium text-green-800 dark:text-green-300">Request received!</p>
                                    <p className="text-xs text-green-700 dark:text-green-400">
                                      We'll review and process your cancellation / refund shortly.
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
 
                          {/* Order total */}
                          <div className="border-t border-border pt-3 flex justify-between text-sm font-medium">
                            <span>Order Total</span>
                            <span>{formatPrice(order.total)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {orders.length > 5 && (
                  <Button
                    variant="outline"
                    className="w-full bg-transparent cursor-pointer"
                    onClick={() => setShowAllOrders((v) => !v)}
                  >
                    {showAllOrders
                      ? "Show Less"
                      : `View All Orders (${orders.length})`}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
 
        {/* Contact Us — takes up 1/3 */}
        <Card id="contact-panel-card" className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="font-serif text-xl font-medium">Contact Us</CardTitle>
            <CardDescription>Get in touch with our team</CardDescription>
          </CardHeader>
          <CardContent>
            <ContactPanel
              userId={user.id}
              subscriptionId={primarySubscription?.id ?? null}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}